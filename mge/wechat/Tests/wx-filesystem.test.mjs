import {test} from 'bun:test';import assert from 'node:assert/strict';import {createWxFileSystem} from '../Host/wx-filesystem.mjs';
function fixture(options){
 const files=new Map([['package',{directory:true,size:0}],['package/a.json',{directory:false,size:10}],['user',{directory:true,size:0}],['user/profile.json',{directory:false,size:20}]]),calls=[];
 class ErrnoError extends Error{constructor(errno){super(String(errno));this.errno=errno;}}
 const nodes=[];const FS={ErrnoError,isDir:mode=>(mode&61440)===16384,createNode(parent,name,mode){const value={name,mode,parent,mount:parent?.mount};nodes.push(value);value.parent??=value;return value;}};
 const io=[],fds=new Map();let next=0;const wx={getFileSystemManager:()=>({readFileSync(path){io.push(['readFile',path]);const f=files.get(path);return (f.data??new Uint8Array(f.size)).slice().buffer;},openSync(o){io.push(['open',o.filePath]);if(o.flag==='wx+'){if(files.has(o.filePath))throw Error('already exist');files.set(o.filePath,{directory:false,size:0,data:new Uint8Array()});}fds.set(++next,o.filePath);return next;},closeSync(o){io.push(['close',fds.get(o.fd)]);fds.delete(o.fd);},readSync(o){io.push(['read',fds.get(o.fd)]);const f=files.get(fds.get(o.fd)),bytes=f.data??new Uint8Array(f.size),count=Math.max(0,Math.min(o.length,bytes.length-o.position));new Uint8Array(o.arrayBuffer).set(bytes.subarray(o.position,o.position+count),o.offset);return {bytesRead:count};},unlinkSync(path){io.push(['unlink',path]);if([...fds.values()].includes(path))throw Error('still open');files.delete(path);},writeSync(o){const path=fds.get(o.fd),f=files.get(path);io.push(['write',path]);if(f.failWrite)throw Error('write failed');const data=new Uint8Array(o.data,o.offset,o.length),bytes=new Uint8Array(Math.max(f.size,o.position+data.length));bytes.set(f.data??new Uint8Array(f.size));bytes.set(data,o.position);files.set(path,{directory:false,size:bytes.length,data:bytes});return {bytesWritten:data.length};},fstatSync(o){return {size:files.get(fds.get(o.fd)).size};},statSync(path){calls.push(path);const s=files.get(path);if(!s)throw Error('ENOENT');return {...s,isDirectory:()=>s.directory};}})};
 const adapter=createWxFileSystem(wx,FS,options);
 function mount(root,readonly){const mount={opts:{root,readonly}},node=adapter.backend.mount(mount);node.mount=mount;return node;}
 return {adapter,files,calls,mount,io,nodes};
}
test('immutable package metadata crosses wx only once per path',()=>{
 const {adapter,calls,mount}=fixture(),root=mount('package',true),ops=adapter.backend.node_ops;
 for(let i=0;i<20;i++){assert.equal(ops.getattr(root).size,0);const file=ops.lookup(root,'a.json');assert.equal(ops.getattr(file).size,10);}
 assert.deepEqual(calls,['package','package/a.json']);assert.equal(adapter.snapshot().packageStatEntries,2);
 adapter.dispose();assert.equal(adapter.snapshot().packageStatEntries,0);
});
test('user save metadata stays live and failed package lookups are not cached',()=>{
 const {adapter,files,calls,mount}=fixture(),root=mount('user',false),ops=adapter.backend.node_ops;
 const file=ops.lookup(root,'profile.json');assert.equal(ops.getattr(file).size,20);
 files.set('user/profile.json',{directory:false,size:45});assert.equal(ops.getattr(file).size,45);
 files.delete('user/profile.json');assert.throws(()=>ops.getattr(file),e=>e.errno===44);assert.equal(adapter.snapshot().packageStatEntries,0);
 const pkg=mount('package',true);assert.throws(()=>ops.lookup(pkg,'new.json'),e=>e.errno===44);
 files.set('package/new.json',{directory:false,size:7});assert.equal(ops.getattr(ops.lookup(pkg,'new.json')).size,7);
 assert.equal(calls.filter(x=>x==='package/new.json').length,2);
});

test('small immutable bytes retain stream offsets, seeks and independent cursors without wx fd churn',()=>{
 const {adapter,files,mount,io}=fixture(),root=mount('package',true),ops=adapter.backend.node_ops,streams=adapter.backend.stream_ops;
 files.set('package/a.json',{directory:false,size:10,data:Uint8Array.from({length:10},(_,i)=>i)});
 for(let i=0;i<30;i++){
  const stream={node:ops.lookup(root,'a.json'),flags:0,position:0};streams.open(stream);const buffer=new Uint8Array(20).fill(99);
  assert.equal(streams.read(stream,buffer,5,10,7),3);assert.deepEqual([...buffer.slice(4,9)],[99,7,8,9,99]);
  assert.equal(streams.read(stream,buffer,0,10,15),0);assert.equal(streams.llseek(stream,-2,2),8);streams.close(stream);
 }
 assert.deepEqual(io,[['readFile','package/a.json']]);assert.equal(adapter.snapshot().openFiles,0);assert.equal(adapter.snapshot().packageByteCacheBytes,10);
 adapter.dispose();assert.equal(adapter.snapshot().packageByteCacheBytes,0);
});
test('writable save files use live descriptors and bypass package caches',()=>{
 const {adapter,files,mount,io}=fixture(),ops=adapter.backend.node_ops,streams=adapter.backend.stream_ops;
 for(const [path,name,ro] of [['user','profile.json',false]]){
  files.set(path+'/'+name,{directory:false,size:2,data:new Uint8Array([2,3])});const root=mount(path,ro),stream={node:ops.lookup(root,name),flags:0,position:0};streams.open(stream);
  files.set(path+'/'+name,{directory:false,size:2,data:new Uint8Array([5,6])});const buffer=new Uint8Array(2);assert.equal(streams.read(stream,buffer,0,2,0),2);assert.deepEqual([...buffer],[5,6]);assert.equal(streams.llseek(stream,0,2),2);streams.close(stream);
 }
 assert.ok(io.every(x=>x[0]!=='readFile'));assert.equal(adapter.snapshot().packageByteCacheEntries,0);
});
test('immutable byte cache has a hard 1 MiB budget and excludes larger files',()=>{
 const {adapter,files,mount,io}=fixture(),root=mount('package',true),ops=adapter.backend.node_ops,streams=adapter.backend.stream_ops;
 for(let i=0;i<18;i++){const name='file'+i+'.json';files.set('package/'+name,{directory:false,size:65536});const stream={node:ops.lookup(root,name),flags:0,position:0};streams.open(stream);streams.close(stream);assert.ok(adapter.snapshot().packageByteCacheBytes<=1048576);}
 assert.equal(adapter.snapshot().packageByteCacheEntries,16);
 files.set('package/large.json',{directory:false,size:65537});const stream={node:ops.lookup(root,'large.json'),flags:0,position:0};streams.open(stream);streams.close(stream);
 assert.equal(io.at(-1)[0],'readFile');assert.equal(adapter.snapshot().packageByteCacheBytes,1048576);
});

test('immutable font aliases share immutable bytes while writable paths never alias',()=>{
 const {adapter,files,mount,io}=fixture({pathAliases:{'runtime/Content/AliasFonts':'runtime/Content/Fonts'}}),ops=adapter.backend.node_ops,streams=adapter.backend.stream_ops;
 files.set('runtime/Content',{directory:true,size:0});files.set('runtime/Content/Fonts',{directory:true,size:0});
 files.set('runtime/Content/Fonts/aeroBI.ttf',{directory:false,size:3,data:new Uint8Array([1,2,3])});
 const root=mount('runtime/Content',true),dir=ops.lookup(root,'AliasFonts'),font=ops.lookup(dir,'aeroBI.ttf'),stream={node:font,flags:0,position:0};
 streams.open(stream);const bytes=new Uint8Array(3);assert.equal(streams.read(stream,bytes,0,3,0),3);assert.deepEqual([...bytes],[1,2,3]);streams.close(stream);
 assert.equal(io[0][1],'runtime/Content/Fonts/aeroBI.ttf');assert.throws(()=>ops.lookup(mount('runtime/Content',false),'AliasFonts'),e=>e.errno===44);adapter.dispose();
});

test('remote directory union and file resolution stay read-only without MEMFS copies',()=>{
 const remote={resolve(path){return path==='runtime/Content/Battle/Game/a.json'?'user/cache/a.json':path;},directory(path){return ({'runtime/Content':['Battle'],'runtime/Content/Battle':['Game'],'runtime/Content/Battle/Game':['a.json']})[path]??null;}};
 const {adapter,files,mount}=fixture({remoteAssets:remote}),ops=adapter.backend.node_ops,streams=adapter.backend.stream_ops;
 files.set('runtime/Content',{directory:true,size:0});files.set('user/cache/a.json',{directory:false,size:3,data:new Uint8Array([9,8,7])});
 const root=mount('runtime/Content',true),battle=ops.lookup(root,'Battle'),game=ops.lookup(battle,'Game'),file=ops.lookup(game,'a.json');assert.equal(ops.getattr(file).size,3);assert.equal(ops.getattr(game).mode&61440,16384);const s={node:file,flags:0,position:0},b=new Uint8Array(3);streams.open(s);streams.read(s,b,0,3,0);streams.close(s);assert.deepEqual([...b],[9,8,7]);assert.throws(()=>ops.unlink(game,'a.json'),e=>e.errno===69);adapter.dispose();
});

test('full dynamic fonts are read once through aliases, independent streams preserve bytes and disposal releases cache',()=>{
 const {adapter,files,mount,io}=fixture({pathAliases:{'runtime/Content/AliasFonts':'runtime/Content/Fonts'}}),ops=adapter.backend.node_ops,streams=adapter.backend.stream_ops;
 files.set('runtime/Content',{directory:true,size:0});files.set('runtime/Content/Fonts',{directory:true,size:0});
 const bytes=Uint8Array.from({length:5594172},(_,i)=>i%251);files.set('runtime/Content/Fonts/full.ttf',{directory:false,size:bytes.length,data:bytes});
 const root=mount('runtime/Content',true);
 for(const dir of ['Fonts','AliasFonts','Fonts']){const s={node:ops.lookup(ops.lookup(root,dir),'full.ttf'),flags:0,position:0};streams.open(s);const copy=new Uint8Array(bytes.length);assert.equal(streams.read(s,copy,0,bytes.length,0),bytes.length);assert.deepEqual(copy,bytes);assert.equal(streams.llseek(s,-3,2),bytes.length-3);streams.close(s);}
 assert.deepEqual(io,[['readFile','runtime/Content/Fonts/full.ttf']]);assert.equal(adapter.snapshot().packageFontCacheBytes,bytes.length);adapter.dispose();assert.equal(adapter.snapshot().packageFontCacheBytes,0);
});

test('outline cache stays bounded; oversized package fonts are transient and writable fonts use descriptors',()=>{
 const {adapter,files,mount,io}=fixture(),ops=adapter.backend.node_ops,streams=adapter.backend.stream_ops;
 const root=mount('package',true);
 for(let i=0;i<6;i++){const name='face'+i+'.otf';files.set('package/'+name,{directory:false,size:3*1024*1024});const s={node:ops.lookup(root,name),flags:0,position:0};streams.open(s);streams.close(s);assert.ok(adapter.snapshot().packageFontCacheBytes<=8388608);assert.ok(adapter.snapshot().packageFontCacheEntries<=4);}
 for(const [base,name,ro] of [['package','huge.ttf',true],['user','mutable.ttf',false]]){files.set(base+'/'+name,{directory:false,size:8388609});const s={node:ops.lookup(mount(base,ro),name),flags:0,position:0};streams.open(s);streams.close(s);assert.equal(io.at(ro?-1:-2)[0],ro?'readFile':'open');}
 assert.equal(adapter.snapshot().packageByteCacheBytes,0);adapter.dispose();
});
test('writer lock activates scoped read coalescing while writes persist before close and errors invalidate cached metadata',()=>{
 const {adapter,files,mount,io}=fixture(),ops=adapter.backend.node_ops,streams=adapter.backend.stream_ops,root=mount('user',false);
 files.set('user/profile.json.lock',{directory:false,size:0});files.set('user/profile.json.bak',{directory:false,size:1,data:new Uint8Array([9])});
 const lock={node:ops.lookup(root,'profile.json.lock'),flags:2,position:0};streams.open(lock);assert.equal(adapter.snapshot().synchronousTransactions.active,1);
 for(let i=0;i<3;i++){const s={node:ops.lookup(root,'profile.json'),flags:0,position:0};streams.open(s);const data=new Uint8Array(20);assert.equal(streams.read(s,data,0,20,0),20);streams.close(s);}
 assert.equal(io.filter(x=>x[0]==='readFile'&&x[1]==='user/profile.json').length,1);assert.equal(io.filter(x=>x[0]==='open'&&x[1]==='user/profile.json').length,0);
 const node=ops.lookup(root,'profile.json.bak');assert.equal(ops.getattr(node).size,1);const w={node,flags:1,position:0};streams.open(w);assert.equal(streams.write(w,new Uint8Array([1,2,3]),0,3,0),3);assert.deepEqual([...files.get('user/profile.json.bak').data],[1,2,3]);assert.equal(ops.getattr(node).size,3);streams.close(w);
 files.set('user/profile.json.bak',{directory:false,size:3,failWrite:true});const fail={node,flags:1,position:0};streams.open(fail);assert.throws(()=>streams.write(fail,new Uint8Array([7]),0,1,0),e=>e.errno===29);streams.close(fail);streams.close(lock);assert.equal(adapter.snapshot().synchronousTransactions.active,0);assert.equal(adapter.snapshot().synchronousTransactions.bytes,0);assert.equal(adapter.snapshot().openFiles,0);adapter.dispose();
});
test('exclusive temporary create reuses one wx descriptor; unconsumed creates close with writer lock',()=>{
 const {adapter,files,mount,io,nodes}=fixture(),ops=adapter.backend.node_ops,streams=adapter.backend.stream_ops,root=mount('user',false);files.set('user/profile.json.lock',{directory:false,size:0});
 const lock={node:ops.lookup(root,'profile.json.lock'),flags:2,position:0};streams.open(lock);
 const node=ops.mknod(root,'profile.json.1.tmp',33279);assert.equal(adapter.snapshot().pendingCreatedFiles,1);const s={node,flags:1,position:0};streams.open(s);assert.equal(adapter.snapshot().pendingCreatedFiles,0);streams.write(s,new Uint8Array([1,2]),0,2,0);assert.deepEqual([...files.get('user/profile.json.1.tmp').data],[1,2]);streams.close(s);
 assert.deepEqual(io.filter(x=>x[1]==='user/profile.json.1.tmp').map(x=>x[0]),['open','write','close']);const count=nodes.length;assert.throws(()=>ops.mknod(root,'profile.json.1.tmp',33279),e=>e.errno===20);assert.equal(nodes.length,count,'Failed native create must not leave a filesystem node');
 ops.mknod(root,'profile.json.remove.tmp',33279);ops.unlink(root,'profile.json.remove.tmp');assert.equal(adapter.snapshot().pendingCreatedFiles,0);assert.equal(files.has('user/profile.json.remove.tmp'),false);ops.mknod(root,'profile.json.orphan.tmp',33279);assert.equal(adapter.snapshot().pendingCreatedFiles,1);streams.close(lock);assert.equal(adapter.snapshot().pendingCreatedFiles,0);assert.equal(adapter.snapshot().openFiles,0);assert.equal(io.at(-1)[1],'user/profile.json.orphan.tmp');adapter.dispose();
});
test('uncached packaged PNGs avoid local file descriptors, preserve seeks and release each stream',()=>{
 const {adapter,files,mount,io}=fixture(),ops=adapter.backend.node_ops,streams=adapter.backend.stream_ops,root=mount('package',true);
 files.set('package/cursor.png',{directory:false,size:5,data:new Uint8Array([1,2,3,4,5])});
 const a={node:ops.lookup(root,'cursor.png'),flags:0,position:0},b={node:ops.lookup(root,'cursor.png'),flags:0,position:0};streams.open(a);streams.open(b);
 const bytes=new Uint8Array(9).fill(99);assert.equal(streams.read(a,bytes,2,8,3),2);assert.deepEqual([...bytes.slice(1,5)],[99,4,5,99]);
 assert.equal(streams.llseek(b,-1,2),4);assert.equal(streams.read(b,bytes,0,3,8),0);
 assert.deepEqual(io.map(x=>x[0]),['readFile','readFile']);assert.equal(adapter.snapshot().packageByteCacheBytes,0);
 streams.close(a);assert.equal(a.wxPackageBytes,undefined);assert.equal(adapter.snapshot().openFiles,1);adapter.dispose();assert.equal(b.wxPackageBytes,undefined);assert.equal(adapter.snapshot().openFiles,0);
});

test('verified remote PNGs use transient stream bytes without per-chunk descriptor IPC',()=>{
 const remote={resolve(path){return path==='package/image.png'?'user/cache/image.png':path;}};
 const {adapter,files,mount,io}=fixture({remoteAssets:remote}),ops=adapter.backend.node_ops,streams=adapter.backend.stream_ops;
 files.set('user/cache/image.png',{directory:false,size:3,data:new Uint8Array([7,8,9])});
 const stream={node:ops.lookup(mount('package',true),'image.png'),flags:0,position:0};streams.open(stream);
 const bytes=new Uint8Array(3);assert.equal(streams.read(stream,bytes,0,3,0),3);assert.deepEqual([...bytes],[7,8,9]);streams.close(stream);
 assert.deepEqual(io.map(x=>x[0]),['readFile']);assert.equal(stream.wxPackageBytes,undefined);assert.equal(adapter.snapshot().packageByteCacheBytes,0);adapter.dispose();
});

test('exported local directories do not depend on native code-package stat or readdir',()=>{
 const {adapter,files,calls,mount}=fixture({packageFiles:['runtime/Content/runtime.assets.json','runtime/Content/News/ui.json','runtime/Content/Fonts/full.ttf']}),ops=adapter.backend.node_ops;
 // Reproduce a package backend that exposes files but does not expose directories.
 files.set('runtime/Content',{directory:false,size:123});
 files.set('runtime/Content/runtime.assets.json',{directory:false,size:2,data:new Uint8Array([123,125])});
 files.set('runtime/Content/News/ui.json',{directory:false,size:2});
 const root=mount('runtime/Content',true);
 assert.equal(ops.getattr(root).mode&61440,16384);assert.equal(ops.getattr(root).size,0);
 assert.deepEqual(ops.readdir(root),['.','..','runtime.assets.json','News','Fonts']);
 const news=ops.lookup(root,'News');assert.equal(ops.getattr(news).mode&61440,16384);
 assert.deepEqual(ops.readdir(news),['.','..','ui.json']);
 assert.equal(ops.getattr(ops.lookup(root,'runtime.assets.json')).size,2);
 assert.deepEqual(calls,['runtime/Content/runtime.assets.json']);
 assert.equal(adapter.snapshot().packageIndexedFiles,3);adapter.dispose();assert.equal(adapter.snapshot().packageIndexedDirectories,0);
});

test('an indexed file still needs native metadata and bytes; unknown directories are not fabricated',()=>{
 const {adapter,files,mount}=fixture({packageFiles:['runtime/Content/runtime.assets.json']}),ops=adapter.backend.node_ops;
 const root=mount('runtime/Content',true);
 assert.throws(()=>ops.lookup(root,'runtime.assets.json'),e=>e.errno===44);
 assert.throws(()=>ops.lookup(root,'unknown'),e=>e.errno===44);
 files.set('runtime/Content/runtime.assets.json',{directory:false,size:2,data:new Uint8Array([123,125])});
 const stream={node:ops.lookup(root,'runtime.assets.json'),flags:0,position:0},data=new Uint8Array(2);adapter.backend.stream_ops.open(stream);adapter.backend.stream_ops.read(stream,data,0,2,0);assert.deepEqual([...data],[123,125]);adapter.dispose();
});

test('local directory index preserves font aliases, remote union, and writable native directory checks',()=>{
 const remote={resolve:path=>path,directory:path=>path==='runtime/Content'?['RemoteBattle']:null};
 const {adapter,files,mount}=fixture({packageFiles:['runtime/Content/Fonts/full.ttf'],pathAliases:{'runtime/Content/AliasFonts':'runtime/Content/Fonts'},remoteAssets:remote}),ops=adapter.backend.node_ops;
 const root=mount('runtime/Content',true);
 assert.deepEqual(ops.readdir(root),['.','..','Fonts','RemoteBattle','AliasFonts']);
 assert.equal(ops.getattr(ops.lookup(root,'AliasFonts')).mode&61440,16384);
 files.set('runtime/Content',{directory:false,size:1});
 assert.equal(ops.getattr(mount('runtime/Content',false)).mode&61440,32768,'UserData/native mounts must not inherit immutable directory index');
 adapter.dispose();
});

test('package directory index rejects traversal, ambiguous paths and file/directory collisions',()=>{
 for(const packageFiles of [null,['../bad'],['runtime/Content/../bad'],['runtime/Content//bad'],['runtime/Content/./bad'],['runtime/Content/a','runtime/Content/a'],['runtime/Content/a','runtime/Content/a/b']])assert.throws(()=>fixture({packageFiles}),/Invalid package file index|collision/);
});


test('indexed remote-only directories also override opaque native package metadata',()=>{
 const remote={resolve:path=>path,directory:path=>path==='runtime/Content/RemoteOnly'?['remote.json']:null};
 const {adapter,files,mount}=fixture({packageFiles:['runtime/Content/runtime.assets.json'],remoteAssets:remote}),ops=adapter.backend.node_ops;
 files.set('runtime/Content/RemoteOnly',{directory:false,size:0});
 const node=ops.lookup(mount('runtime/Content',true),'RemoteOnly');
 assert.equal(ops.getattr(node).mode&61440,16384); assert.deepEqual(ops.readdir(node),['.','..','remote.json']);
 assert.throws(()=>ops.lookup(node,'missing.json'),e=>e.errno===44);
 adapter.dispose();
});

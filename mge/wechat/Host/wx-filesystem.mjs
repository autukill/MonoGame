import {createSynchronousTransactions} from './wx-sync-transactions.mjs';
// Emscripten filesystem backend, following NODEFS's node/stream contract.
// User files go directly to wx persistent storage; package mounts are read-only.
// No MEMFS mirror and no delayed sync-on-hide which can lose committed saves.
export function createWxFileSystem(wx,FS,{pathAliases={},remoteAssets=null,packageFiles=[]}={}){
 // UI packages have distinct build paths but share the same immutable font bytes.
 function packagePath(path){let local=path;for(const[from,to]of Object.entries(pathAliases))if(path===from||path.startsWith(from+'/')){local=to+path.slice(from.length);break;}return remoteAssets?remoteAssets.resolve(local):local;}
 // Code-package directories are virtual on the device. Build only directories
 // implied by the exporter-provided local file list; never infer missing files.
 // Mutable UserData and downloaded remote files still use native wx metadata.
 const packageDirectories=new Map(),packageFilePaths=new Set();
 if(!Array.isArray(packageFiles))throw Error('Invalid package file index');
 for(const file of packageFiles){
  if(typeof file!=='string'||!/^runtime\/[a-zA-Z0-9_.\/-]+$/.test(file)||file.split('/').some(part=>!part||part==='.'||part==='..')||packageFilePaths.has(file))throw Error('Invalid package file index entry');
  packageFilePaths.add(file);
  const parts=file.split('/');
  for(let i=1;i<parts.length;i++){
   const directory=parts.slice(0,i).join('/');
   if(!packageDirectories.has(directory))packageDirectories.set(directory,new Set());
   packageDirectories.get(directory).add(parts[i]);
  }
 }
 for(const file of packageFilePaths)if(packageDirectories.has(file))throw Error('Package file/directory collision');
 const fs=wx.getFileSystemManager(),open=new Set(),created=new Map(),packageStats=new Map(),packageBytes=new Map(),fontBytes=new Map();let packageByteCount=0,fontByteCount=0;const transactions=createSynchronousTransactions(fs);
 // Code-package mounts are immutable for this runtime. Avoid repeated native wx
 // IPC for File.Exists / FileInfo / seek metadata. UserData always queries wx.
 function stat(path,readOnly){
  if(!readOnly)return transactions.stat(path);
  path=packagePath(path);
  if(!packageStats.has(path)){if(packageDirectories.has(path)||remoteAssets?.directory?.(path))packageStats.set(path,{size:0,lastModifiedTime:0,isDirectory:()=>true});else try{packageStats.set(path,fs.statSync(path,false));}catch(error){if(!/no such|not exist|ENOENT/i.test(error.errMsg||String(error))||!remoteAssets?.directory?.(path))throw error;packageStats.set(path,{size:0,isDirectory:()=>true});}}
  return packageStats.get(path);
 }
 // Keep full dynamic outline fonts once per immutable package path. UI documents
 // hash the same source repeatedly; crossing wx with 5.6 MB on every open stalls
 // scene Configure. Separate 8 MiB / 4-entry LRU; no glyph subset or RGBA cache.
 // Other small immutable manifests/audio headers keep their 1 MiB / 256 cap.
 function cachedPackageFile(node){
  if(!readonly(node))return null;
  const font=/[.](ttf|otf)$/i.test(node.name),small=/[.](json|wav|mgfxo)$/i.test(node.name);
  if(!font&&!small)return null;
  const full=path(node),size=stat(full,true).size,cache=font?fontBytes:packageBytes,budget=font?8388608:1048576,limit=font?4:256;
  if(size>(font?budget:65536)||size<0)return null;
  if(cache.has(full)){const bytes=cache.get(full);cache.delete(full);cache.set(full,bytes);return bytes;}
  const value=fs.readFileSync(full);
  if(!value||!Number.isInteger(value.byteLength))throw Error('Expected binary package file');
  const bytes=ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength).slice():new Uint8Array(value);
  if(bytes.byteLength!==size)throw Error('Immutable package file size changed');
  let count=font?fontByteCount:packageByteCount;
  while(count+size>budget||cache.size>=limit){const key=cache.keys().next().value;count-=cache.get(key).byteLength;cache.delete(key);}
  cache.set(full,bytes);count+=size;if(font)fontByteCount=count;else packageByteCount=count;return bytes;
 } const convert=error=>{
  if(error instanceof FS.ErrnoError)return error;
  const n=error?.errno??error?.errCode,msg=error?.errMsg||error?.message||String(error);
  const errno=({1300002:44,1300009:8,1300013:2,1300014:2,1300020:54,1300021:31,1300022:28,1300066:55,1300202:51,1301005:20})[n]
   ??(/no such|not exist|ENOENT/i.test(msg)?44:/already exist/i.test(msg)?20:/permission/i.test(msg)?2:29);
  return new FS.ErrnoError(errno);
 };
 // Immutable assets (code package or verified remote version) use one native read.
 // Retain uncached encoded bytes only for the lifetime of one open stream;
 // images never join the persistent byte LRU or the writable UserData path.
 function packageStreamBytes(node){
  if(!readonly(node))return null;
  const full=path(node); // Verified remote package files are immutable too.
  const value=fs.readFileSync(full);
  if(!value||!Number.isInteger(value.byteLength))throw Error('Expected binary package file');
  const bytes=ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):new Uint8Array(value);
  if(bytes.byteLength!==stat(full,true).size)throw Error('Immutable package file size changed');
  return bytes;
 }
 const call=fn=>{try{return fn();}catch(error){throw convert(error);}};
 function path(node){const parts=[];while(node.parent!==node){parts.push(node.name);node=node.parent;}const full=node.mount.opts.root+(parts.length?'/'+parts.reverse().join('/'):'');return node.mount.opts.readonly?packagePath(full):full;}
 const readonly=node=>!!node.mount.opts.readonly;
 function writable(node){if(readonly(node))throw new FS.ErrnoError(69);}
 function mode(s,readOnly){return (s.isDirectory()?16384:32768)|(readOnly?365:511);}
 function node(parent,name,bits){const value=FS.createNode(parent,name,bits,0);value.node_ops=backend.node_ops;value.stream_ops=backend.stream_ops;return value;}
 // Emscripten open(O_CREAT) calls mknod then stream.open synchronously. Carry
 // the exclusive wx+ descriptor into that stream instead of close/reopen. Any
 // unconsumed descriptor is bounded and closed when the writer lock closes.
 function closeCreated(predicate=()=>true){let failure;for(const [value,fd] of created){if(!predicate(value))continue;try{fs.closeSync({fd});}catch(error){failure??=error;}finally{created.delete(value);}}if(failure)throw failure;}
 const backend={
  mount(mount){return call(()=>node(null,'/',mode(stat(mount.opts.root,mount.opts.readonly),mount.opts.readonly)));},
  node_ops:{
   getattr(value){return call(()=>{const s=stat(path(value),readonly(value)),time=new Date((s.lastModifiedTime||0)*1000);return {dev:1,ino:value.id,mode:mode(s,readonly(value)),nlink:1,uid:0,gid:0,rdev:0,size:s.size,atime:time,mtime:time,ctime:time,blksize:4096,blocks:Math.ceil(s.size/4096)};});},
   setattr(value,attr){writable(value);return call(()=>{if(attr.size!==undefined){transactions.invalidate(path(value));fs.truncateSync({filePath:path(value),length:attr.size});}if(attr.mode!==undefined)value.mode=attr.mode;});},
   lookup(parent,name){return call(()=>node(parent,name,mode(stat(path(parent)+'/'+name,readonly(parent)),readonly(parent))));},
   mknod(parent,name,bits){writable(parent);return call(()=>{const destination=path(parent)+'/'+name;transactions.invalidate(destination);let fd;if(FS.isDir(bits))fs.mkdirSync(destination,false);else fd=fs.openSync({filePath:destination,flag:'wx+'});let value;try{value=node(parent,name,bits);}catch(error){if(fd!==undefined)fs.closeSync({fd});throw error;}if(fd!==undefined){if(transactions.contains(destination)&&created.size<32)created.set(value,fd);else fs.closeSync({fd});}return value;});},
   rename(value,parent,name){writable(value);writable(parent);return call(()=>{closeCreated(node=>node===value);transactions.invalidate(path(value),path(parent)+'/'+name);fs.renameSync(path(value),path(parent)+'/'+name);value.name=name;value.parent=parent;});},
   unlink(parent,name){writable(parent);return call(()=>{closeCreated(node=>node.parent===parent&&node.name===name);transactions.invalidate(path(parent)+'/'+name);return fs.unlinkSync(path(parent)+'/'+name);});},
   rmdir(parent,name){writable(parent);return call(()=>{transactions.invalidate(path(parent)+'/'+name);return fs.rmdirSync(path(parent)+'/'+name,false);});},
   readdir(value){return call(()=>{const full=path(value),extra=readonly(value)?remoteAssets?.directory?.(full):null;let local;try{local=readonly(value)&&(packageDirectories.has(full)||packageFilePaths.size>0&&extra)?[...(packageDirectories.get(full)||[])]:fs.readdirSync(full);}catch(error){if(!extra||!/no such|not exist|ENOENT/i.test(error.errMsg||String(error)))throw error;local=[];}return [...new Set(['.','..',...local,...(extra||[]),...(readonly(value)?Object.keys(pathAliases).filter(x=>x.slice(0,x.lastIndexOf('/'))===full).map(x=>x.slice(x.lastIndexOf('/')+1)):[])])];});},
   symlink(){throw new FS.ErrnoError(52);},readlink(){throw new FS.ErrnoError(28);},
  },
  stream_ops:{
   open(stream){if(FS.isDir(stream.node.mode))return;if((stream.flags&3)!==0)writable(stream.node);call(()=>{const bytes=cachedPackageFile(stream.node)??packageStreamBytes(stream.node)??((stream.flags&3)===0?transactions.read(path(stream.node)):null);if(bytes!==null)stream.wxPackageBytes=bytes;else {if(created.has(stream.node)){stream.wxFd=created.get(stream.node);created.delete(stream.node);}else stream.wxFd=fs.openSync({filePath:path(stream.node),flag:(stream.flags&3)?'r+':'r'});stream.wxTransaction=(stream.flags&3)?transactions.begin(path(stream.node)):null;}open.add(stream);});},
   close(stream){if(stream.wxPackageBytes!==undefined){delete stream.wxPackageBytes;open.delete(stream);return;}if(stream.wxFd!==undefined)call(()=>{try{fs.closeSync({fd:stream.wxFd});}finally{try{if(stream.wxTransaction)closeCreated();}finally{transactions.end(stream.wxTransaction);delete stream.wxTransaction;open.delete(stream);delete stream.wxFd;}}});},
   read(stream,buffer,offset,length,position){if(!length)return 0;if(stream.wxPackageBytes!==undefined){const bytes=stream.wxPackageBytes,count=Math.max(0,Math.min(length,bytes.length-position));buffer.set(bytes.subarray(position,position+count),offset);return count;}return call(()=>{const chunk=new ArrayBuffer(length),r=fs.readSync({fd:stream.wxFd,arrayBuffer:chunk,offset:0,length,position});buffer.set(new Uint8Array(chunk,0,r.bytesRead),offset);return r.bytesRead;});},
   write(stream,buffer,offset,length,position){writable(stream.node);if(!length)return 0;return call(()=>{transactions.invalidate(path(stream.node));return fs.writeSync({fd:stream.wxFd,data:buffer.slice(offset,offset+length).buffer,offset:0,length,position}).bytesWritten;});},
   llseek(stream,offset,whence){return call(()=>{const position=whence===1?stream.position+offset:whence===2?(stream.wxPackageBytes?.length??fs.fstatSync({fd:stream.wxFd}).size)+offset:offset;if(position<0)throw new FS.ErrnoError(28);return position;});},
   fsync(){return 0;},
  },
 };
 return {backend,mount(target,root,readOnly=false){FS.mkdirTree(target);FS.mount(backend,{root,readonly:readOnly},target);},dispose(){try{for(const stream of [...open])backend.stream_ops.close(stream);}finally{try{closeCreated();}finally{transactions.dispose();}packageStats.clear();packageDirectories.clear();packageFilePaths.clear();packageBytes.clear();fontBytes.clear();packageByteCount=0;fontByteCount=0;}},snapshot(){return {openFiles:open.size,pendingCreatedFiles:created.size,packageStatEntries:packageStats.size,packageIndexedDirectories:packageDirectories.size,packageIndexedFiles:packageFilePaths.size,packageByteCacheEntries:packageBytes.size,packageByteCacheBytes:packageByteCount,packageFontCacheEntries:fontBytes.size,packageFontCacheBytes:fontByteCount,synchronousTransactions:transactions.snapshot()};}};
}

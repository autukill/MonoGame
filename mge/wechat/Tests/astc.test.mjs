import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../native/opengl/MGG_OpenGL.cpp',import.meta.url),'utf8');
const body=source.slice(source.indexOf('int MGG_WeChat_ProbeAstc')).match(/return EM_ASM_INT\(\{([\s\S]*?)\},block/)[1];
const execute=new Function('GL','$0','$1','$2','$3','console',body);
const events=[];
const probe=(...args)=>execute(...args,{info:line=>events.push(JSON.parse(line.slice(line.indexOf('{'))))});
test('ASTC probes actual context, valid blocks and both color spaces; restores native binding',()=>{
 for(const profiles of [true,false])for(const block of [4,6])for(const srgb of [0,1])for(const [w,h] of [[1,1],[7,5],[6,6]]){
  const format=(srgb?0x93D0:0x93B0)+(block===6?4:0),old={},texture={};let bound=old,deleted=false;
  const gl={TEXTURE_BINDING_2D:1,COMPRESSED_TEXTURE_FORMATS:2,TEXTURE_2D:3,NO_ERROR:0,
   getExtension:name=>{assert.equal(name,'WEBGL_compressed_texture_astc');return profiles?{getSupportedProfiles:()=>['ldr']}:{};},
   getParameter:p=>p===1?bound:new Uint32Array([format]),createTexture:()=>texture,bindTexture:(t,v)=>{bound=v;},deleteTexture:t=>{assert.equal(t,texture);deleted=true;},getError:()=>0,
   texStorage2D:(t,l,f,x,y)=>{assert.equal(f,format);assert.equal(x,w);assert.equal(y,h);},
   compressedTexSubImage2D:(t,l,x,y,w2,h2,f,bytes)=>{assert.equal(f,format);assert.equal(w2,w);assert.equal(h2,h);assert.equal(bytes.length,Math.ceil(w/block)*Math.ceil(h/block)*16);assert.equal(bytes[0],252);assert.equal(bytes[1],253);}};
  assert.equal(probe({currentContext:{GLctx:gl}},block,srgb,w,h),1);assert.equal(bound,old);assert.equal(deleted,true);
 }
});
test('incomplete WeChat contexts and throwing upload paths fall back without leaking probe textures',()=>{
 const old={},texture={};let bound=old,deleted=0,uploads=0;
 const gl={TEXTURE_BINDING_2D:1,COMPRESSED_TEXTURE_FORMATS:2,TEXTURE_2D:3,NO_ERROR:0,
  getExtension:()=>({}),getParameter:p=>p===1?bound:[0x93B0],createTexture:()=>texture,
  bindTexture:(t,v)=>{bound=v;},deleteTexture:t=>{assert.equal(t,texture);deleted++;},
  texStorage2D(){},compressedTexSubImage2D(){uploads++;throw Error('unsupported native upload');},getError:()=>0};
 assert.equal(probe({currentContext:{GLctx:gl}},4,0,4,4),0);
 assert.equal(bound,old);assert.equal(deleted,1);assert.equal(uploads,1);
 for(const ext of [{getSupportedProfiles:()=>['hdr']},{getSupportedProfiles(){throw Error('profile API unavailable');}}]){
  assert.equal(probe({currentContext:{GLctx:{...gl,getExtension:()=>ext}}},4,0,4,4),0);
 }
 assert.equal(probe({currentContext:{GLctx:{...gl,getParameter:()=>null}}},4,0,4,4),0);
 assert.equal(probe({currentContext:{GLctx:{getExtension(){throw Error('lost context');}}}},4,0,4,4),0);
 assert.equal(deleted,2);assert.equal(uploads,2);
});
test('missing extension or actual upload error returns unsupported',()=>{
 assert.equal(probe({},4,1,4,4),0);
 assert.equal(probe({currentContext:{GLctx:{getError:()=>0,getExtension:()=>null}}},6,1,6,6),0);
 const gl={getExtension:()=>({getSupportedProfiles:()=>['ldr']}),getParameter:()=>[0x93B0],createTexture:()=>1,bindTexture(){},deleteTexture(){},texStorage2D(){},compressedTexSubImage2D(){},getError:()=>1280,NO_ERROR:0};
 assert.equal(probe({currentContext:{GLctx:gl}},4,0,4,4),0);
});
test('prior GL errors are isolated from valid ASTC uploads and failures report the exact phase',()=>{
 let error=1280,deleted=0;
 const gl={TEXTURE_BINDING_2D:1,COMPRESSED_TEXTURE_FORMATS:2,TEXTURE_2D:3,
  getError:()=>{const value=error;error=0;return value;},getExtension:()=>({}),
  getParameter:p=>p===2?[0x93B0]:null,createTexture:()=>({}),bindTexture(){},deleteTexture(){deleted++;},
  texStorage2D(){},compressedTexSubImage2D(){}};
 assert.equal(probe({currentContext:{GLctx:gl}},4,0,4,4),1);
 let detail=JSON.parse(events.at(-1).detail);assert.deepEqual(detail.priorErrors,[1280]);assert.equal(detail.phase,'complete');
 gl.texStorage2D=()=>{error=1280;};
 assert.equal(probe({currentContext:{GLctx:gl}},4,0,4,4),0);
 detail=JSON.parse(events.at(-1).detail);assert.equal(detail.reason,'storage-error');assert.equal(detail.glError,1280);
 gl.texStorage2D=()=>{};gl.compressedTexSubImage2D=()=>{error=1282;};
 assert.equal(probe({currentContext:{GLctx:gl}},4,0,4,4),0);
 detail=JSON.parse(events.at(-1).detail);assert.equal(detail.reason,'upload-error');assert.equal(detail.glError,1282);
 gl.getParameter=()=>[];gl.compressedTexSubImage2D=()=>{};
 assert.equal(probe({currentContext:{GLctx:gl}},4,0,4,4),1);
 assert.equal(JSON.parse(events.at(-1).detail).formatAdvertised,false);assert.equal(deleted,4);
});
test('WeChat zero format enumeration uses actual uploads, retaining driver error rejection',()=>{
 for(const block of [4,6])for(const srgb of [0,1])for(const [width,height] of [[1,1],[7,5],[12,12]]){
  const format=(srgb?0x93D0:0x93B0)+(block===6?4:0),old={};let bound=old,error=0,deleted=0,uploads=0;
  const gl={TEXTURE_BINDING_2D:1,COMPRESSED_TEXTURE_FORMATS:2,TEXTURE_2D:3,
   getExtension:()=>({}),getParameter:p=>p===2?[0,0]:bound,getError:()=>{const value=error;error=0;return value;},
   createTexture:()=>({}),bindTexture:(t,v)=>{bound=v;},deleteTexture(){deleted++;},
   texStorage2D:(t,n,f)=>assert.equal(f,format),compressedTexSubImage2D:(t,l,x,y,w,h,f)=>{assert.equal(f,format);uploads++;}};
  assert.equal(probe({currentContext:{GLctx:gl}},block,srgb,width,height),1);
  let detail=JSON.parse(events.at(-1).detail);assert.deepEqual(detail.formats,[0,0]);assert.equal(detail.formatAdvertised,false);assert.equal(detail.phase,'complete');assert.equal(bound,old);
  gl.texStorage2D=()=>{error=1280;};
  assert.equal(probe({currentContext:{GLctx:gl}},block,srgb,width,height),0);
  assert.equal(JSON.parse(events.at(-1).detail).reason,'storage-error');assert.equal(uploads,1);
  gl.texStorage2D=()=>{};gl.compressedTexSubImage2D=()=>{error=1282;};
  assert.equal(probe({currentContext:{GLctx:gl}},block,srgb,width,height),0);
  assert.equal(JSON.parse(events.at(-1).detail).reason,'upload-error');assert.equal(deleted,3);assert.equal(bound,old);
  gl.getParameter=p=>{if(p===2)throw Error('unsupported enumeration');return bound;};gl.compressedTexSubImage2D=()=>{};
  assert.equal(probe({currentContext:{GLctx:gl}},block,srgb,width,height),1);
  assert.match(JSON.parse(events.at(-1).detail).formatQueryException,/unsupported enumeration/);
  gl.getParameter=p=>{if(p===2){error=1280;return [0,0];}return bound;};
  assert.equal(probe({currentContext:{GLctx:gl}},block,srgb,width,height),1);
  assert.equal(JSON.parse(events.at(-1).detail).formatQueryError,1280);
  gl.getParameter=p=>{if(p===2){error=0x9242;return [0,0];}return bound;};
  assert.equal(probe({currentContext:{GLctx:gl}},block,srgb,width,height),0);
  assert.equal(JSON.parse(events.at(-1).detail).reason,'context-lost');
 }
});

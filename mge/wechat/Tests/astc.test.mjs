import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../native/opengl/MGG_OpenGL.cpp',import.meta.url),'utf8');
const body=source.slice(source.indexOf('int MGG_WeChat_ProbeAstc')).match(/return EM_ASM_INT\(\{([\s\S]*?)\},block/)[1];
const probe=new Function('GL','$0','$1','$2','$3',body);
test('ASTC probes actual context, valid blocks and both color spaces; restores native binding',()=>{
 for(const block of [4,6])for(const srgb of [0,1])for(const [w,h] of [[1,1],[7,5],[6,6]]){
  const format=(srgb?0x93D0:0x93B0)+(block===6?4:0),old={},texture={};let bound=old,deleted=false;
  const gl={TEXTURE_BINDING_2D:1,COMPRESSED_TEXTURE_FORMATS:2,TEXTURE_2D:3,NO_ERROR:0,
   getExtension:name=>{assert.equal(name,'WEBGL_compressed_texture_astc');return {getSupportedProfiles:()=>['ldr']};},
   getParameter:p=>p===1?bound:new Uint32Array([format]),createTexture:()=>texture,bindTexture:(t,v)=>{bound=v;},deleteTexture:t=>{assert.equal(t,texture);deleted=true;},getError:()=>0,
   texStorage2D:(t,l,f,x,y)=>{assert.equal(f,format);assert.equal(x,w);assert.equal(y,h);},
   compressedTexSubImage2D:(t,l,x,y,w2,h2,f,bytes)=>{assert.equal(f,format);assert.equal(w2,w);assert.equal(h2,h);assert.equal(bytes.length,Math.ceil(w/block)*Math.ceil(h/block)*16);assert.equal(bytes[0],252);assert.equal(bytes[1],253);}};
  assert.equal(probe({currentContext:{GLctx:gl}},block,srgb,w,h),1);assert.equal(bound,old);assert.equal(deleted,true);
 }
});
test('missing extension or actual upload error returns unsupported',()=>{
 assert.equal(probe({},4,1,4,4),0);
 assert.equal(probe({currentContext:{GLctx:{getExtension:()=>null}}},6,1,6,6),0);
 const gl={getExtension:()=>({getSupportedProfiles:()=>['ldr']}),getParameter:()=>[0x93B0],createTexture:()=>1,bindTexture(){},deleteTexture(){},texStorage2D(){},compressedTexSubImage2D(){},getError:()=>1280,NO_ERROR:0};
 assert.equal(probe({currentContext:{GLctx:gl}},4,0,4,4),0);
});

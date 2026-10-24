import {test,expect} from 'bun:test';
import {installClearStateCache} from '../Host/clear-state-cache.mjs';
function fixture(){
 const gl={COLOR_WRITEMASK:3107,DEPTH_WRITEMASK:2930,STENCIL_WRITEMASK:2968,SCISSOR_BOX:3088,FRONT:1028,BACK:1029,FRONT_AND_BACK:1032},values=new Map([[3107,[true,true,true,true]],[2930,true],[2968,4294967295],[3088,new Int32Array([0,0,640,360])]]);let calls=0,lost=false,error=0;
 Object.assign(gl,{isContextLost:()=>lost,getParameter(key){calls++;return lost?null:values.has(key)?structuredClone(values.get(key)):123;},colorMask(...v){values.set(3107,v.map(Boolean));},depthMask(v){values.set(2930,!!v);},stencilMask(v){values.set(2968,v>>>0);},scissor(...v){v=v.map(n=>n|0);if(v[2]<0||v[3]<0){error=1281;return;}values.set(3088,new Int32Array(v));},stencilMaskSeparate(face,mask){if(face===1028||face===1032)values.set(2968,mask>>>0);else if(face!==1029)error=1280;}});
 return {gl,values,cache:installClearStateCache(gl),calls:()=>calls,setLost:v=>lost=v,error:()=>error};
}
test('100 clear/restore cycles retain exact masks and scissor with only four native queries',()=>{
 const f=fixture(),g=f.gl;for(let i=0;i<100;i++){const color=g.getParameter(g.COLOR_WRITEMASK),depth=g.getParameter(g.DEPTH_WRITEMASK),stencil=g.getParameter(g.STENCIL_WRITEMASK),box=g.getParameter(g.SCISSOR_BOX);g.colorMask(true,true,true,true);g.depthMask(true);g.stencilMask(-1);g.scissor(0,0,1920,1080);g.colorMask(...color);g.depthMask(depth);g.stencilMask(stencil);g.scissor(...box);}
 expect(f.calls()).toBe(4);expect(f.cache.snapshot().hits).toBe(396);expect([...g.getParameter(g.SCISSOR_BOX)]).toEqual([0,0,640,360]);
 const mask=g.getParameter(g.COLOR_WRITEMASK);mask[0]=false;expect(g.getParameter(g.COLOR_WRITEMASK)[0]).toBe(true);
 g.colorMask(false,true,false,true);g.depthMask(false);g.stencilMask(7);g.scissor(5,7,99,101);expect(g.getParameter(g.COLOR_WRITEMASK)).toEqual([false,true,false,true]);expect(g.getParameter(g.DEPTH_WRITEMASK)).toBe(false);expect(g.getParameter(g.STENCIL_WRITEMASK)).toBe(7);expect([...g.getParameter(g.SCISSOR_BOX)]).toEqual([5,7,99,101]);
});
test('invalid scissor and stencil calls preserve validation and last accepted state; back mask is independent',()=>{
 const f=fixture(),g=f.gl;g.scissor(1,2,30,40);g.scissor(9,9,-2,10);expect(f.error()).toBe(1281);expect([...g.getParameter(g.SCISSOR_BOX)]).toEqual([1,2,30,40]);g.stencilMask(23);g.stencilMaskSeparate(g.BACK,3);expect(g.getParameter(g.STENCIL_WRITEMASK)).toBe(23);g.stencilMaskSeparate(9999,4);expect(f.error()).toBe(1280);expect(g.getParameter(g.STENCIL_WRITEMASK)).toBe(23);g.stencilMaskSeparate(g.FRONT_AND_BACK,15);expect(g.getParameter(g.STENCIL_WRITEMASK)).toBe(15);
});
test('invalidation rereads real state, unknown queries forward, context loss returns null and dispose restores methods',()=>{
 const f=fixture(),g=f.gl;g.getParameter(g.DEPTH_WRITEMASK);f.values.set(g.DEPTH_WRITEMASK,false);f.cache.invalidate();expect(g.getParameter(g.DEPTH_WRITEMASK)).toBe(false);expect(g.getParameter(1234)).toBe(123);const before=f.calls();f.setLost(true);expect(g.getParameter(g.DEPTH_WRITEMASK)).toBe(null);expect(f.calls()).toBe(before+1);f.setLost(false);f.cache.dispose();f.cache.dispose();g.getParameter(g.DEPTH_WRITEMASK);expect(f.calls()).toBe(before+2);expect(f.cache.snapshot().entries).toBe(0);
});

// MonoGame Clear preserves these four GL states. Shadow only their setters;
// all other queries, validation/errors and render commands still use real WebGL.
export function installClearStateCache(gl){
 const keys=new Set([gl.COLOR_WRITEMASK,gl.DEPTH_WRITEMASK,gl.STENCIL_WRITEMASK,gl.SCISSOR_BOX]),values=new Map(),originals=new Map();
 let hits=0,queries=0,invalidations=0,disposed=false;
 const copy=value=>ArrayBuffer.isView(value)?new value.constructor(value):Array.isArray(value)?value.slice():value;
 function invalidate(){values.clear();invalidations++;}
 function wrap(name,fn){const original=gl[name];if(typeof original!=='function')throw Error('Missing WebGL state method: '+name);originals.set(name,original);gl[name]=fn(original);}
 wrap('getParameter',original=>function(key){
  if(this!==gl||!keys.has(key))return original.apply(this,arguments);
  if(gl.isContextLost()){invalidate();return original.apply(this,arguments);}
  if(values.has(key)){hits++;return copy(values.get(key));}
  queries++;const value=original.apply(this,arguments);if(value!==null)values.set(key,copy(value));return value;
 });
 for(const [name,key,convert] of [
  ['colorMask',gl.COLOR_WRITEMASK,args=>args.map(Boolean)],
  ['depthMask',gl.DEPTH_WRITEMASK,args=>!!args[0]],
  ['stencilMask',gl.STENCIL_WRITEMASK,args=>args[0]>>>0],
  ['scissor',gl.SCISSOR_BOX,args=>{const ints=args.map(v=>v|0);return ints[2]<0||ints[3]<0?undefined:new Int32Array(ints);}],
 ])wrap(name,original=>function(...args){
  const result=original.apply(this,args);if(this!==gl)return result;
  if(gl.isContextLost()){invalidate();return result;}
  // Native glue supplies primitive arguments. For coercible objects or an
  // unusual arity, preserve WebIDL validation and query the real state next time.
  if(args.length!==(name==='colorMask'||name==='scissor'?4:1)||args.some(v=>typeof v==='object'||typeof v==='function'||typeof v==='symbol'||typeof v==='bigint'))values.delete(key);
  else{const value=convert(args);if(value!==undefined)values.set(key,value);}
  return result;
 });
 wrap('stencilMaskSeparate',original=>function(face,mask){
  const result=original.apply(this,arguments);if(this!==gl)return result;
  if(gl.isContextLost()){invalidate();return result;}
  if((face===gl.FRONT||face===gl.FRONT_AND_BACK)&&typeof mask==='number')values.set(gl.STENCIL_WRITEMASK,mask>>>0);
  else if(typeof face!=='number'||typeof mask!=='number')values.delete(gl.STENCIL_WRITEMASK);
  return result;
 });
 return {invalidate,snapshot:()=>({hits,nativeQueries:queries,invalidations,entries:values.size,disposed}),dispose(){if(disposed)return;disposed=true;for(const [name,original]of originals)gl[name]=original;values.clear();}};
}

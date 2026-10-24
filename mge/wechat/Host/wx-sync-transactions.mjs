// Coalesce redundant synchronous reads only inside an explicit JSON writer lock.
// Every mutation still reaches wx synchronously. No write-behind or save debounce.
export function createSynchronousTransactions(fs){
 const active=new Set();let statHits=0,readHits=0;
 const missing=e=>/no such|not exist|ENOENT/i.test(e.errMsg||String(e));
 function owner(path){for(const t of active)if(path===t.directory||path===t.base||path===t.base+'.bak'||path.startsWith(t.base+'.')&&path.endsWith('.tmp'))return t;}
 function clear(t){t.stats.clear();t.bytes.clear();t.size=0;}
 return {
  contains(path){const t=owner(path);return !!t&&path!==t.directory;},
  begin(path){if(!/[.]json[.]lock$/.test(path)||active.size>=4)return null;const base=path.slice(0,-5),t={base,directory:base.slice(0,base.lastIndexOf('/')),stats:new Map(),bytes:new Map(),size:0};active.add(t);return t;},
  end(t){if(t){active.delete(t);clear(t);}},
  stat(path){const t=owner(path);if(!t)return fs.statSync(path);if(t.stats.has(path)){statHits++;const r=t.stats.get(path);if(r.error)throw r.error;return r.value;}try{const value=fs.statSync(path);if(t.stats.size<32)t.stats.set(path,{value});return value;}catch(error){if(missing(error)&&t.stats.size<32)t.stats.set(path,{error});throw error;}},
  read(path){const t=owner(path);if(!t||path===t.directory)return null;if(t.bytes.has(path)){readHits++;return t.bytes.get(path);}const size=this.stat(path).size;if(!Number.isInteger(size)||size<0||size>65536||t.size+size>262144||t.bytes.size>=8)return null;const value=fs.readFileSync(path);if(!value||!Number.isInteger(value.byteLength))throw Error('Expected binary persistent file');const bytes=ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength).slice():new Uint8Array(value);if(bytes.length!==size)return null;t.bytes.set(path,bytes);t.size+=size;return bytes;},
  invalidate(...paths){for(const t of active)for(const path of paths){t.stats.delete(path);t.stats.delete(path.slice(0,path.lastIndexOf('/')));const b=t.bytes.get(path);if(b){t.size-=b.length;t.bytes.delete(path);}}},
  snapshot(){return {active:active.size,bytes:[...active].reduce((n,t)=>n+t.size,0),statHits,readHits};},
  dispose(){for(const t of active)clear(t);active.clear();}
 };
}
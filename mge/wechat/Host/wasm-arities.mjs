export function wasmArities(bytes){
 new WebAssembly.Module(bytes);
 let p=8;const types=[],functions=[],exports=[];
 const read=()=>{let n=0,s=0,b;do{b=bytes[p++];if(b===undefined||s>35)throw Error('Invalid Wasm integer');n+=(b&127)*2**s;s+=7;}while(b&128);return n;};
 const name=()=>{const n=read(),value=new TextDecoder().decode(bytes.subarray(p,p+n));p+=n;return value;};
 const values=()=>{const count=read();for(let i=0;i<count;i++)if(![0x7f,0x7e,0x7d,0x7c,0x7b,0x70,0x6f].includes(bytes[p++]))throw Error('Unsupported Wasm value type');return count;};
 while(p<bytes.length){const id=bytes[p++],size=read(),end=p+size;
  if(id===1){const n=read();for(let i=0;i<n;i++){if(bytes[p++]!==0x60)throw Error('Unsupported Wasm type');types.push(values());values();}}
  if(id===2){const n=read();for(let i=0;i<n;i++){name();name();if(bytes[p++]!==0)throw Error('Expected function-only imports');functions.push(read());}}
  if(id===3){const n=read();for(let i=0;i<n;i++)functions.push(read());}
  if(id===7){const n=read();for(let i=0;i<n;i++){const key=name(),kind=bytes[p++],index=read();if(kind===0)exports.push({key,index});}}
  if(p>end)throw Error('Wasm section overflow');p=end;
 }
 const arities={};for(const {key,index} of exports){const count=types[functions[index]];if(count===undefined)throw Error('Unknown exported type');arities[key]=count;}return arities;
}

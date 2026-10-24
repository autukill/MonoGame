exports.createArityCheck=function(arities,mark){
 const seen=new Set();
 return function(name,observed,expected){
  if(!Object.prototype.hasOwnProperty.call(arities,name))return observed!==expected;
  const actual=arities[name];
  if(actual!==expected)throw new Error('Wasm ABI parameter mismatch for '+name+': binary='+actual+', cwrap='+expected);
  if(observed!==actual&&!seen.has(name)){
   seen.add(name);mark('cwrap-function-metadata','INFO',name+': JS length='+observed+', Wasm parameters='+actual+'; binary signature verified');
  }
  return false;
 };
};

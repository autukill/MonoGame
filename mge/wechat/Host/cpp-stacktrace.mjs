export function adaptCppStackTrace(source){
 const begin=source.indexOf('function RhpGetCurrentBrowserThreadStackTrace(');
 const end=source.indexOf('\n',begin);
 if(begin<0||end<0)throw Error('LLVM stack trace function layout changed');
 let body=source.slice(begin,end);
 const skip='if (wasmFuncStartIndex < 0 && actualBufferLength === 0) continue;';
 if(body.split(skip).length!==2||!body.includes('return actualBufferLength'))throw Error('LLVM stack trace parser layout changed');
 body=body.replace('new Error().stack : Module.RhpGetCurrentBrowserThreadStackTraceValue',
  '(new Error().stack || "[Stack trace unavailable in this host]") : Module.RhpGetCurrentBrowserThreadStackTraceValue');
 body=body.replace(skip,'if (wasmFuncStartIndex < 0 && actualBufferLength === 0 && jsStackTrace.includes(WASM_FUNCTION_TEXT)) continue;');
 return source.slice(0,begin)+body+source.slice(end);
}

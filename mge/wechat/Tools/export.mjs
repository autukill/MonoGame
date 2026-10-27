import{readFile,writeFile,mkdir,readdir,copyFile,stat}from'node:fs/promises';import{join,resolve,dirname}from'node:path';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';import{createHash}from'node:crypto';import{brotliCompressSync,brotliDecompressSync,constants}from'node:zlib';
import {parse} from './acorn.mjs';
import {normalizeBigIntLiterals} from './javascript-compat.mjs';
import{replaceOnce}from'./replace.mjs';import{adaptCppStackTrace}from'./cpp-stacktrace.mjs';import{adaptWebGlContext,adaptWebGlObjects,adaptWebGlNullBindings,adaptWebGlQueryArrays}from'./webgl-context.mjs';import{wasmArities}from'../Host/wasm-arities.mjs';
const here=dirname(fileURLToPath(import.meta.url));process.env.ESBUILD_BINARY_PATH=join(here,'esbuild.exe');const {build,transformSync}=createRequire(import.meta.url)('./esbuild.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function exportWeChat(publishRoot,out,options){
 if(!/^wx[0-9a-f]{16}$/.test(options.appId)||!options.assembly)throw Error('Explicit AppID and entry assembly required');
 try{await stat(out);throw Error('Export output must be new');}catch(e){if(e.code!=='ENOENT')throw e;}
 const source={};for(const name of ['dotnet.js','dotnet.runtime.js','dotnet.native.js','dotnet.native.wasm']){const b=await readFile(join(publishRoot,name));source[name]=name.endsWith('.wasm')?b:b.toString();}
 if(!/wasmEnableEH:\s*false\s*,/.test(source['dotnet.native.js']))throw Error('CPP EH metadata mismatch');
 const work=out+'-bundle-work';await mkdir(work,{recursive:true});await mkdir(join(out,'runtime'),{recursive:true});
 // Pinned LLVM loader adaptations: reject unknown module layouts.
 let loader=source['dotnet.js'];const start=loader.indexOf('const e=async()=>WebAssembly.validate'),end=loader.indexOf(',n=Symbol.for("wasm promise_control")');
 if(start<0||end<start||!loader.slice(start,end).includes('0,6,64,25,11,11'))throw Error('LLVM feature detection layout changed');
 loader=loader.slice(0,start)+'const e=async()=>globalThis.__wechatDotnet.features.eh,t=async()=>globalThis.__wechatDotnet.features.relaxedSimd,o=async()=>globalThis.__wechatDotnet.features.simd'+loader.slice(end);
 loader=replaceOnce(loader,'(async function(){try{const e=Y("dotnetwasm");','(async function(){try{if(ze.instantiateWasm){Me.wasmCompilePromise.promise_control.resolve(null);return;}const e=Y("dotnetwasm");','LLVM code package instantiate');
 let runtime=source['dotnet.runtime.js'];const begin=runtime.indexOf('function(e){const t=e.env||e.a;'),finish=runtime.indexOf('}(e);const n=await Ne.wasmCompilePromise.promise;',begin);
 if(begin<0||finish<begin)throw Error('LLVM import compression layout changed');
 runtime=replaceOnce(runtime,'if(n){const o=n(e,(e,n)=>{','if(n){!'+runtime.slice(begin,finish+5)+'const o=n(e,(e,n)=>{','LLVM compressed imports');
 const patches=[];
 function scope(text,name,native=false){
  const urls=(text.match(/import\.meta\.url/g)||[]).length;const expected=name==='dotnet.js'?1:name==='native.js'?6:0;
  if(urls!==expected)throw Error('LLVM module URL count changed '+name+': '+urls);patches.push({name,moduleUrls:urls});
  const env=native?'const window=globalThis.__wechatSdl.window,document=globalThis.__wechatSdl.document,navigator=globalThis.__wechatSdl.navigator,screen=globalThis.__wechatSdl.screen,getComputedStyle=globalThis.__wechatSdl.getComputedStyle,requestAnimationFrame=globalThis.__wechatSdl.requestAnimationFrame,cancelAnimationFrame=globalThis.__wechatSdl.cancelAnimationFrame;':'const window=undefined,document=undefined;';
  return env+'const process=undefined,importScripts=undefined,WebAssembly=globalThis.__wechatDotnet.wasm;\n'+text.replaceAll('import.meta.url',JSON.stringify('file:///runtime/'+name));
 }
 await writeFile(join(work,'dotnet.js'),scope(loader,'dotnet.js'));
 await writeFile(join(work,'runtime.js'),scope(runtime,'runtime.js'));
 const bigint=normalizeBigIntLiterals(source['dotnet.native.js']);source['dotnet.native.js']=bigint.code;patches.push({name:'es2019-bigint-literals',matches:bigint.count});
 await writeFile(join(work,'native.js'),scope(adaptWebGlQueryArrays(adaptWebGlNullBindings(adaptWebGlObjects(adaptWebGlContext(adaptCppStackTrace(source['dotnet.native.js']))))),'native.js',true));
 patches.push({name:'wx-native-webgl-query-arrays',matches:1,identity:'cross-realm Array / Float32Array / Uint32Array / Int32Array; no generic array-like objects'});
 patches.push({name:'wx-native-webgl-context',matches:1,identity:'WebGL2 core methods; no DOM constructor'});
 patches.push({name:'wx-native-webgl-objects',matches:2,identity:'Emscripten registered object identity; no DOM constructors'});
 patches.push({name:'wx-native-webgl-null-bindings',matches:1,enums:[0x8069,0x8CA6,0x8CA7],policy:'undefined becomes null only for these legal binding queries'});
 const assembly=options.assembly;
 await writeFile(join(work,'entry.js'),`import {dotnet} from './dotnet.js';import * as native from './native.js';import * as runtime from './runtime.js';
exports.boot=adapter=>dotnet.withModuleConfig({canvas:adapter.canvas,instantiateWasm:adapter.instantiateWasm,onConfigLoaded(config){config.resources.jsModuleNative[0].moduleExports=native;config.resources.jsModuleRuntime[0].moduleExports=runtime;}}).withConfig(${JSON.stringify({mainAssemblyName:assembly,resources:{assembly:[],jsModuleNative:[{name:'dotnet.native.js'}],jsModuleRuntime:[{name:'dotnet.runtime.js'}],wasmNative:[{name:'dotnet.native.wasm'}],vfs:[],satelliteResources:{}}})}).withResourceLoader(adapter.loadResource).create();`);

 async function bundle(entry){const code=(await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',target:'es2019',supported:{'dynamic-import':false},minify:true,charset:'ascii',define:{__MGE_PROBE__:'false'},external:['fs','path','crypto','node:crypto','url','module']})).outputFiles[0].text;parse(code,{ecmaVersion:2019,sourceType:'script',allowReturnOutsideFunction:true});return code;}
 await writeFile(join(out,'runtime-loader.js'),await bundle(join(work,'entry.js')));
 await writeFile(join(out,'host.js'),await bundle(join(here,'../Host/session.mjs')));
 const wasm=source['dotnet.native.wasm'],compressed=brotliCompressSync(wasm,{params:{[constants.BROTLI_PARAM_QUALITY]:11}});if(!brotliDecompressSync(compressed).equals(wasm))throw Error('Wasm compression mismatch');
 await writeFile(join(out,'runtime/dotnet.native.wasm.br'),compressed);await copyFile(join(here,'probe-simd.wasm'),join(out,'runtime/probe-simd.wasm'));await writeFile(join(out,'runtime/game.js'),'// WeChat native runtime subpackage.\n');
 const seenResources=new Set(),files=[];for(const input of options.files||[]){if(!input.virtualPath?.startsWith('/')||input.virtualPath.slice(1).split('/').some(p=>!p||p==='..'||p==='.')||!/^\/?[-a-zA-Z0-9_./]+$/.test(input.virtualPath))throw Error('Invalid virtual resource path');const target='runtime'+input.virtualPath;if(seenResources.has(target)||['runtime/game.js','runtime/probe-simd.wasm','runtime/dotnet.native.wasm.br'].includes(target))throw Error('Duplicate or reserved resource path');seenResources.add(target);const data=await readFile(input.source);await mkdir(dirname(join(out,target)),{recursive:true});await copyFile(input.source,join(out,target));files.push({path:input.virtualPath,source:target,sha256:sha(data),bytes:data.length});}
 const cfg={assembly:options.assembly,arities:wasmArities(wasm),orientation:options.orientation||'landscape',storageNamespace:options.storageNamespace||'monogame-wechat',wasmPath:'runtime/dotnet.native.wasm.br',files,mounts:options.mounts||[],extension:options.extensionConfig||null};
 let extension='undefined';if(options.extensionEntry){await writeFile(join(out,'extension.js'),await bundle(options.extensionEntry));extension="require('./extension.js').createExtension";}
 const identity={hostSha256:sha(await readFile(join(out,'host.js'))),loaderSha256:sha(await readFile(join(out,'runtime-loader.js'))),extensionSha256:options.extensionEntry?sha(await readFile(join(out,'extension.js'))):null,package:'MyGameEngine.MonoGame.Runtime.WeChat.WebGL2',version:'3.8.6-mge.2-astc.3',wasmSha256:sha(wasm),configuration:cfg};cfg.packageId=sha(JSON.stringify(identity));
 await writeFile(join(out,'boot-config.js'),'module.exports='+JSON.stringify(cfg));
 await writeFile(join(out,'game.js'),"const config=require('./boot-config.js');const session=require('./host.js').start(wx,globalThis,config,adapter=>require('./runtime-loader.js').boot(adapter),"+extension+");GameGlobal.monoGameWeChatSession=session;globalThis.monoGameWeChatSession=session;");
 await writeFile(join(out,'game.json'),JSON.stringify({deviceOrientation:cfg.orientation,iOSHighPerformance:options.iOSHighPerformance===true,subpackages:[{name:'runtime',root:'runtime'}]}));
 await writeFile(join(out,'project.config.json'),JSON.stringify({appid:options.appId,projectname:options.projectName||'MonoGame-WeChat',compileType:'game',setting:{es6:false,minified:false,urlCheck:true}}));
 const entries=[];async function walk(root,prefix=''){for(const e of await readdir(root,{withFileTypes:true})){const name=prefix+e.name,path=join(root,e.name);if(e.isDirectory())await walk(path,name+'/');else{const b=await readFile(path);entries.push({path:name,bytes:b.length,sha256:sha(b)});}}}await walk(out);const bytes=entries.reduce((n,f)=>n+f.bytes,0);if(bytes>20*1048576)throw Error('Configured preview package budget exceeded');
 const report={...identity,packageId:cfg.packageId,files:entries,totalBytes:bytes,physical:'NOT_TESTED',previewUploaded:false};for(let i=0;i<10;i++){const total=bytes+Buffer.byteLength(JSON.stringify(report,null,2));if(total===report.totalBytes)break;report.totalBytes=total;}const main=entries.filter(f=>!f.path.startsWith('runtime/')).reduce((n,f)=>n+f.bytes,0)+Buffer.byteLength(JSON.stringify(report,null,2));if(main>4*1048576||report.totalBytes>20*1048576)throw Error('WeChat package budget exceeded');await writeFile(join(out,'backend-export.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const[publish,out,configPath,assembly]=process.argv.slice(2);const config=JSON.parse(await readFile(configPath,'utf8'));const base=dirname(resolve(configPath));config.files=(config.files||[]).map(f=>({...f,source:resolve(base,f.source)}));if(config.extensionEntry)config.extensionEntry=resolve(base,config.extensionEntry);console.log(JSON.stringify(await exportWeChat(resolve(publish),resolve(out),{...config,assembly}),null,2));}

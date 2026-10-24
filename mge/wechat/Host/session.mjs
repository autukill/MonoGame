import {createSdlEnvironment} from './sdl-environment.mjs';
import {installHostEnvironment} from './host-environment.js';
import {installSecureRandom} from './secure-random.js';
import {createArityCheck} from './cwrap-arity.js';
import {createWeChatAudio} from './wx-audio.mjs';
import {createWxFileSystem} from './wx-filesystem.mjs';
export function start(wx,scope,config,boot,extensionFactory){
 if(!/^[-a-zA-Z0-9_]+$/.test(config.storageNamespace))throw Error('Invalid persistent storage namespace');
 const report={packageId:config.packageId,backend:'NativeAOT-LLVM',marks:[],failure:null};let runtime,managed,run,audio,files,extension,stopPromise,completePromise,closed=false,timeout;
 let resolveReady,rejectReady,resolveInit,rejectInit;
 const ready=new Promise((a,b)=>{resolveReady=a;rejectReady=b});ready.catch(()=>{});
 const initialized=new Promise((a,b)=>{resolveInit=a;rejectInit=b});initialized.catch(()=>{});
 const mark=(stage,result,detail='')=>{const row={stage,result,detail,time:Date.now()};report.marks.push(row);if(report.marks.length>128)report.marks.shift();console.log('[MonoGame-WeChat] '+JSON.stringify(row));extension?.mark?.(row);};
 const env=createSdlEnvironment(wx,scope,{windowSurface:true,orientation:config.orientation,
  visibility(value){audio?.visibility(value);runtime?.Module._MGP_Web_NotifyFocusChange(value?1:0);extension?.visibility?.(value);},
  resize(w,h){runtime?.Module._MGP_Web_NotifyCanvasResize(w,h);},resetClock(){extension?.resetClock?.();},surfaceChanged(value){extension?.surfaceChanged?.(value);},afterFrame(){extension?.afterFrame?.();},frameError(e){fail(e);}});
 scope.__wechatSdl=env;scope.canvas=env.canvas;
 const bridge={mark,surface:()=>env.surfaceJson(),surfaceWidth:()=>env.canvas.width,surfaceHeight:()=>env.canvas.height,setPreferredFramesPerSecond:fps=>env.setFrameRate(fps),notifyManagedFirstFrame(){mark('first-frame','PASS');clearTimeout(timeout);resolveReady();},notifyManagedFailure(message,details){fail(Error(message+' '+details));},getActiveHost(){return null;}};
 scope.MonoGameWeChat=bridge;scope.MonoGameWebHost=bridge;
 const services={wx,scope,config,env,mark,get runtime(){return runtime},get audio(){return audio},get files(){return files}};
 async function complete(){return completePromise||=(async()=>{if(closed)return;clearTimeout(timeout);try{await extension?.dispose?.();}finally{try{files?.dispose();audio?.dispose();}finally{env.dispose();wx.offError(errorListener);if(scope.MonoGameWeChat===bridge)delete scope.MonoGameWeChat;if(scope.MonoGameWebHost===bridge)delete scope.MonoGameWebHost;closed=true;}}mark('stopped','PASS');})();}
 function fail(e){if(report.failure)return;report.failure={message:String(e?.message||e),stack:String(e?.stack||''),stage:report.marks[report.marks.length-1]?.stage};mark('failed','FAIL',report.failure.message);rejectReady(e);rejectInit(e);if(managed){try{managed.RequestStop();}catch{}}complete().catch(()=>{});}
 const errorListener=e=>fail(e);wx.onError(errorListener);
 const read=path=>new Promise((a,b)=>wx.getFileSystemManager().readFile({filePath:path,success:r=>a(r.data),fail:b}));
 async function initialize(){
  if(config.orientation){await new Promise((a,b)=>wx.setDeviceOrientation({value:config.orientation,success:a,fail:b}));env.synchronizeSurface();}
  installHostEnvironment(wx,scope);await installSecureRandom(wx,scope);
  if(!scope.WXWebAssembly?.instantiate)throw Error('WXWebAssembly unavailable');
  await new Promise((a,b)=>wx.loadSubpackage({name:'runtime',success:a,fail:b}));
  const simd=await scope.WXWebAssembly.instantiate('runtime/probe-simd.wasm',{});if((simd.instance||simd).exports.run()!==3)throw Error('Standard SIMD unavailable');
  scope.__wechatDotnet={features:{eh:false,simd:true,relaxedSimd:false},wasm:scope.WXWebAssembly};scope.__wechatCwrapArity=createArityCheck(config.arities,mark);scope.__iosJitSkipped=()=>{};
  extension=extensionFactory?.(services)||{};
  audio=createWeChatAudio(wx,mark,path=>extension.resolve?.(path)??path);bridge.audio=audio.api;
  runtime=await boot({canvas:env.canvas,instantiateWasm(imports,receive){scope.WXWebAssembly.instantiate(config.wasmPath,imports).then(v=>receive(v.instance||v,v.module)).catch(fail);return {};},loadResource(type,name){if(type==='dotnetjs')return 'file:///runtime/'+name;if(type==='dotnetwasm')throw Error('Wasm must use code package loader');return read('runtime/'+name).then(bytes=>({ok:true,status:200,headers:{get:()=>null},arrayBuffer:async()=>bytes}));}});
  const fs=runtime.Module.FS;
  files=createWxFileSystem(wx,fs,{packageFiles:(config.files||[]).map(f=>f.source),pathAliases:extension.pathAliases||{},remoteAssets:extension.remoteAssets});
  for(const mount of config.mounts||[])files.mount(mount.target,mount.root,mount.readOnly!==false);
  const user=wx.env.USER_DATA_PATH+'/'+config.storageNamespace;try{wx.getFileSystemManager().accessSync(user);}catch(e){if(!/no such|not exist|ENOENT/i.test(e.errMsg||String(e)))throw e;wx.getFileSystemManager().mkdirSync(user,true);}files.mount('/UserData',user,false);
  await extension.install?.(runtime);
  const exports=await runtime.getAssemblyExports(config.assembly);bridge.managedExports=exports;managed=exports.MonoGame.Runtime.WeChat.WebGL2.WeChatGame;
  if(!managed?.RequestStop||!managed?.NotifyContextLost)throw Error('WeChatGame managed exports missing');
  runtime.Module._MGP_Web_SetCanvasResizeManaged(1);runtime.Module._MGP_Web_NotifyCanvasResize(env.canvas.width,env.canvas.height);runtime.Module._MGP_Web_NotifyFocusChange(1);
  env.canvas.addEventListener('webglcontextlost',()=>{managed.NotifyContextLost();fail(Error('WebGL context lost; reload the game'));});
  mark('managed-start','PASS');run=Promise.resolve(runtime.runMain());resolveInit();run.then(complete,fail).catch(fail);
 }
 function stop(){return stopPromise||=(async()=>{await initialized;if(!closed){managed.RequestStop();await run;await complete();}return {stopped:true};})();}
 timeout=setTimeout(()=>fail(Error('WeChat startup timed out')),60000);initialize().catch(fail);
 return {ready,stop,snapshot:()=>({report,host:env.snapshot(),audio:audio?.snapshot(),filesystem:files?.snapshot(),stopped:closed})};
}

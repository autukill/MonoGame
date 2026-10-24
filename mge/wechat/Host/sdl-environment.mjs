import {createTouchRouter} from './touch-router.mjs';
import {surfacePresentation} from './surface-presentation.mjs';

// Narrow Emscripten/SDL event targets, backed by the real WeChat canvas/context.
// This object is passed only to native glue, never installed as a global DOM.
export function createSdlEnvironment(wx, scope, hooks = {}) {
    const listeners = new Map(), registrations = [], pendingFrames = new Map();
    const nativeEvents={touchStart:0,touchMove:0,touchEnd:0,touchCancel:0,hide:0,show:0};
    let visible = true, disposed = false, sequence = 0, preferredFramesPerSecond = null;
    const target = name => ({
        nodeName: name, style: {},
        addEventListener(type, fn) { const key=name+':'+type; if(!listeners.has(key))listeners.set(key,new Set());listeners.get(key).add(fn); },
        removeEventListener(type, fn) { listeners.get(name+':'+type)?.delete(fn); },
        dispatchEvent(event) { event.target ||= this; event.preventDefault ||= (()=>{}); for(const fn of [...(listeners.get(name+':'+event.type)||[])])fn.call(this,event); },
    });
    const canvas=wx.createCanvas(), canvasEvents=target('CANVAS');
    for(const name of ['addEventListener','removeEventListener','dispatchEvent'])canvas[name]=canvasEvents[name];
    // Keep the WeChat-owned identifier (DevTools uses myCanvas). SDL's #canvas
    // selector is resolved by the local document adapter below, without rename.
    canvas.nodeName='CANVAS';canvas.style ||= {};canvas.tabIndex=0;
    // SDL queries bounds and CSS dimensions repeatedly for every native touch.
    // Keep one coherent snapshot; crossing the wx bridge here stalls moving input.
    // Only explicit surface synchronization, resize and resume refresh the snapshot.
    let windowInfo,surface,surfaceText,orientation=hooks.orientation||'landscape',surfacePending=false,orientationRetries=0;
    const platform=(typeof wx.getDeviceInfo==='function'?wx.getDeviceInfo():{}).platform||'';
    const info=()=>windowInfo;
    function syncDimensions(){const value=wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();windowInfo={...value};surface=surfacePresentation(value,orientation,platform);surfaceText=JSON.stringify(surface);const width=hooks.windowSurface?surface.width:hooks.width||640,height=hooks.windowSurface?surface.height:hooks.height||360;if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;}
    function refreshSurface(){syncDimensions();if(surfacePending&&hooks.windowSurface&&((orientation!=='portrait')!==(windowInfo.windowWidth>windowInfo.windowHeight)))return false;surfacePending=false;orientationRetries=0;hooks.resize?.(canvas.width,canvas.height);hooks.resetClock?.();hooks.surfaceChanged?.(surface);return true;}
    syncDimensions();
    canvas.getBoundingClientRect=()=>({left:0,top:0,right:info().windowWidth,bottom:info().windowHeight,width:info().windowWidth,height:info().windowHeight});
    Object.defineProperties(canvas,{clientWidth:{configurable:true,get:()=>info().windowWidth},clientHeight:{configurable:true,get:()=>info().windowHeight}});
    canvas.focus=()=>{};canvas.setAttribute=(key,value)=>{canvas[key]=value;};canvas.getAttribute=key=>canvas[key];
    const body=target('BODY');body.appendChild=()=>{throw Error('WeChat SDL adapter does not support DOM elements');};body.contains=value=>value===canvas;
    const document=Object.assign(target('DOCUMENT'),{body,documentElement:body,hidden:false,visibilityState:'visible',fullscreenEnabled:false,fullscreenElement:null,pointerLockElement:null,
        querySelector(selector){if(selector==='#canvas')return canvas;throw Error('Unsupported SDL selector '+selector);},
        getElementById(id){return id==='canvas'?canvas:null;},
        createElement(name){throw Error('Unsupported SDL element '+name);},hasFocus:()=>visible,
    });
    const window=Object.assign(target('WINDOW'),{devicePixelRatio:1,scrollX:0,scrollY:0});
    Object.defineProperties(window,{innerWidth:{get:()=>info().windowWidth},innerHeight:{get:()=>info().windowHeight}});
    const navigator={maxTouchPoints:10,userAgent:'WeChat MonoGame',getGamepads:()=>[]};
    function requestFrame(fn){
        const id=++sequence;pendingFrames.set(id,{fn,native:null});
        if(visible)schedule(id);
        return id;
    }
    function schedule(id){const entry=pendingFrames.get(id);if(!entry)return;entry.native=scope.requestAnimationFrame(time=>{if(!visible||disposed)return;try{
        if(surfacePending&&!refreshSurface()){if(++orientationRetries>120)throw Error('WeChat orientation window dimensions did not settle');schedule(id);return;}
        pendingFrames.delete(id);hooks.beforeFrame?.();entry.fn(time);hooks.afterFrame?.();
    }catch(error){pendingFrames.delete(id);if(!hooks.frameError)throw error;hooks.frameError(error);}});}
    function cancelFrame(id){const entry=pendingFrames.get(id);if(entry?.native!=null)scope.cancelAnimationFrame(entry.native);pendingFrames.delete(id);}
    function subscribe(on,off,fn){if(typeof wx[on]!=='function')throw Error('Missing '+on);wx[on](fn);registrations.push(()=>wx[off](fn));}
    const active=new Map();
    const router=createTouchRouter((kind,id,x,y)=>{
        const point={identifier:id,clientX:x,clientY:y,pageX:x,pageY:y,screenX:x,screenY:y};
        if(kind===1||kind===3)active.set(id,point);else active.delete(id);
        canvas.dispatchEvent({type:({1:'touchstart',2:'touchend',3:'touchmove',4:'touchcancel'})[kind],touches:[...active.values()],targetTouches:[...active.values()],changedTouches:[point],timeStamp:scope.performance.now()});
    });
    for(const [name,kind] of [['Start',1],['Move',3],['End',2],['Cancel',4]])subscribe('onTouch'+name,'offTouch'+name,event=>{nativeEvents['touch'+name]++;if(visible&&!disposed)router.accept(kind,event);});
    function clearTouches(){for(const point of [...active.values()])canvas.dispatchEvent({type:'touchcancel',touches:[],targetTouches:[],changedTouches:[point],timeStamp:scope.performance.now()});active.clear();router.clear();}
    function hide(){if(!visible||disposed)return;clearTouches();visible=false;document.hidden=true;document.visibilityState='hidden';for(const entry of pendingFrames.values()){if(entry.native!=null)scope.cancelAnimationFrame(entry.native);entry.native=null;}hooks.visibility?.(false);document.dispatchEvent({type:'visibilitychange'});window.dispatchEvent({type:'blur'});}
    function show(){if(visible||disposed)return;refreshSurface();visible=true;document.hidden=false;document.visibilityState='visible';hooks.visibility?.(true);document.dispatchEvent({type:'visibilitychange'});window.dispatchEvent({type:'focus'});for(const id of pendingFrames.keys())schedule(id);}
    subscribe('onHide','offHide',()=>{nativeEvents.hide++;hide();});subscribe('onShow','offShow',()=>{nativeEvents.show++;show();});
    if(typeof wx.onWindowResize==='function')subscribe('onWindowResize','offWindowResize',()=>{clearTouches();refreshSurface();});
    if(typeof wx.onDeviceOrientationChange==='function'&&typeof wx.offDeviceOrientationChange==='function')subscribe('onDeviceOrientationChange','offDeviceOrientationChange',event=>{
        if(!['landscape','landscapeReverse','portrait'].includes(event.value))return;
        orientation=event.value;clearTouches();surfacePending=true;orientationRetries=0;
        // Read the window on the next native callback: orientation may precede resize.
        // Hidden sessions defer the same refresh until show.
    });
    return {canvas,document,window,navigator,setFrameRate(fps){if(!Number.isFinite(fps)||fps<1||fps>60)throw Error("Invalid frame rate: wx supports 1-60");wx.setPreferredFramesPerSecond(fps);preferredFramesPerSecond=fps;},synchronizeSurface(){refreshSurface();},surface:()=>({...surface}),surfaceJson:()=>surfaceText,surfaceDetails:()=>({window:{...windowInfo},platform,requestedOrientation:orientation}),screen:{get width(){return info().windowWidth;},get height(){return info().windowHeight;}},requestAnimationFrame:requestFrame,cancelAnimationFrame:cancelFrame,
        getComputedStyle:()=>({getPropertyValue:()=>'',width:info().windowWidth+'px',height:info().windowHeight+'px'}),
        snapshot:()=>({visible,disposed,preferredFramesPerSecond,surface:{...surface},nativeCanvasId:canvas.id??null,nativeEvents:{...nativeEvents},listeners:[...listeners.values()].reduce((n,s)=>n+s.size,0),wxListeners:registrations.length,pendingFrames:pendingFrames.size,pointers:active.size}),
        dispose(){if(disposed)return;clearTouches();disposed=true;for(const id of [...pendingFrames.keys()])cancelFrame(id);for(const off of registrations.splice(0))off();listeners.clear();},
    };
}

import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {createSdlEnvironment} from '../Host/sdl-environment.mjs';

function fixture(hooks={}){
    const handlers=new Map(),removed=[],frames=new Map();let next=0;
    const wx={createCanvas:()=>({id:'myCanvas'}),getWindowInfo:()=>({windowWidth:800,windowHeight:450})};
    for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){
        wx['on'+name]=fn=>handlers.set(name,fn);
        wx['off'+name]=fn=>{assert.equal(handlers.get(name),fn);handlers.delete(name);removed.push(name);};
    }
    const calls=[];
    const env=createSdlEnvironment(wx,{performance:{now:()=>123},requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)},
        {visibility:value=>calls.push(['visibility',value]),resetClock:()=>calls.push(['clock']),resize:()=>calls.push(['resize']),...hooks});
    return {env,handlers,removed,frames,calls};
}
test('SDL selectors preserve the native WeChat canvas identifier',()=>{
    const {env}=fixture();assert.equal(env.canvas.id,'myCanvas');
    assert.equal(env.document.querySelector('#canvas'),env.canvas);
    assert.equal(env.document.getElementById('canvas'),env.canvas);env.dispose();
});

test('native frame errors reach the host failure boundary and allow owned cleanup',()=>{
 const failure=Error('native frame failed');let received;
 const {env,frames,handlers}=fixture({frameError(error){received=error;env.dispose();}});
 env.requestAnimationFrame(()=>{env.requestAnimationFrame(()=>{});throw failure;});
 const [id,frame]=[...frames][0];frames.delete(id);frame(12);
 assert.equal(received,failure);assert.equal(env.snapshot().disposed,true);
 assert.equal(frames.size,0);assert.equal(handlers.size,0);
});

test('window surfaces use real wx dimensions and resynchronize on resize and resume',()=>{
 const listeners=new Map();let width=800,height=450;
 const wx={createCanvas:()=>({id:'myCanvas'}),getWindowInfo:()=>({windowWidth:width,windowHeight:height,pixelRatio:2})};
 for(const event of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){wx['on'+event]=fn=>listeners.set(event,fn);wx['off'+event]=()=>listeners.delete(event);}
 const sizes=[],env=createSdlEnvironment(wx,{performance:{now:()=>1},requestAnimationFrame:()=>1,cancelAnimationFrame(){}},{windowSurface:true,resize:(w,h)=>sizes.push([w,h])});
 assert.equal(env.canvas.width,1600);assert.equal(env.canvas.height,900);
 width=900;height=400;listeners.get('WindowResize')();assert.deepEqual(sizes.at(-1),[1800,800]);
 listeners.get('Hide')();width=850;listeners.get('Show')();assert.deepEqual(sizes.at(-1),[1700,800]);env.dispose();assert.equal(listeners.size,0);
});
test('wx touch IDs, releases and cancel route to SDL targets with stable listeners',()=>{
    const {env,handlers,removed}=fixture(),events=[];
    for(const type of ['touchstart','touchmove','touchend','touchcancel'])env.canvas.addEventListener(type,e=>events.push(e));
    const point={identifier:9007199254740000,clientX:400,clientY:225};
    handlers.get('TouchStart')({touches:[point],changedTouches:[point]});
    handlers.get('TouchMove')({touches:[point],changedTouches:[point]});
    handlers.get('TouchEnd')({touches:[],changedTouches:[point]});
    assert.deepEqual(events.map(e=>e.type),['touchstart','touchmove','touchend']);
    assert.equal(events[0].changedTouches[0].identifier,1);assert.equal(events[2].touches.length,0);
    handlers.get('TouchStart')({touches:[point],changedTouches:[point]});handlers.get('Hide')();
    assert.equal(events.at(-1).type,'touchcancel');assert.equal(env.snapshot().pointers,0);
    env.dispose();env.dispose();assert.equal(removed.length,7);assert.equal(env.snapshot().listeners,0);assert.equal(handlers.size,0);
});
test('hidden frames pause; show resets clock before rescheduling; dispose cancels frames',()=>{
    const {env,handlers,frames,calls}=fixture();let ticks=0;
    env.requestAnimationFrame(()=>ticks++);assert.equal(frames.size,1);
    handlers.get('Hide')();assert.equal(frames.size,0);assert.equal(env.snapshot().pendingFrames,1);
    env.requestAnimationFrame(()=>ticks++);assert.equal(frames.size,0);
    handlers.get('Show')();assert.deepEqual(calls,[['visibility',false],['resize'],['clock'],['visibility',true]]);assert.equal(frames.size,2);
    for(const [id,fn] of [...frames]){frames.delete(id);fn(12);}assert.equal(ticks,2);assert.equal(env.snapshot().pendingFrames,0);
    env.requestAnimationFrame(()=>ticks++);env.dispose();assert.equal(frames.size,0);
});
test('late input while hidden and unsupported DOM creation are rejected',()=>{
    const {env,handlers}=fixture();let presses=0;env.canvas.addEventListener('touchstart',()=>presses++);
    handlers.get('Hide')();handlers.get('TouchStart')({touches:[{identifier:3}],changedTouches:[{identifier:3}]});assert.equal(presses,0);
    assert.throws(()=>env.document.createElement('video'),/Unsupported/);assert.throws(()=>env.document.querySelector('#other'),/Unsupported/);env.dispose();
});
test('native callbacks count touch and lifecycle events; no synthetic public helpers',()=>{
    const {env,handlers}=fixture();assert.equal(env.testing,undefined);const point={identifier:7,clientX:100,clientY:50};
    handlers.get('TouchStart')({touches:[point],changedTouches:[point]});handlers.get('Hide')();handlers.get('Show')();
    assert.deepEqual(env.snapshot().nativeEvents,{touchStart:1,touchMove:0,touchEnd:0,touchCancel:0,hide:1,show:1});
    handlers.get('TouchStart')({touches:[point],changedTouches:[point]});handlers.get('Hide')();handlers.get('Show')();
    assert.equal(env.snapshot().nativeEvents.touchStart,2);assert.equal(env.snapshot().nativeEvents.hide,2);assert.equal(env.snapshot().nativeEvents.show,2);env.dispose();
});

test('host forwards requested callback rate and preserves it through visibility',()=>{
 const rates=[],handlers=new Map();
 const wx={createCanvas:()=>({}),getWindowInfo:()=>({windowWidth:800,windowHeight:450}),setPreferredFramesPerSecond:fps=>rates.push(fps)};
 for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){wx['on'+name]=fn=>handlers.set(name,fn);wx['off'+name]=()=>handlers.delete(name);}
 const env=createSdlEnvironment(wx,{performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
 env.setFrameRate(30);assert.deepEqual(rates,[30]);assert.equal(env.snapshot().preferredFramesPerSecond,30);
 for(const fps of [0,61,NaN,Infinity])assert.throws(()=>env.setFrameRate(fps),/Invalid frame rate/);assert.deepEqual(rates,[30]);
 handlers.get('Hide')();handlers.get('Show')();assert.equal(env.snapshot().preferredFramesPerSecond,30);env.dispose();
});


test('SDL touch geometry avoids wx bridge calls and updates atomically on resize, resume and explicit sync',()=>{
 const listeners=new Map();let width=844,height=390,queries=0;
 const wx={createCanvas:()=>({}),getWindowInfo:()=>{queries++;return {windowWidth:width,windowHeight:height,pixelRatio:3};}};
 for(const event of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){wx['on'+event]=fn=>listeners.set(event,fn);wx['off'+event]=()=>listeners.delete(event);}
 const env=createSdlEnvironment(wx,{performance:{now:()=>1},requestAnimationFrame:()=>1,cancelAnimationFrame(){}},{windowSurface:true});
 function geometry(){assert.deepEqual(env.canvas.getBoundingClientRect(),{left:0,top:0,right:width,bottom:height,width,height});assert.equal(env.canvas.clientWidth,width);assert.equal(env.canvas.clientHeight,height);assert.equal(env.window.innerWidth,width);assert.equal(env.window.innerHeight,height);assert.equal(env.screen.width,width);assert.equal(env.screen.height,height);assert.equal(env.getComputedStyle().width,width+'px');assert.equal(env.canvas.width,width*3);assert.equal(env.canvas.height,height*3);}
 env.canvas.addEventListener('touchmove',()=>{geometry();geometry();});
 const point={identifier:4,clientX:300,clientY:200};listeners.get('TouchStart')({touches:[point],changedTouches:[point]});
 for(let i=0;i<100;i++)listeners.get('TouchMove')({touches:[point],changedTouches:[point]});
 assert.equal(queries,1,'Touch geometry must not query wx');
 width=900;height=400;listeners.get('WindowResize')();geometry();assert.equal(queries,2);
 listeners.get('Hide')();width=800;height=420;listeners.get('Show')();geometry();assert.equal(queries,3);
 width=850;env.synchronizeSurface();geometry();assert.equal(queries,4);env.dispose();assert.equal(listeners.size,0);
});

test('orientation changes refresh one coherent surface, cancel touches and unregister exactly',()=>{
 const handlers=new Map(),frames=new Map(),released=[];let sequence=0,reads=0,window={windowWidth:844,windowHeight:390,screenWidth:390,screenHeight:844,pixelRatio:3,safeArea:{left:0,top:47,right:390,bottom:810}};
 const wx={createCanvas:()=>({}),getDeviceInfo:()=>({platform:'ios'}),getWindowInfo:()=>{reads++;return window;}};
 for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize','DeviceOrientationChange']){wx['on'+name]=fn=>handlers.set(name,fn);wx['off'+name]=fn=>{assert.equal(handlers.get(name),fn);released.push(name);handlers.delete(name);};}
 const scope={performance:{now:()=>1},requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id)};
 const env=createSdlEnvironment(wx,scope,{windowSurface:true});let cancels=0;env.canvas.addEventListener('touchcancel',()=>cancels++);
 handlers.get('TouchStart')({changedTouches:[{identifier:1,clientX:20,clientY:30}]});
 handlers.get('DeviceOrientationChange')({value:'landscapeReverse'});assert.equal(cancels,1);
 let dispatched=0;const fire=()=>{const [id,fn]=[...frames][0];frames.delete(id);fn(10);};
 env.requestAnimationFrame(()=>dispatched++);fire();assert.equal(dispatched,1);assert.equal(env.surface().left,102);
 const count=reads;for(let i=0;i<100;i++){env.surface();env.canvas.getBoundingClientRect();}assert.equal(reads,count,'steady input/UI never crosses wx window bridge');
 handlers.get('DeviceOrientationChange')({value:'portrait'});env.requestAnimationFrame(()=>dispatched++);fire();assert.equal(dispatched,1,'do not dispatch old landscape dimensions after portrait event');
 window={...window,windowWidth:390,windowHeight:844};fire();assert.equal(dispatched,2);assert.equal(env.canvas.width,1170);assert.equal(env.surface().top,141);
 handlers.get('Hide')();handlers.get('DeviceOrientationChange')({value:'landscape'});window={...window,windowWidth:844,windowHeight:390};handlers.get('Show')();
 assert.equal(env.surface().left,141);assert.equal(env.canvas.width,2532);env.dispose();assert.equal(handlers.size,0);assert.equal(new Set(released).size,8);
});

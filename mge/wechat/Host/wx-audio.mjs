import {createWeChatFileAudio} from './wx-file-audio.mjs';
// wx-native static PCM audio. No browser AudioContext/SDL audio dependency.
export function createWeChatAudio(wx,mark=()=>{},resolve=path=>path) {
    let context=null,closed=false,visible=true,interrupted=false,error='',bufferId=0,voiceId=0,bytes=0;
    const native=createWeChatFileAudio(wx,resolve,mark);
    const buffers=new Map(),voices=new Map(),registrations=[];
    const metrics={backend:'wx.createWebAudioContext',started:0,ended:0,paused:0,resumed:0,stopped:0,mixRequests:0,mixUpdates:0,mixSkipped:0,voiceSnapshotReads:0};
    const fail=(stage,e)=>{error=String(e?.errMsg||e?.message||e);mark(stage,'FAIL',error);};
    try{if(typeof wx.createWebAudioContext!=='function')throw Error('wx.createWebAudioContext unavailable');context=wx.createWebAudioContext();for(const name of ['createBuffer','createBufferSource','createGain','createStereoPanner','suspend','resume','close'])if(typeof context?.[name]!=='function')throw Error('wx WebAudio missing '+name);mark('audio-context','PASS','wx WebAudioContext static SFX; native file music/VO');}
    catch(e){try{Promise.resolve(context?.close()).catch(()=>{});}catch{}context=null;fail('audio-context',e);}
    function state(){if(closed)return 5;if(!context)return 0;if(!visible||interrupted||context.state==='suspended')return 4;if(context.state==='closed')return 5;return 3;}
    function synchronize(){if(closed||!context)return;const current=context;try{const action=visible&&!interrupted?'resume':'suspend';Promise.resolve(current[action]()).then(()=>{if(!closed&&context===current)error='';},e=>{if(!closed&&context===current)fail('audio-'+action,e);});}catch(e){fail('audio-lifecycle',e);}}
    function register(on,off,fn){if(typeof wx[on]==='function'&&typeof wx[off]==='function'){wx[on](fn);registrations.push(()=>wx[off](fn));}}
    register('onAudioInterruptionBegin','offAudioInterruptionBegin',()=>{interrupted=true;native.interruption(true);synchronize();});
    register('onAudioInterruptionEnd','offAudioInterruptionEnd',()=>{interrupted=false;native.interruption(false);synchronize();});
    register('onTouchStart','offTouchStart',()=>{if(visible&&!interrupted)synchronize();});
    function checked(){if(closed||!context)throw Error('wx audio unavailable');}
    function disconnect(node){try{node?.disconnect();}catch{}}
    function stopSource(v){const source=v.source;v.source=null;if(source){source.onended=null;try{source.stop();}catch{}disconnect(source);}}
    function destroy(v){stopSource(v);disconnect(v.gain);disconnect(v.panner);}
    function offset(v){return v.offset+(v.paused?0:Math.max(0,context.currentTime-v.start)*v.pitch);}
    function start(v){const source=context.createBufferSource();v.source=source;source.buffer=v.buffer;source.loop=v.loop;source.loopStart=v.loopStart||0;source.loopEnd=v.loopEnd||0;source.playbackRate.value=v.pitch;source.connect(v.gain);source.onended=()=>{if(closed||v.source!==source||v.paused)return;if(voices.get(v.id)===v){voices.delete(v.id);metrics.ended++;destroy(v);}};v.start=context.currentTime;const at=v.loop?v.offset%v.buffer.duration:Math.min(v.offset,v.buffer.duration);source.start(0,at);}
    const api={...native.api,state,activeVoices(){metrics.voiceSnapshotReads++;return closed?[]:[...voices.keys()];},
        createBuffer(input,format,channels,sampleRate){checked();if(![0,1,2].includes(format)||![1,2].includes(channels))throw Error('Invalid PCM layout');const data=input instanceof Uint8Array?input:new Uint8Array(input),width=format===0?1:format===1?2:4,frames=data.length/width/channels,size=frames*channels*4;if(!Number.isInteger(frames)||frames<=0||sampleRate<8000||sampleRate>384000)throw Error('Invalid PCM metadata');if(buffers.size>=384||bytes+size>96*1024*1024)throw Error('wx PCM cache budget exceeded');const buffer=context.createBuffer(channels,frames,sampleRate),view=new DataView(data.buffer,data.byteOffset,data.byteLength);for(let c=0;c<channels;c++){const channel=buffer.getChannelData(c);for(let i=0;i<frames;i++){const at=(i*channels+c)*width;channel[i]=format===0?(view.getUint8(at)-128)/128:format===1?view.getInt16(at,true)/32768:view.getFloat32(at,true);}}const id=++bufferId;buffers.set(id,{buffer,size});bytes+=size;return id;},
        deleteBuffer(id){const item=buffers.get(id);if(item){buffers.delete(id);bytes-=item.size;}},
        play(id,volume,pan,pitch,loop,loopStart=0,loopEnd=0){checked();const item=buffers.get(id);if(!item)throw Error('Unknown wx PCM buffer');if(voices.size>=128)throw Error('wx audio voice budget exceeded');const gain=context.createGain(),panner=context.createStereoPanner(),v={id:++voiceId,buffer:item.buffer,gain,panner,source:null,offset:0,start:context.currentTime,pitch,loop,loopStart,loopEnd,volume,pan,paused:false};try{gain.gain.value=volume;panner.pan.value=pan;gain.connect(panner);panner.connect(context.destination);voices.set(v.id,v);start(v);metrics.started++;return v.id;}catch(e){voices.delete(v.id);destroy(v);fail('audio-play',e);throw e;}},
        mix(id,volume,pan,pitch,loop){const v=voices.get(id);if(!v||closed)return;metrics.mixRequests++;if(v.volume===volume&&v.pan===pan&&v.pitch===pitch&&v.loop===loop){metrics.mixSkipped++;return;}metrics.mixUpdates++;v.volume=volume;v.pan=pan;v.offset=offset(v);v.start=context.currentTime;v.pitch=pitch;v.loop=loop;v.gain.gain.value=volume;v.panner.pan.value=pan;if(v.source){v.source.playbackRate.value=pitch;v.source.loop=loop;}},
        position(id){const v=voices.get(id);return v?offset(v):0;},finishLoop(id){const v=voices.get(id);if(v){v.loop=false;if(v.source)v.source.loop=false;}},
        playing:id=>!closed&&voices.has(id),
        pause(id){const v=voices.get(id);if(!v||closed||v.paused)return false;v.offset=offset(v);v.paused=true;stopSource(v);metrics.paused++;return true;},
        resume(id){const v=voices.get(id);if(!v||closed||!v.paused)return false;v.paused=false;start(v);metrics.resumed++;return true;},
        stop(id){const v=voices.get(id);if(v){voices.delete(id);destroy(v);metrics.stopped++;}},
    };
    return {api,visibility(value){visible=value;native.visibility(value);synchronize();},
        dispose(){if(closed)return;closed=true;native.dispose();for(const remove of registrations.splice(0))remove();for(const v of voices.values())destroy(v);voices.clear();buffers.clear();bytes=0;const current=context;context=null;try{Promise.resolve(current?.close()).catch(e=>fail('audio-close',e));}catch(e){fail('audio-close',e);}},
        snapshot:()=>({...metrics,native:native.snapshot(),state:state(),closed,visible,interrupted,buffers:buffers.size,pcmBytes:bytes,voices:voices.size,listeners:registrations.length,error})};
}

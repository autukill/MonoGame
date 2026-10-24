// Native on-demand file playback; no C# PCM worker or full music decode.
export function createWeChatFileAudio(wx,resolve,mark=()=>{}){
 let next=0,closed=false,visible=true,interrupted=false;const entries=new Map();
 const metrics={prepared:0,playRequests:0,started:0,ended:0,failed:0,released:0};
 const live=p=>!closed&&entries.get(p.id)===p;
 function destroy(p){clearTimeout(p.timer);p.timer=null;const c=p.context;p.context=null;if(!c)return;for(const [event,fn]of p.listeners)c['off'+event](fn);p.listeners=[];try{c.destroy();}catch(e){mark('audio-native-cleanup','FAIL',String(e?.errMsg||e));}}
 function fail(p,e){if(!live(p)||p.state>=3)return;p.error=String(e?.errMsg||e?.message||e);p.state=4;metrics.failed++;destroy(p);mark('audio-native','FAIL',JSON.stringify({path:p.path,error:p.error}));}
 function begin(p){if(!live(p)||!p.context||!p.ready||!p.requested||p.paused||!visible||interrupted||p.started&&!p.systemPaused)return;try{if(p.offset&&!p.started)p.context.seek(p.offset);p.context.play();p.started=true;p.systemPaused=false;metrics.started++;}catch(e){fail(p,e);}}
 function synchronize(){for(const p of entries.values()){if(!p.context||!p.requested||p.state>=3)continue;if(!visible||interrupted){if(p.started&&!p.paused&&!p.systemPaused){p.context.pause();p.systemPaused=true;}}else begin(p);}}
 function get(id){const p=entries.get(id);if(closed||!p)throw Error('Native audio preparation unavailable');return p;}
 function mix(p,volume,pan,pitch,loop){if(!Number.isFinite(volume)||volume<0||volume>1||!Number.isFinite(pitch)||pitch<.5||pitch>2||pan!==0)throw Error('Unsupported native file audio mix');if(!p.context)return;p.context.volume=volume;p.context.loop=!!loop;p.context.playbackRate=pitch;}
 const api={
  nativePrepare(path){if(closed)throw Error('Native audio disposed');if(typeof wx.createInnerAudioContext!=='function')throw Error('wx.createInnerAudioContext unavailable');if(entries.size>=8)throw Error('Native audio preparation budget exceeded');if(!/^\/?[-a-zA-Z0-9_./]+[.](?:wav|mp3)$/.test(path)||path.split('/').some(p=>p==='..'||p==='.'))throw Error('Invalid native audio package path');
   const file=resolve('runtime/'+path.replace(/^\/+/,'')),context=wx.createInnerAudioContext(),p={id:++next,path,file,context,listeners:[],state:0,error:'',ready:false,requested:false,started:false,paused:false,systemPaused:false,offset:0};entries.set(p.id,p);metrics.prepared++;
   const on=(event,fn)=>{if(typeof context['on'+event]!=='function'||typeof context['off'+event]!=='function')throw Error('Native audio event unavailable: '+event);context['on'+event](fn);p.listeners.push([event,fn]);};
   try{on('Canplay',()=>{if(!live(p)||p.state>=3)return;p.ready=true;clearTimeout(p.timer);p.timer=null;p.state=p.requested?2:1;begin(p);});on('Ended',()=>{if(!live(p)||p.state>=3)return;p.state=3;metrics.ended++;destroy(p);});on('Error',e=>fail(p,e));context.autoplay=false;context.loop=false;context.volume=1;context.obeyMuteSwitch=true;p.timer=setTimeout(()=>fail(p,Error('Native audio preparation timeout')),15000);context.src=file;return p.id;}catch(e){destroy(p);entries.delete(p.id);throw e;}
  },
  nativeSeek(id,value){if(!Number.isFinite(value)||value<0)throw Error('Invalid song start position');const p=get(id);p.offset=value;if(p.ready&&p.context)p.context.seek(value);},nativePosition:id=>entries.get(id)?.context?.currentTime??entries.get(id)?.offset??0,nativeDuration:id=>entries.get(id)?.context?.duration??0,
  nativeState:id=>entries.get(id)?.state??5,nativeError:id=>entries.get(id)?.error||'',
  nativePlay(id,volume,pan,pitch,loop){const p=get(id);if(p.requested||p.state>=3)throw Error('Native preparation is single use');mix(p,volume,pan,pitch,loop);p.requested=true;p.state=p.ready?2:0;metrics.playRequests++;begin(p);},
  nativeMix(id,...args){mix(get(id),...args);},
  nativePause(id){const p=entries.get(id);if(!p||!p.requested||p.state>=3||p.paused)return false;p.paused=true;if(p.context&&p.started)p.context.pause();return true;},
  nativeResume(id){const p=entries.get(id);if(!p||!p.requested||p.state>=3||!p.paused)return false;p.paused=false;p.systemPaused=true;begin(p);return true;},
  nativeRelease(id){const p=entries.get(id);if(!p)return;if(p.state<3)p.state=5;destroy(p);entries.delete(id);metrics.released++;}
 };
 return {api,visibility(value){visible=value;synchronize();},interruption(value){interrupted=value;synchronize();},snapshot:()=>({...metrics,contexts:[...entries.values()].filter(p=>p.context).length,preparations:entries.size,playing:[...entries.values()].filter(p=>p.requested&&p.state<3).length,closed}),dispose(){if(closed)return;for(const id of [...entries.keys()])api.nativeRelease(id);closed=true;}};
}

// MonoGame WeChat platform audio. See LICENSE.txt and notices.
#include "api_MGA.h"
#include <emscripten/emscripten.h>
#include <cmath>
#include <memory>
EM_JS(int, WX_AudioReady, (), { return globalThis.MonoGameWeChat.audio.state()===3?1:0; });
EM_JS(int, WX_Buffer, (const unsigned char* p,int size,int format,int channels,int rate), {return globalThis.MonoGameWeChat.audio.createBuffer(HEAPU8.subarray(p,p+size),format,channels,rate);});
EM_JS(void, WX_Delete, (int id), {globalThis.MonoGameWeChat.audio.deleteBuffer(id);});
EM_JS(int, WX_Play, (int id,double volume,double pan,double pitch,int loop,double begin,double end), {return globalThis.MonoGameWeChat.audio.play(id,volume,pan,pitch,!!loop,begin,end);});
EM_JS(void, WX_Mix, (int id,double volume,double pan,double pitch,int loop), {globalThis.MonoGameWeChat.audio.mix(id,volume,pan,pitch,!!loop);});
EM_JS(void, WX_Stop, (int id,int immediate), {if(immediate)globalThis.MonoGameWeChat.audio.stop(id);else globalThis.MonoGameWeChat.audio.finishLoop(id);});
EM_JS(void, WX_Pause, (int id), {globalThis.MonoGameWeChat.audio.pause(id);});
EM_JS(void, WX_Resume, (int id), {globalThis.MonoGameWeChat.audio.resume(id);});
EM_JS(int, WX_Playing, (int id), {return globalThis.MonoGameWeChat.audio.playing(id)?1:0;});
EM_JS(double, WX_Position, (int id), {return globalThis.MonoGameWeChat.audio.position(id)*1000;});
struct MGA_System {};
struct BufferData { int id=0,rate=0,channels=0,bits=0,loopStart=0,loopLength=0,frames=0; ~BufferData(){if(id)WX_Delete(id);} };
struct MGA_Buffer {std::shared_ptr<BufferData> data=std::make_shared<BufferData>();};
struct MGA_Voice {std::shared_ptr<BufferData> buffer; int id=0;float volume=1,pan=0,pitch=0;bool paused=false,looped=false;};
static void unsupported(){emscripten_throw_string("This audio feature is outside the WeChat 2D audio profile");}
static void mix(MGA_Voice* v){if(v&&v->id)WX_Mix(v->id,v->volume,v->pan,std::pow(2.0,v->pitch),v->looped);}
MGA_System* MGA_System_Create(){return WX_AudioReady()?new MGA_System():nullptr;}
void MGA_System_Destroy(MGA_System* s){delete s;}
mgint MGA_System_GetMaxInstances(){return 128;}
void MGA_System_SetReverbSettings(MGA_System*,ReverbSettings&){unsupported();}
MGA_Buffer* MGA_Buffer_Create(MGA_System*){return new MGA_Buffer();}
void MGA_Buffer_Destroy(MGA_Buffer* b){delete b;}
void MGA_Buffer_InitializePCM(MGA_Buffer* b,mgbyte* data,mgint offset,mgint length,mgint bits,mgint rate,mgint channels,mgint loopStart,mgint loopLength){
 if(!b||!data||offset<0||length<=0||(bits!=8&&bits!=16&&bits!=32)||channels<1||channels>2||rate<8000){unsupported();return;}
 auto d=std::make_shared<BufferData>();d->rate=rate;d->channels=channels;d->bits=bits;d->frames=length/(channels*(bits/8));d->loopStart=loopStart;d->loopLength=loopLength;
 d->id=WX_Buffer(data+offset,length,bits==8?0:bits==16?1:2,channels,rate);b->data=d;
}
static unsigned short u16(const mgbyte* p){return p[0]|(p[1]<<8);}static unsigned u32(const mgbyte* p){return p[0]|(p[1]<<8)|(p[2]<<16)|(p[3]<<24);}
void MGA_Buffer_InitializeFormat(MGA_Buffer* b,mgbyte* h,mgbyte* data,mgint size,mgint start,mgint length){if(!h){unsupported();return;}auto tag=u16(h);auto bits=u16(h+14);if((tag!=1&&tag!=3)||(tag==3&&bits!=32)||(tag==1&&bits!=8&&bits!=16)){unsupported();return;}MGA_Buffer_InitializePCM(b,data,0,size,bits,u32(h+4),u16(h+2),start,length);}
void MGA_Buffer_InitializeXact(MGA_Buffer*,mguint,mgbyte*,mgint,mgint,mgint,mgint,mgint,mgint){unsupported();}
mgulong MGA_Buffer_GetDuration(MGA_Buffer* b){return b&&b->data->rate?1000ULL*b->data->frames/b->data->rate:0;}
MGA_Voice* MGA_Voice_Create(MGA_System*,mgint rate,mgint channels){if(rate||channels){unsupported();return nullptr;}return new MGA_Voice();}
void MGA_Voice_Destroy(MGA_Voice* v){if(!v)return;if(v->id)WX_Stop(v->id,1);delete v;}
mgint MGA_Voice_GetBufferCount(MGA_Voice*){unsupported();return 0;}
mgint MGA_Voice_GetFinishedBufferCount(MGA_Voice*){unsupported();return 0;}
void MGA_Voice_SetBuffer(MGA_Voice* v,MGA_Buffer* b){if(v->id)WX_Stop(v->id,1);v->id=0;v->buffer=b->data;}
void MGA_Voice_AppendBuffer(MGA_Voice*,mgbyte*,mguint){unsupported();}
void MGA_Voice_Play(MGA_Voice* v,mgbyte looped){if(!v||!v->buffer)return;if(v->id)WX_Stop(v->id,1);v->looped=looped;v->paused=false;auto b=v->buffer;v->id=WX_Play(b->id,v->volume,v->pan,std::pow(2.0,v->pitch),looped,double(b->loopStart)/b->rate,b->loopLength?double(b->loopStart+b->loopLength)/b->rate:double(b->frames)/b->rate);}
void MGA_Voice_Pause(MGA_Voice* v){if(v&&v->id){WX_Pause(v->id);v->paused=true;}}
void MGA_Voice_Resume(MGA_Voice* v){if(v&&v->id){WX_Resume(v->id);v->paused=false;}}
void MGA_Voice_Stop(MGA_Voice* v,mgbyte immediate){if(v&&v->id){WX_Stop(v->id,immediate);if(immediate)v->id=0;else v->looped=false;}}
MGSoundState MGA_Voice_GetState(MGA_Voice* v){return !v||!v->id||!WX_Playing(v->id)?MGSoundState::Stopped:v->paused?MGSoundState::Paused:MGSoundState::Playing;}
mgulong MGA_Voice_GetPosition(MGA_Voice* v){return v&&v->id?WX_Position(v->id):0;}
void MGA_Voice_SetPan(MGA_Voice* v,mgfloat n){v->pan=n;mix(v);}void MGA_Voice_SetPitch(MGA_Voice* v,mgfloat n){v->pitch=n;mix(v);}void MGA_Voice_SetVolume(MGA_Voice* v,mgfloat n){v->volume=n;mix(v);}
void MGA_Voice_SetReverbMix(MGA_Voice*,mgfloat){unsupported();}void MGA_Voice_SetFilterMode(MGA_Voice*,MGFilterMode,mgfloat,mgfloat){unsupported();}void MGA_Voice_ClearFilterMode(MGA_Voice*){unsupported();}void MGA_Voice_Apply3D(MGA_Voice*,Listener&,Emitter&,mgfloat){unsupported();}

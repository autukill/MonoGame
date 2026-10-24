// Standard Song/MediaPlayer transport over the shared WeChat file-audio service.
#include "api_MGM.h"
#include <emscripten/emscripten.h>
#include <string>
EM_JS(int, WX_SongPrepare, (const char* p), {return globalThis.MonoGameWeChat.audio.nativePrepare(UTF8ToString(p));});
EM_JS(void, WX_SongPlay, (int id,double offset,double volume), {globalThis.MonoGameWeChat.audio.nativeSeek(id,offset/1000);globalThis.MonoGameWeChat.audio.nativePlay(id,volume,0,1,false);});
EM_JS(void, WX_SongRelease, (int id), {globalThis.MonoGameWeChat.audio.nativeRelease(id);});
EM_JS(int, WX_SongState, (int id), {return globalThis.MonoGameWeChat.audio.nativeState(id);});
EM_JS(void, WX_SongPause, (int id), {globalThis.MonoGameWeChat.audio.nativePause(id);});
EM_JS(void, WX_SongResume, (int id), {globalThis.MonoGameWeChat.audio.nativeResume(id);});
EM_JS(void, WX_SongVolume, (int id,double n), {globalThis.MonoGameWeChat.audio.nativeMix(id,n,0,1,false);});
EM_JS(double, WX_SongPosition, (int id), {return globalThis.MonoGameWeChat.audio.nativePosition(id)*1000;});
EM_JS(double, WX_SongDuration, (int id), {return globalThis.MonoGameWeChat.audio.nativeDuration(id)*1000;});
struct MGM_Song {std::string path;int id=0;mgulong generation=0;float volume=1;bool active=false;};
MGM_Song* MGM_Song_Create(const char* path,MGA_System*,MGM_SongInfo& info){info={};if(!path)return nullptr;auto s=new MGM_Song();s->path=path;return s;}
void MGM_Song_Stop(MGM_Song* s){if(!s)return;s->active=false;if(s->id)WX_SongRelease(s->id);s->id=0;}
void MGM_Song_Destroy(MGM_Song* s){MGM_Song_Stop(s);delete s;}
mgbyte MGM_Song_Play(MGM_Song* s,mgulong offset,mgulong generation){if(!s)return 0;MGM_Song_Stop(s);s->generation=generation;s->id=WX_SongPrepare(s->path.c_str());s->active=true;WX_SongPlay(s->id,offset,s->volume);return 1;}
void MGM_Song_Pause(MGM_Song* s){if(s&&s->id)WX_SongPause(s->id);}void MGM_Song_Resume(MGM_Song* s){if(s&&s->id)WX_SongResume(s->id);}
void MGM_Song_SetVolume(MGM_Song* s,mgfloat v){s->volume=v;if(s->id)WX_SongVolume(s->id,v);}
mgulong MGM_Song_GetPosition(MGM_Song* s){return s&&s->id?WX_SongPosition(s->id):0;}mgulong MGM_Song_GetDuration(MGM_Song* s){return s&&s->id?WX_SongDuration(s->id):0;}
mgbyte MGM_Song_TryDequeueEvent(MGM_Song* s,MGM_SongEvent& e){if(!s||!s->active||!s->id)return 0;int state=WX_SongState(s->id);if(state!=3&&state!=4)return 0;s->active=false;e.type=state==3?MGSongEventType::Completed:MGSongEventType::Failed;e.generation=s->generation;return 1;}
static void unsupported(){emscripten_throw_string("Video and media decoding are not part of the WeChat 2D audio profile");}
MGM_AudioDecoder* MGM_AudioDecoder_Create(const char*,MGM_AudioDecoderInfo&){unsupported();return nullptr;}void MGM_AudioDecoder_Destroy(MGM_AudioDecoder*){unsupported();}void MGM_AudioDecoder_SetPosition(MGM_AudioDecoder*,mgulong){unsupported();}mgbyte MGM_AudioDecoder_Decode(MGM_AudioDecoder*,mgbyte*&,mguint&){unsupported();return 0;}
MGM_VideoDecoder* MGM_VideoDecoder_Create(MGG_GraphicsDevice*,const char*,MGM_VideoDecoderInfo&){unsupported();return nullptr;}void MGM_VideoDecoder_Destroy(MGM_VideoDecoder*){unsupported();}MGM_AudioDecoder* MGM_VideoDecoder_GetAudioDecoder(MGM_VideoDecoder*,MGM_AudioDecoderInfo&){unsupported();return nullptr;}mgulong MGM_VideoDecoder_GetPosition(MGM_VideoDecoder*){unsupported();return 0;}void MGM_VideoDecoder_SetLooped(MGM_VideoDecoder*,mgbyte){unsupported();}MGG_Texture* MGM_VideoDecoder_Decode(MGM_VideoDecoder*){unsupported();return nullptr;}

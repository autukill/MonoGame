using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input.Touch;
using Microsoft.Xna.Framework.Audio;
using Microsoft.Xna.Framework.Media;
using MonoGame.Runtime.WeChat.WebGL2;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
namespace IndependentMonoGame;
[SupportedOSPlatform("browser")]
public static partial class Program
{
 static ProbeGame? game;
 public static async Task Main(){Mark("entry","PASS");game=new();await WeChatGame.RunAsync(game);Mark("exit","PASS");}
 [JSImport("globalThis.MonoGameWeChat.mark")] public static partial void Mark(string stage,string result,string detail="");
 [JSExport] public static string Snapshot()=>game is null?"{}":$"{{\"draws\":{game.Frames},\"updates\":{game.Steps},\"presses\":{game.Presses},\"moves\":{game.Moves},\"releases\":{game.Releases},\"soundStarts\":{game.SoundStarts},\"musicEvents\":{game.MusicEvents}}}";
 sealed class ProbeGame:Game
 {
  readonly GraphicsDeviceManager graphics;SpriteBatch? sprites;Texture2D? pixel;SoundEffect? sound;Song? song;SoundEffectInstance? instance;float phase;bool gpuChecked;
  public int Frames,Steps,Presses,Moves,Releases,SoundStarts,MusicEvents;
  public ProbeGame(){graphics=new(this){PreferredBackBufferWidth=WeChatGame.SurfaceWidth,PreferredBackBufferHeight=WeChatGame.SurfaceHeight,GraphicsProfile=GraphicsProfile.HiDef};IsFixedTimeStep=false;Content.RootDirectory="Content";}
  protected override void LoadContent(){sprites=new(GraphicsDevice);pixel=new(GraphicsDevice,1,1);pixel.SetData(new[]{Color.White});sound=SoundEffect.FromFile("/Content/tone.wav");song=Song.FromUri("tone",new Uri("/Content/tone.wav",UriKind.RelativeOrAbsolute));MediaPlayer.MediaStateChanged+=(_,_)=>MusicEvents++;instance=sound.CreateInstance();instance.Volume=.2f;instance.Pan=-.3f;instance.Pitch=.25f;Mark("content","PASS");}
  protected override void Update(GameTime time){Steps++;phase+=(float)time.ElapsedGameTime.TotalSeconds;foreach(var t in TouchPanel.GetState()){if(t.State==TouchLocationState.Pressed){Presses++;instance!.Play();SoundStarts++;MediaPlayer.Play(song!);Mark("audio-start","PASS");}else if(t.State==TouchLocationState.Moved)Moves++;else if(t.State==TouchLocationState.Released)Releases++;}base.Update(time);}
  protected override void Draw(GameTime time){Frames++;if(!gpuChecked){using var rt=new RenderTarget2D(GraphicsDevice,4,4);GraphicsDevice.SetRenderTarget(rt);GraphicsDevice.Clear(Color.Red);GraphicsDevice.SetRenderTarget(null);var data=new Color[16];rt.GetData(data);if(data.Any(c=>c.R!=255||c.G!=0||c.B!=0))throw new Exception("GPU texture readback failed");gpuChecked=true;Mark("gpu","PASS");}GraphicsDevice.Clear(new Color(15,27,43));sprites!.Begin();sprites.Draw(pixel!,new Rectangle((int)(50+Math.Sin(phase)*30),80,60,60),Color.Cyan);sprites.End();base.Draw(time);}
  protected override void UnloadContent(){MediaPlayer.Stop();instance?.Dispose();song?.Dispose();sound?.Dispose();sprites?.Dispose();pixel?.Dispose();base.UnloadContent();}
 }
}

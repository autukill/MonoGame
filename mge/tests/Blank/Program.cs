using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
System.Runtime.GCSettings.LatencyMode=System.Runtime.GCLatencyMode.SustainedLowLatency;
double stopAfter=args is ["--seconds",var value]?double.Parse(value,System.Globalization.CultureInfo.InvariantCulture):0;
using var game=new Blank(stopAfter);game.Run();
sealed class Blank:Game
{
 readonly GraphicsDeviceManager graphics;
 readonly double stopAfter;
 public Blank(double seconds){stopAfter=seconds;graphics=new(this){PreferredBackBufferWidth=1280,PreferredBackBufferHeight=720,PreferredBackBufferFormat=SurfaceFormat.Color,PreferredDepthStencilFormat=DepthFormat.Depth24Stencil8,GraphicsProfile=GraphicsProfile.HiDef,SynchronizeWithVerticalRetrace=true};IsFixedTimeStep=true;TargetElapsedTime=TimeSpan.FromSeconds(1d/60);InactiveSleepTime=TimeSpan.Zero;Window.Title="MyGameEngine MonoGame DX12 empty window";}
 protected override void Update(GameTime time){if(stopAfter>0 && time.TotalGameTime.TotalSeconds>=stopAfter)Exit();base.Update(time);}
 protected override void Draw(GameTime time)=>GraphicsDevice.Clear(Color.Black);
}

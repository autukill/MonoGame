using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
System.Runtime.GCSettings.LatencyMode=System.Runtime.GCLatencyMode.SustainedLowLatency;
using var game=new Blank();game.Run();
sealed class Blank:Game
{
 readonly GraphicsDeviceManager graphics;
 public Blank(){graphics=new(this){PreferredBackBufferWidth=1280,PreferredBackBufferHeight=720,PreferredBackBufferFormat=SurfaceFormat.Color,PreferredDepthStencilFormat=DepthFormat.Depth24Stencil8,GraphicsProfile=GraphicsProfile.HiDef,SynchronizeWithVerticalRetrace=true};IsFixedTimeStep=true;TargetElapsedTime=TimeSpan.FromSeconds(1d/60);InactiveSleepTime=TimeSpan.Zero;Window.Title="MyGameEngine MonoGame DX12 empty window";}
 protected override void Draw(GameTime time)=>GraphicsDevice.Clear(Color.Black);
}

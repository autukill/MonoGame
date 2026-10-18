using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

// Independent public-API regression: old recorded draws must survive later Discard.
sealed class DynamicBufferProbe : Game
{
    readonly GraphicsDeviceManager graphics;
    RenderTarget2D target = null!;
    BasicEffect effect = null!;
    RasterizerState rasterizer = null!;
    public int Frames { get; private set; }
    public DynamicBufferProbe()
    {
        graphics=new(this) { PreferredBackBufferWidth=320, PreferredBackBufferHeight=180,
            GraphicsProfile=GraphicsProfile.HiDef, SynchronizeWithVerticalRetrace=true };
        IsFixedTimeStep=false; Window.Title="DX12 dynamic buffer version regression";
    }
    protected override void LoadContent()
    {
        target=new(GraphicsDevice,32,32,false,SurfaceFormat.Color,DepthFormat.None);
        effect=new(GraphicsDevice) { VertexColorEnabled=true };
        rasterizer=new() { CullMode=CullMode.None, ScissorTestEnable=true };
    }
    static VertexPositionColor[] Triangle(Color color) => [
        new(new(-1,-1,0),color),new(new(3,-1,0),color),new(new(-1,3,0),color)];
    protected override void Draw(GameTime time)
    {
        using var vb=new DynamicVertexBuffer(GraphicsDevice,typeof(VertexPositionColor),2048+Frames*64,BufferUsage.WriteOnly);
        using var ib=new DynamicIndexBuffer(GraphicsDevice,IndexElementSize.SixteenBits,2048+Frames*64,BufferUsage.WriteOnly);
        int stride=VertexPositionColor.VertexDeclaration.VertexStride;
        GraphicsDevice.SetRenderTarget(target); GraphicsDevice.Clear(Color.Black);
        GraphicsDevice.SetVertexBuffer(vb); GraphicsDevice.Indices=ib;
        GraphicsDevice.RasterizerState=rasterizer; GraphicsDevice.DepthStencilState=DepthStencilState.None;
        GraphicsDevice.BlendState=BlendState.Opaque;
        void Draw(int x,int y,int vertex=0)
        {
            GraphicsDevice.ScissorRectangle=new(x,y,16,16);
            effect.CurrentTechnique.Passes[0].Apply();
            GraphicsDevice.DrawIndexedPrimitives(PrimitiveType.TriangleList,vertex,0,1);
        }
        var first=Frames%2==0 ? SetDataOptions.Discard : SetDataOptions.NoOverwrite;
        vb.SetData(0,Triangle(Color.Red),0,3,stride,first);
        ib.SetData(new short[]{0,1,2},0,3,first); Draw(0,0);
        vb.SetData(0,Triangle(Color.Green),0,3,stride,SetDataOptions.Discard);
        ib.SetData(new short[]{0,2,1},0,3,SetDataOptions.Discard); Draw(16,0);
        vb.SetData(3*stride,Triangle(Color.Blue),0,3,stride,SetDataOptions.NoOverwrite); Draw(0,16,3);
        vb.SetData(0,Triangle(Color.Yellow),0,3,stride,SetDataOptions.Discard);
        ib.SetData(new short[]{2,1,0},0,3,SetDataOptions.Discard); Draw(16,16);
        GraphicsDevice.SetRenderTarget(null);
        var pixels=new Color[32*32]; target.GetData(pixels);
        for(int y=0;y<32;y++)for(int x=0;x<32;x++)
        {
            var expected=y<16 ? (x<16 ? Color.Red : Color.Green) : (x<16 ? Color.Blue : Color.Yellow);
            if(pixels[y*32+x]!=expected)throw new InvalidOperationException($"Dynamic buffer frame {Frames} pixel {x},{y}: {pixels[y*32+x]} != {expected}");
        }
        GraphicsDevice.ScissorRectangle=GraphicsDevice.Viewport.Bounds; GraphicsDevice.Clear(Color.Black);
        if(++Frames==6) { Console.WriteLine("Dynamic buffers: vertex/index, first/later Discard, NoOverwrite, offsets, growing sizes, six frames of exact GPU pixels passed."); Exit(); }
    }
    protected override void UnloadContent() { rasterizer.Dispose();effect.Dispose();target.Dispose(); }
}

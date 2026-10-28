using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using System.Text.Json;

// Independent public-API GPU test. No engine/player dependency or runtime switch.
sealed class Bc7Probe : Game
{
    readonly string output;
    readonly List<object> results = new();
    SpriteBatch batch = null!;
    RenderTarget2D target = null!;
    int frames;
    public Bc7Probe(string output)
    {
        this.output = output;
        _ = new GraphicsDeviceManager(this) { PreferredBackBufferWidth=320, PreferredBackBufferHeight=180,
            GraphicsProfile=GraphicsProfile.HiDef, SynchronizeWithVerticalRetrace=false };
        Window.Title="Maintained DX12 BC7 verification";
        IsFixedTimeStep=false;
    }
    protected override void LoadContent()
    {
        batch = new(GraphicsDevice);
        target = new(GraphicsDevice, 32, 32, false, SurfaceFormat.Color, DepthFormat.None);
    }
    // BC7 mode 6: equal RGBA endpoints, common endpoint p-bit, zero indices.
    static byte[] Block(Color c)
    {
        byte[] b=new byte[16]; int at=0;
        void Put(int value,int count) { for(int n=0;n<count;n++,at++) b[at/8]|=(byte)(((value>>n)&1)<<(at%8)); }
        Put(1<<6,7);
        foreach(int value in new[]{c.R,c.G,c.B,c.A}) { Put(value>>1,7); Put(value>>1,7); }
        Put(c.R&1,1); Put(c.R&1,1); // all fixture channels share their LSB
        return b;
    }
    protected override void Draw(GameTime gameTime)
    {
        if(frames++!=0){Exit();return;}
        foreach(var format in new[]{SurfaceFormat.Bc7,SurfaceFormat.Bc7SRgb})
        foreach(var size in new[]{(4,4),(36,36),(7,5),(2,2),(1,1),(16,8)})
        {
            // D3D12 rejects non-block-aligned base resources; do not attempt an invalid
            // native allocation across the C ABI. The engine's capability guard uses this rule.
            if(size.Item1%4!=0||size.Item2%4!=0) {results.Add(new{format=format.ToString(),width=size.Item1,height=size.Item2,status="unsupported-base"});continue;}
            bool mips=size==(16,8);
            using var tex=new Texture2D(GraphicsDevice,size.Item1,size.Item2,mips,format);
            for(int level=0;level<tex.LevelCount;level++)
            {
                int w=Math.Max(1,tex.Width>>level),h=Math.Max(1,tex.Height>>level);
                byte[] block=Block(new Color(128,64,32,254));
                byte[] data=new byte[((w+3)/4)*((h+3)/4)*16];
                for(int i=0;i<data.Length;i+=16)block.CopyTo(data,i);
                tex.SetData(level,null,data,0,data.Length);
                byte[] back=new byte[data.Length];tex.GetData(level,null,back,0,back.Length);
                if(!back.SequenceEqual(data))throw new InvalidOperationException($"BC7 compressed readback {format}/{w}x{h}/mip{level}");
            }
            bool rejected=false;try{tex.SetData(new byte[3]);}catch(ArgumentException){rejected=true;}
            if(!rejected)throw new InvalidOperationException("BC7 invalid length accepted");
            GraphicsDevice.SetRenderTarget(target);GraphicsDevice.Clear(Color.Transparent);
            batch.Begin(SpriteSortMode.Deferred,BlendState.Opaque,SamplerState.PointClamp,DepthStencilState.None,RasterizerState.CullNone);
            batch.Draw(tex,new Rectangle(0,0,32,32),Color.White);batch.End();GraphicsDevice.SetRenderTarget(null);
            Color[] pixels=new Color[32*32];target.GetData(pixels);
            Color expected=format==SurfaceFormat.Bc7?new Color(128,64,32,254):new Color(55,13,4,254);
            foreach(var p in pixels) if(Math.Abs(p.R-expected.R)>1||Math.Abs(p.G-expected.G)>1||Math.Abs(p.B-expected.B)>1||p.A!=254)
                throw new InvalidOperationException($"BC7 sampled pixel {format}: {p}, expected {expected}");
            results.Add(new{format=format.ToString(),width=tex.Width,height=tex.Height,mips=tex.LevelCount,status="passed"});
        }
        File.WriteAllText(output,JsonSerializer.Serialize(new{status="passed",cases=results},new JsonSerializerOptions{WriteIndented=true}));
        Exit();
    }
    protected override void UnloadContent(){target.Dispose();batch.Dispose();}
}

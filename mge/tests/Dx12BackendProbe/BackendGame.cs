using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

// All inputs are procedural; this class has no content pipeline or game reference.
internal sealed class BackendGame : Game
{
    readonly GraphicsDeviceManager graphics;
    readonly BackendStage result;
    readonly Action<string> log;
    readonly Action checkNative;
    SpriteBatch batch = null!;
    Texture2D white = null!, changing = null!;
    RenderTarget2D mip = null!, target = null!;
    Color[] backbuffer = [];
    readonly Color[] pixels = new Color[32 * 16];
    int resizeStep;
    public BackendGame(int cycle, BackendStage result, Action<string> log, Action checkNative)
    {
        this.result = result; this.log = log; this.checkNative = checkNative;
        graphics = new(this) { PreferredBackBufferWidth = 640, PreferredBackBufferHeight = 360,
            PreferredBackBufferFormat = SurfaceFormat.Color, PreferredDepthStencilFormat = DepthFormat.Depth24Stencil8,
            GraphicsProfile = GraphicsProfile.HiDef, SynchronizeWithVerticalRetrace = true };
        IsFixedTimeStep = false; InactiveSleepTime = TimeSpan.Zero;
        Window.Title = $"Standalone maintained DX12 backend probe - cycle {cycle + 1}/3";
    }
    protected override void LoadContent()
    {
        checkNative();
        result.Adapter = GraphicsDevice.Adapter.Description;
        result.WindowHandle = Window.Handle.ToInt64();
        if (result.WindowHandle == 0) throw new InvalidOperationException("No native application window");
        log("adapter=" + result.Adapter + "; window=" + result.WindowHandle);
        GraphicsDevice.DeviceReset += (_, _) => ++result.DeviceResets;
        batch = new(GraphicsDevice);
        white = new(GraphicsDevice, 1, 1); white.SetData(new[] { Color.White });
        changing = new(GraphicsDevice, 1, 1);
        mip = new(GraphicsDevice, 16, 16, true, SurfaceFormat.Color, DepthFormat.None);
        target = new(GraphicsDevice, 32, 16, false, SurfaceFormat.Color, DepthFormat.None);
    }
    protected override void Update(GameTime gameTime)
    {
        if (result.Frames >= 9) { Exit(); return; }
        if ((result.Frames == 2 && resizeStep == 0) || (result.Frames == 5 && resizeStep == 1))
        {
            int before = GraphicsDevice.PresentationParameters.BackBufferWidth;
            graphics.PreferredBackBufferWidth = resizeStep == 0 ? 800 : 640;
            graphics.PreferredBackBufferHeight = resizeStep == 0 ? 450 : 360;
            graphics.ApplyChanges();
            if (GraphicsDevice.PresentationParameters.BackBufferWidth == before)
                throw new InvalidOperationException("Swapchain resize did not change the backbuffer");
            ++resizeStep; ++result.ResizeChecks;
            log($"resize={GraphicsDevice.PresentationParameters.BackBufferWidth}x{GraphicsDevice.PresentationParameters.BackBufferHeight}");
        }
        base.Update(gameTime);
    }
    void Begin() => batch.Begin(SpriteSortMode.Deferred, BlendState.Opaque, SamplerState.PointClamp, DepthStencilState.None, RasterizerState.CullNone);
    void Check(Color actual, Color expected, string where)
    {
        if (actual != expected) throw new InvalidOperationException($"{result.Name} frame {result.Frames} {where}: {actual} != {expected}");
        ++result.PixelChecks;
    }
    protected override void Draw(GameTime gameTime)
    {
        Color second = result.Frames % 2 == 0 ? Color.Blue : Color.Green;
        changing.SetData(new[] { second });
        GraphicsDevice.SetRenderTarget(mip); GraphicsDevice.Clear(Color.Black);
        Begin(); batch.Draw(white, new Rectangle(0, 0, 16, 16), Color.Red); batch.End();
        // Switching targets generates mips through the actual native compute path.
        GraphicsDevice.SetRenderTarget(target); GraphicsDevice.Clear(Color.Black);
        Begin();
        batch.Draw(mip, new Rectangle(0, 0, 16, 16), Color.White);
        batch.Draw(changing, new Rectangle(16, 0, 16, 16), Color.White);
        batch.End(); GraphicsDevice.SetRenderTarget(null);
        target.GetData(pixels);
        for (int y = 0; y < 16; ++y) for (int x = 0; x < 32; ++x)
            Check(pixels[y * 32 + x], x < 16 ? Color.Red : second, "offscreen");
        for (int level = 1, size = 8; size > 0; ++level, size >>= 1)
        {
            var values = new Color[size * size]; mip.GetData(level, null, values, 0, values.Length);
            foreach (var value in values) Check(value, Color.Red, "mip " + level);
        }
        int width = GraphicsDevice.PresentationParameters.BackBufferWidth, height = GraphicsDevice.PresentationParameters.BackBufferHeight;
        GraphicsDevice.Clear(Color.Black);
        Begin(); batch.Draw(target, new Rectangle(0, 0, width, height), Color.White); batch.End();
        if (result.Frames is 0 or 3 or 6)
        {
            if (backbuffer.Length != width * height) backbuffer = new Color[width * height];
            GraphicsDevice.GetBackBufferData(backbuffer);
            for (int y = 0; y < height; ++y) for (int x = 0; x < width; ++x)
                Check(backbuffer[y * width + x], x < width / 2 ? Color.Red : second, "backbuffer");
            log($"verified backbuffer={width}x{height}; frame={result.Frames}");
        }
        ++result.Frames;
    }
    protected override void EndDraw() { base.EndDraw(); ++result.Presents; }
    protected override void UnloadContent()
    { batch?.Dispose(); white?.Dispose(); changing?.Dispose(); mip?.Dispose(); target?.Dispose(); }
}

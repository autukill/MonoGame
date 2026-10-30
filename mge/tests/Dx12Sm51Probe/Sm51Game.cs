using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

internal sealed class Sm51Game : Game
{
    readonly GraphicsDeviceManager graphics;
    readonly BackendStage result;
    readonly Action<string> log;
    readonly Action checkNative;
    readonly bool stress;
    Effect effect = null!;
    Texture2D white = null!, changing = null!;
    RenderTarget2D mip = null!, target = null!;
    DynamicVertexBuffer vertices = null!;
    DynamicIndexBuffer indices = null!;
    readonly VertexPositionColorTexture[] quad = [
        new(new(-1, 1, 0), Color.White, new(0, 0)), new(new(1, 1, 0), Color.White, new(1, 0)),
        new(new(-1, -1, 0), Color.White, new(0, 1)), new(new(1, -1, 0), Color.White, new(1, 1))];
    readonly short[] order = [0, 1, 2, 2, 1, 3];
    int resizeStep;
    public Sm51Game(int cycle, BackendStage result, Action<string> log, Action checkNative, DepthFormat depthFormat, bool stress = false)
    {
        this.result = result; this.log = log; this.checkNative = checkNative; this.stress = stress;
        graphics = new(this) { PreferredBackBufferWidth = 640, PreferredBackBufferHeight = 360,
            PreferredBackBufferFormat = SurfaceFormat.Color, PreferredDepthStencilFormat = depthFormat,
            GraphicsProfile = GraphicsProfile.HiDef, SynchronizeWithVerticalRetrace = true };
        IsFixedTimeStep = false; InactiveSleepTime = TimeSpan.Zero;
        Window.Title = $"MonoGame DX12 SM5.1 probe - {(stress ? "constant ring" : "lifetime " + (cycle + 1))}";
    }
    protected override void LoadContent()
    {
        checkNative(); result.Adapter = GraphicsDevice.Adapter.Description; result.WindowHandle = Window.Handle.ToInt64();
        if (result.WindowHandle == 0) throw new InvalidOperationException("Missing window");
        log("adapter=" + result.Adapter + "; SM5.1 Effect fixture");
        GraphicsDevice.DeviceReset += (_, _) => ++result.DeviceResets;
        effect = Sm51Effect.Create(GraphicsDevice);
        white = new(GraphicsDevice, 1, 1); white.SetData(new[] { Color.White });
        changing = new(GraphicsDevice, 1, 1);
        mip = new(GraphicsDevice, 16, 16, true, SurfaceFormat.Color, DepthFormat.None);
        target = new(GraphicsDevice, stress ? 128 : 32, stress ? 64 : 16, false, SurfaceFormat.Color, DepthFormat.None);
        vertices = new(GraphicsDevice, VertexPositionColorTexture.VertexDeclaration, 8, BufferUsage.WriteOnly);
        indices = new(GraphicsDevice, IndexElementSize.SixteenBits, 12, BufferUsage.WriteOnly);
    }
    protected override void Update(GameTime gameTime)
    {
        if (result.Frames >= (stress ? 6 : 9)) { Exit(); return; }
        if (!stress && ((result.Frames == 2 && resizeStep == 0) || (result.Frames == 5 && resizeStep == 1)))
        {
            int before = GraphicsDevice.PresentationParameters.BackBufferWidth;
            graphics.PreferredBackBufferWidth = resizeStep == 0 ? 800 : 640;
            graphics.PreferredBackBufferHeight = resizeStep == 0 ? 450 : 360;
            graphics.ApplyChanges();
            if (GraphicsDevice.PresentationParameters.BackBufferWidth == before) throw new InvalidOperationException("Resize did not change swapchain");
            ++resizeStep; ++result.ResizeChecks;
        }
        base.Update(gameTime);
    }
    void BindQuad()
    {
        // Discard the first region, then append another live region without overwriting it.
        vertices.SetData(0, quad, 0, 4, VertexPositionColorTexture.VertexDeclaration.VertexStride, SetDataOptions.Discard);
        vertices.SetData(4 * VertexPositionColorTexture.VertexDeclaration.VertexStride, quad, 0, 4, VertexPositionColorTexture.VertexDeclaration.VertexStride, SetDataOptions.NoOverwrite);
        indices.SetData(0, order, 0, 6, SetDataOptions.Discard);
        indices.SetData(12, order, 0, 6, SetDataOptions.NoOverwrite);
        GraphicsDevice.SetVertexBuffer(vertices); GraphicsDevice.Indices = indices;
        GraphicsDevice.BlendState = BlendState.Opaque; GraphicsDevice.DepthStencilState = DepthStencilState.None;
        GraphicsDevice.RasterizerState = RasterizerState.CullNone; GraphicsDevice.SamplerStates[0] = SamplerState.PointClamp;
    }
    void DrawQuad(Texture2D texture, Color color, Vector4 transform, bool appended = false)
    {
        effect.Parameters["DataTexture"].SetValue(texture); effect.Parameters["Tint"].SetValue(color.ToVector4());
        effect.Parameters["ScaleOffset"].SetValue(transform);
        effect.CurrentTechnique.Passes[0].Apply();
        GraphicsDevice.DrawIndexedPrimitives(PrimitiveType.TriangleList, appended ? 4 : 0, appended ? 6 : 0, 2);
    }
    void Check(Color actual, Color expected, string where)
    {
        if (actual != expected) throw new InvalidOperationException($"{result.Name} frame {result.Frames} {where}: {actual} != {expected}");
        ++result.PixelChecks;
    }
    static readonly Vector4 Full = new(1, 1, 0, 0);
    protected override void Draw(GameTime gameTime)
    {
        BindQuad();
        if (stress)
        {
            GraphicsDevice.SetRenderTarget(target); GraphicsDevice.Clear(Color.Black);
            for (int i = 0; i < 5000; ++i) {
                int x = i % 128, y = i / 128;
                Color color = ((i + result.Frames) & 1) == 0 ? Color.Red : Color.Blue;
                DrawQuad(white, color, new(1f / 128, 1f / 64, -1 + (2 * x + 1) / 128f, 1 - (2 * y + 1) / 64f), (i & 1) != 0);
            }
            GraphicsDevice.SetRenderTarget(null);
            var values = new Color[128 * 64]; target.GetData(values);
            for (int i = 0; i < values.Length; ++i)
                Check(values[i], i >= 5000 ? Color.Black : ((i + result.Frames) & 1) == 0 ? Color.Red : Color.Blue, "constant ring");
            GraphicsDevice.Clear(Color.Black); DrawQuad(target, Color.White, Full);
        }
        else
        {
            Color second = result.Frames % 2 == 0 ? Color.Blue : Color.Green;
            changing.SetData(new[] { second });
            GraphicsDevice.SetRenderTarget(mip); GraphicsDevice.Clear(Color.Black); DrawQuad(white, Color.Red, Full);
            GraphicsDevice.SetRenderTarget(target); GraphicsDevice.Clear(Color.Black);
            DrawQuad(mip, Color.White, new(.5f, 1, -.5f, 0));
            DrawQuad(changing, Color.White, new(.5f, 1, .5f, 0), true);
            GraphicsDevice.SetRenderTarget(null);
            var values = new Color[32 * 16]; target.GetData(values);
            for (int y = 0; y < 16; ++y) for (int x = 0; x < 32; ++x) Check(values[y * 32 + x], x < 16 ? Color.Red : second, "offscreen");
            for (int level = 1, size = 8; size > 0; ++level, size >>= 1) {
                var pixels = new Color[size * size]; mip.GetData(level, null, pixels, 0, pixels.Length);
                foreach (var pixel in pixels) Check(pixel, Color.Red, "SM5.1 compute mip " + level);
            }
            int width = GraphicsDevice.PresentationParameters.BackBufferWidth, height = GraphicsDevice.PresentationParameters.BackBufferHeight;
            GraphicsDevice.Clear(Color.Black); DrawQuad(target, Color.White, Full);
            if (result.Frames is 0 or 3 or 6) {
                var pixels = new Color[width * height]; GraphicsDevice.GetBackBufferData(pixels);
                for (int y = 0; y < height; ++y) for (int x = 0; x < width; ++x)
                    Check(pixels[y * width + x], x < width / 2 ? Color.Red : second, "backbuffer");
            }
        }
        ++result.Frames;
    }
    protected override void EndDraw() { base.EndDraw(); ++result.Presents; }
    protected override void UnloadContent()
    { effect?.Dispose(); white?.Dispose(); changing?.Dispose(); mip?.Dispose(); target?.Dispose(); vertices?.Dispose(); indices?.Dispose(); }
}

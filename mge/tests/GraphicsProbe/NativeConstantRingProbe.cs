using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

// Independent GPU regression only: changes enough constants to cross a 1 MiB ring chunk,
// then verifies earlier draws and reuses every backbuffer over multiple frames.
internal static class NativeConstantRingProbe
{
    internal static int Run(string output, DepthFormat? depthFormat = null)
    {
        Directory.CreateDirectory(output);
        try
        {
            using var game = new RingGame(depthFormat);
            game.Run();
            if (game.VerifiedFrames != 6) throw new InvalidOperationException("Constant ring probe closed early.");
            File.WriteAllText(Path.Combine(output, "report.json"), JsonSerializer.Serialize(new NativeConstantRingResult
            { Completed = true, Frames = game.VerifiedFrames, DrawsPerFrame = 5000, ExactPixelTolerance = 1 }, NativeConstantRingJson.Default.NativeConstantRingResult));
            Console.WriteLine("Constant ring: 5000 distinct draws/frame, chunk rollover and six frames of pixel readback passed.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }

    private sealed class RingGame : Game
    {
        private readonly GraphicsDeviceManager graphics;
        private RenderTarget2D target = null!;
        private VertexBuffer vertices = null!;
        private BasicEffect effect = null!;
        private RasterizerState rasterizer = null!;
        private readonly Color[] pixels = new Color[128 * 64];
        internal int VerifiedFrames { get; private set; }
        internal RingGame(DepthFormat? depthFormat)
        {
            graphics = new(this) { PreferredBackBufferWidth = 320, PreferredBackBufferHeight = 180,
                GraphicsProfile = GraphicsProfile.HiDef, SynchronizeWithVerticalRetrace = true };
            if (depthFormat.HasValue) graphics.PreferredDepthStencilFormat = depthFormat.Value;
            IsFixedTimeStep = false;
            Window.Title = "DX12 constant ring regression";
        }
        protected override void LoadContent()
        {
            target = new(GraphicsDevice, 128, 64, false, SurfaceFormat.Color, DepthFormat.None);
            vertices = new(GraphicsDevice, typeof(VertexPositionColor), 3, BufferUsage.WriteOnly);
            vertices.SetData(new[] { new VertexPositionColor(new(-1,-1,0),Color.White),
                new VertexPositionColor(new(3,-1,0),Color.White), new VertexPositionColor(new(-1,3,0),Color.White) });
            effect = new(GraphicsDevice) { VertexColorEnabled = true };
            rasterizer = new() { CullMode = CullMode.None, ScissorTestEnable = true };
        }
        private static Color Expected(int pixel, int frame) => new((pixel * 17 + frame * 11) % 251,
            (pixel * 29 + frame * 23) % 251, (pixel * 43 + frame * 37) % 251, 255);
        protected override void Draw(GameTime gameTime)
        {
            GraphicsDevice.SetRenderTarget(target);
            GraphicsDevice.Clear(Color.Blue);
            GraphicsDevice.SetVertexBuffer(vertices);
            GraphicsDevice.RasterizerState = rasterizer;
            GraphicsDevice.DepthStencilState = DepthStencilState.None;
            GraphicsDevice.BlendState = BlendState.Opaque;
            for (int i = 0; i < 5000; i++)
            {
                GraphicsDevice.ScissorRectangle = new(i % 128, i / 128, 1, 1);
                effect.DiffuseColor = Expected(i, VerifiedFrames).ToVector3();
                effect.CurrentTechnique.Passes[0].Apply();
                GraphicsDevice.DrawPrimitives(PrimitiveType.TriangleList, 0, 1);
            }
            GraphicsDevice.SetRenderTarget(null);
            target.GetData(pixels);
            for (int i = 0; i < pixels.Length; i++)
            {
                Color expected = i < 5000 ? Expected(i, VerifiedFrames) : Color.Blue;
                Color actual = pixels[i];
                if (Math.Abs(actual.R - expected.R) > 1 || Math.Abs(actual.G - expected.G) > 1 ||
                    Math.Abs(actual.B - expected.B) > 1 || actual.A != expected.A)
                    throw new InvalidOperationException($"Constant data changed at frame {VerifiedFrames}, pixel {i}: {actual} != {expected}");
            }
            GraphicsDevice.ScissorRectangle = GraphicsDevice.Viewport.Bounds;
            GraphicsDevice.Clear(Color.Black);
            if (++VerifiedFrames == 6) Exit();
        }
        protected override void UnloadContent()
        { rasterizer?.Dispose(); effect?.Dispose(); vertices?.Dispose(); target?.Dispose(); }
    }
}

internal sealed class NativeConstantRingResult
{
    public bool Completed { get; set; }
    public int Frames { get; set; }
    public int DrawsPerFrame { get; set; }
    public int ExactPixelTolerance { get; set; }
}
[JsonSerializable(typeof(NativeConstantRingResult))]
internal partial class NativeConstantRingJson : JsonSerializerContext { }

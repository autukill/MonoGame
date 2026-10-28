using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

// Independent public-API regression, not referenced by any engine or player project.
try
{
    if (args is ["--bc7", var bc7Output, var bc7Hash])
    {
        using var probe = new Bc7Probe(bc7Output);
        probe.Run();
        args = [bc7Hash];
    }
    if (args is ["--buffers", var bufferHash])
    {
        using var probe = new DynamicBufferProbe();
        probe.Run();
        if (probe.Frames != 6) throw new InvalidOperationException("Dynamic buffer probe closed early.");
        args=[bufferHash];
    }
    if (args is ["--constant-ring", var output, var expectedHash])
    {
        int result=NativeConstantRingProbe.Run(output);
        if(result!=0)return result;
        args=[expectedHash];
    }
    if (args.Length != 1) throw new ArgumentException("Pass the expected native DLL SHA256.");
    using var process = System.Diagnostics.Process.GetCurrentProcess();
    Console.WriteLine($"Owned mixed regression PID={process.Id} StartedUtc={process.StartTime.ToUniversalTime():O}");
    using var game = new GraphicsProbe();
    game.Run();
    if (game.Frames != 6) throw new InvalidOperationException("Mixed graphics probe closed early.");
    process.Refresh();
    var native = process.Modules.Cast<System.Diagnostics.ProcessModule>().Single(module => module.ModuleName.Equals("mgruntime.dll", StringComparison.OrdinalIgnoreCase));
    string hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(native.FileName)));
    Console.WriteLine($"Actual native runtime: {native.FileName}; SHA256={hash}");
    if (!hash.Equals(args[0], StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Unexpected native runtime loaded");
    Console.WriteLine("Mixed graphics: mip generation between identical graphics PSOs, texture switching and repeated pixels passed.");
    return 0;
}
catch (Exception error) { Console.Error.WriteLine(error); return 1; }

sealed class GraphicsProbe : Game
{
    readonly GraphicsDeviceManager graphics;
    SpriteBatch batch = null!;
    Texture2D white = null!, other = null!;
    RenderTarget2D mip = null!, target = null!;
    public int Frames { get; private set; }
    public GraphicsProbe()
    {
        graphics = new(this) { PreferredBackBufferWidth = 320, PreferredBackBufferHeight = 180,
            GraphicsProfile = GraphicsProfile.HiDef, SynchronizeWithVerticalRetrace = true };
        IsFixedTimeStep = false;
        Window.Title = "DX12 mixed mip and graphics regression";
    }
    protected override void LoadContent()
    {
        batch = new(GraphicsDevice);
        white = new(GraphicsDevice, 1, 1); white.SetData(new[] { Color.White });
        other = new(GraphicsDevice, 1, 1);
        mip = new(GraphicsDevice, 16, 16, true, SurfaceFormat.Color, DepthFormat.None);
        target = new(GraphicsDevice, 32, 16, false, SurfaceFormat.Color, DepthFormat.None);
    }
    void Begin() => batch.Begin(SpriteSortMode.Deferred, BlendState.Opaque, SamplerState.PointClamp,
        DepthStencilState.None, RasterizerState.CullNone);
    protected override void Draw(GameTime gameTime)
    {
        Color second = Frames % 2 == 0 ? Color.Blue : Color.Green;
        other.SetData(new[] { second });
        GraphicsDevice.SetRenderTarget(mip);
        GraphicsDevice.Clear(Color.Black);
        Begin(); batch.Draw(white, new Rectangle(0, 0, 16, 16), Color.Red); batch.End();
        // Resolving this target generates mips on the same command list. The next graphics
        // draw deliberately uses the same formats/states, so the graphics PSO hash is unchanged.
        GraphicsDevice.SetRenderTarget(target);
        GraphicsDevice.Clear(Color.Black);
        Begin();
        batch.Draw(mip, new Rectangle(0, 0, 16, 16), Color.White);
        batch.Draw(other, new Rectangle(16, 0, 16, 16), Color.White);
        batch.End();
        GraphicsDevice.SetRenderTarget(null);
        var pixels = new Color[32 * 16]; target.GetData(pixels);
        for (int y = 0; y < 16; y++)
            for (int x = 0; x < 32; x++)
            {
                Color expected = x < 16 ? Color.Red : second;
                if (pixels[y * 32 + x] != expected)
                    throw new InvalidOperationException($"Mixed graphics frame {Frames}, ({x},{y}): {pixels[y * 32 + x]} != {expected}");
            }
        for (int level = 1, size = 8; size > 0; level++, size >>= 1)
        {
            var values = new Color[size * size]; mip.GetData(level, null, values, 0, values.Length);
            if (values.Any(value => value != Color.Red)) throw new InvalidOperationException($"Mip {level} pixel mismatch");
        }
        GraphicsDevice.Clear(Color.Black);
        if (++Frames == 6) Exit();
    }
    protected override void UnloadContent()
    { batch?.Dispose(); white?.Dispose(); other?.Dispose(); mip?.Dispose(); target?.Dispose(); }
}

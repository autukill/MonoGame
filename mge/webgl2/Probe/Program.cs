using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using MonoGame.Runtime.Browser.WebGL2;

[SupportedOSPlatform("browser")]
public static partial class ProbeControl
{
    private static ProbeGame? current;
    private static readonly List<ProbeStats> history = new();
    public static async Task Main()
    {
        await WaitManagedStart();
        current = new ProbeGame(1);
        history.Add(current.Stats);
        await BrowserGame.RunAsync(current);
    }
    [JSImport("globalThis.probe.waitManagedStart")]
    private static partial Task WaitManagedStart();
    [JSExport] public static string Snapshot() => JsonSerializer.Serialize(history);
    [JSExport] public static void ExitCurrent() => current?.Exit();
}
public sealed class ProbeStats
{
    public int Session { get; set; }
    public int Initialize { get; set; }
    public long Update { get; set; }
    public long Draw { get; set; }
    public long Simulation { get; set; }
    public int Activated { get; set; }
    public int Deactivated { get; set; }
    public int Exiting { get; set; }
    public int Dispose { get; set; }
    public bool Active { get; set; }
    public bool PixelsPassed { get; set; }
    public string? PixelError { get; set; }
    public double MaxActiveElapsedMs { get; set; }
}

public sealed class ProbeGame : Game
{
    private SpriteBatch? batch;
    private Texture2D? checker;
    private Texture2D? white;
    private bool resumed = true;
    public ProbeStats Stats { get; }

    public ProbeGame(int session)
    {
        Stats = new() { Session = session };
        _ = new GraphicsDeviceManager(this)
        {
            PreferredBackBufferWidth = 640,
            PreferredBackBufferHeight = 360,
            GraphicsProfile = GraphicsProfile.HiDef,
            SynchronizeWithVerticalRetrace = true
        };
        IsFixedTimeStep = false;
        InactiveSleepTime = TimeSpan.Zero;
        IsMouseVisible = true;
        Activated += (_, _) => { Stats.Activated++; resumed = true; ResetElapsedTime(); };
        Deactivated += (_, _) => Stats.Deactivated++;
        Exiting += (_, _) => Stats.Exiting++;
    }

    protected override void Initialize() { Stats.Initialize++; base.Initialize(); }
    protected override void LoadContent()
    {
        batch = new SpriteBatch(GraphicsDevice);
        checker = new Texture2D(GraphicsDevice, 2, 2);
        checker.SetData(new[] { Color.Red, Color.Lime, Color.Blue, Color.White });
        white = new Texture2D(GraphicsDevice, 1, 1);
        white.SetData(new[] { Color.White });
    }
    protected override void Update(GameTime time)
    {
        Stats.Update++;
        Stats.Active = IsActive;
        // Explicit application policy: inactive games freeze simulation.
        if (IsActive)
        {
            Stats.Simulation++;
            if (!resumed) Stats.MaxActiveElapsedMs = Math.Max(Stats.MaxActiveElapsedMs, time.ElapsedGameTime.TotalMilliseconds);
            resumed = false;
        }
        base.Update(time);
    }
    protected override void Draw(GameTime time)
    {
        Stats.Draw++;
        GraphicsDevice.Clear(new Color(18, 22, 30));
        batch!.Begin(samplerState: SamplerState.PointClamp, blendState: BlendState.Opaque);
        batch.Draw(checker!, new Rectangle(0, 0, 256, 256), Color.White);
        batch.Draw(white!, new Rectangle(280 + (int)(Stats.Simulation % 250), 140, 24, 60), Color.Cyan);
        batch.End();
        if (Stats.Draw == 3) CheckPixels();
        base.Draw(time);
    }
    private void CheckPixels()
    {
        try
        {
            int width = GraphicsDevice.PresentationParameters.BackBufferWidth;
            int height = GraphicsDevice.PresentationParameters.BackBufferHeight;
            Color[] pixels = new Color[width * height];
            GraphicsDevice.GetBackBufferData(pixels);
            var samples = new[] { (64, 64, Color.Red), (192, 64, Color.Lime), (64, 192, Color.Blue), (192, 192, Color.White) };
            foreach (var (x, y, expected) in samples)
            {
                Color actual = pixels[y * width + x];
                if (Math.Abs(actual.R - expected.R) > 2 || Math.Abs(actual.G - expected.G) > 2 || Math.Abs(actual.B - expected.B) > 2)
                    throw new InvalidOperationException($"({x},{y}) expected {expected}, got {actual}; buffer {width}x{height}");
            }
            Stats.PixelsPassed = true;
        }
        catch (Exception e) { Stats.PixelError = e.ToString(); }
    }
    protected override void Dispose(bool disposing)
    {
        Stats.Dispose++;
        if (disposing) { batch?.Dispose(); checker?.Dispose(); white?.Dispose(); }
        base.Dispose(disposing);
    }
}

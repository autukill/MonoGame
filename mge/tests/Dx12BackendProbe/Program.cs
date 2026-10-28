using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

string output = Path.GetFullPath(args.Length >= 1 ? args[0] : "backend-probe-results");
string depthMode = args.Length >= 2 ? args[1] : "matrix";
Directory.CreateDirectory(output);
var report = new BackendReport
{
    Started = DateTimeOffset.Now.ToString("O"), Os = Environment.OSVersion.ToString(),
    Pid = Environment.ProcessId, DynamicCodeSupported = RuntimeFeature.IsDynamicCodeSupported,
    Framework = typeof(Game).Assembly.FullName ?? "unknown", DepthMode = depthMode
};
void Save() => File.WriteAllText(Path.Combine(output, "report.json"), JsonSerializer.Serialize(report, BackendJson.Default.BackendReport));
void Log(string message)
{
    string line = $"{DateTimeOffset.Now:O} {message}";
    Console.WriteLine(line); Console.Out.Flush();
    File.AppendAllText(Path.Combine(output, "probe.log"), line + Environment.NewLine);
}
void Phase(string phase) { report.Phase = phase; Save(); Log(phase); }
static string Hash(string path) => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path)));
int RunMatrix()
{
    var matrix = new BackendMatrixReport { ExeSha256 = Hash(Environment.ProcessPath!), NativeFileSha256 = Hash(Path.Combine(AppContext.BaseDirectory, "mgruntime.dll")) };
    void SaveMatrix() => File.WriteAllText(Path.Combine(output, "report.json"), JsonSerializer.Serialize(matrix, BackendJson.Default.BackendMatrixReport));
    foreach (string mode in new[] { "none", "depth16", "depth24stencil8" })
    {
        string folder = Path.Combine(output, mode); Directory.CreateDirectory(folder);
        var row = new BackendMatrixCase { Mode = mode }; matrix.Cases.Add(row); SaveMatrix();
        Log("starting isolated depth case " + mode);
        try
        {
            var info = new ProcessStartInfo(Environment.ProcessPath!) { WorkingDirectory = folder, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
            info.ArgumentList.Add(folder); info.ArgumentList.Add(mode);
            using var child = Process.Start(info) ?? throw new InvalidOperationException("Child process did not start");
            row.Pid = child.Id; row.Started = child.StartTime.ToString("O"); SaveMatrix();
            using var stdout = File.Create(Path.Combine(folder, "stdout.txt")); using var stderr = File.Create(Path.Combine(folder, "stderr.txt"));
            var copyOut = child.StandardOutput.BaseStream.CopyToAsync(stdout); var copyErr = child.StandardError.BaseStream.CopyToAsync(stderr);
            row.TimedOut = !child.WaitForExit(120000);
            if (row.TimedOut) { child.Kill(); child.WaitForExit(); }
            copyOut.GetAwaiter().GetResult(); copyErr.GetAwaiter().GetResult(); stdout.Flush(); stderr.Flush();
            stdout.Dispose(); stderr.Dispose();
            row.ExitCode = child.ExitCode; row.ExitHex = "0x" + unchecked((uint)child.ExitCode).ToString("X8");
            string errorText = File.ReadAllText(Path.Combine(folder, "stderr.txt"));
            row.ValidationErrors = errorText.Split('\n').Count(s => s.Contains("[DX12-VALIDATION] severity=0") || s.Contains("[DX12-VALIDATION] severity=1"));
            string childReport = Path.Combine(folder, "report.json");
            if (File.Exists(childReport))
            {
                var result = JsonSerializer.Deserialize(File.ReadAllText(childReport), BackendJson.Default.BackendReport);
                row.Passed = child.ExitCode == 0 && !row.TimedOut && row.ValidationErrors == 0 && result?.Passed == true;
                row.LastPhase = result?.Phase ?? "";
            }
        }
        catch (Exception error) { row.Error = error.ToString(); }
        File.WriteAllText(Path.Combine(folder, "child-process.json"), JsonSerializer.Serialize(row, BackendJson.Default.BackendMatrixCase));
        SaveMatrix(); Log($"depth={mode}; passed={row.Passed}; exit={row.ExitHex}; validationErrors={row.ValidationErrors}");
    }
    matrix.AllPassed = matrix.Cases.All(c => c.Passed); SaveMatrix();
    File.WriteAllText(Path.Combine(output, "result.txt"), string.Join(Environment.NewLine, matrix.Cases.Select(c => $"{c.Mode}: {(c.Passed ? "PASS" : "FAIL")}; exit={c.ExitHex}; phase={c.LastPhase}; validationErrors={c.ValidationErrors}")) + Environment.NewLine);
    return matrix.AllPassed ? 0 : 1;
}

try
{
    if (args.Length < 2) return RunMatrix();
    System.Runtime.GCSettings.LatencyMode = System.Runtime.GCLatencyMode.SustainedLowLatency;
    Phase("preflight");
    DepthFormat depthFormat = depthMode switch
    {
        "none" => DepthFormat.None, "depth16" => DepthFormat.Depth16,
        "depth24stencil8" => DepthFormat.Depth24Stencil8,
        _ => throw new ArgumentException("Depth mode must be none, depth16, or depth24stencil8")
    };
    var manifest = JsonSerializer.Deserialize(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "probe-manifest.json")), BackendJson.Default.BackendManifest)
        ?? throw new InvalidDataException("Missing probe manifest");
    report.ProbeSourceCommit = manifest.ProbeSourceCommit;
    report.NativeSourceCommit = manifest.NativeSourceCommit;
    report.ExeSha256 = Hash(Environment.ProcessPath ?? throw new InvalidOperationException("Missing executable path"));
    if (report.ExeSha256 != manifest.ExeSha256 || RuntimeFeature.IsDynamicCodeSupported || !Environment.Is64BitProcess)
        throw new InvalidOperationException("Expected the pinned x64 NativeAOT probe executable");
    string nativePath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "mgruntime.dll"));
    if (Hash(nativePath) != manifest.NativeSha256) throw new InvalidOperationException("Native candidate file hash mismatch");
    void CheckNativeModule()
    {
        using var process = Process.GetCurrentProcess();
        var module = process.Modules.Cast<ProcessModule>().Single(m => m.ModuleName.Equals("mgruntime.dll", StringComparison.OrdinalIgnoreCase));
        report.NativePath = module.FileName; report.NativeSha256 = Hash(module.FileName);
        if (report.NativeSha256 != manifest.NativeSha256 || !Path.GetFullPath(module.FileName).Equals(nativePath, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The backend loaded a different native runtime");
        if (process.Modules.Cast<ProcessModule>().Any(m => m.ModuleName.Equals("coreclr.dll", StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("Expected NativeAOT without CoreCLR");
        Save();
    }
    for (int cycle = 0; cycle < 3; ++cycle)
    {
        var stage = new BackendStage { Name = $"window-mip-resize-lifetime-{cycle + 1}" };
        report.Stages.Add(stage); Phase(stage.Name);
        using (var game = new BackendGame(cycle, stage, Log, CheckNativeModule, depthFormat))
        {
            CheckNativeModule();
            game.Disposed += (_, _) => { stage.Disposed = true; Log(stage.Name + " disposed"); };
            game.Run();
            report.Adapter = stage.Adapter;
            if (stage.Frames < 9 || stage.Presents < 9 || stage.ResizeChecks != 2 || stage.DeviceResets < 2)
                throw new InvalidOperationException($"Incomplete window/mip/resize stage: {stage.Name}");
        }
        if (!stage.Disposed) throw new InvalidOperationException("Game lifetime did not dispose");
        stage.Passed = true; Save();
    }
    var dynamicStage = new BackendStage { Name = "dynamic-vertex-index-buffers" };
    report.Stages.Add(dynamicStage); Phase(dynamicStage.Name);
    using (var game = new DynamicBufferProbe(depthFormat))
    {
        game.Disposed += (_, _) => dynamicStage.Disposed = true;
        game.Run(); CheckNativeModule(); dynamicStage.Frames = game.Frames;
        if (game.Frames != 6) throw new InvalidOperationException("Dynamic buffer stage closed early");
    }
    dynamicStage.PixelChecks = 6 * 32 * 32; dynamicStage.Passed = dynamicStage.Disposed; Save();
    var ringStage = new BackendStage { Name = "constant-ring-5000-draws-per-frame" };
    report.Stages.Add(ringStage); Phase(ringStage.Name);
    if (NativeConstantRingProbe.Run(Path.Combine(output, "constant-ring"), depthFormat) != 0)
        throw new InvalidOperationException("Constant ring stage failed");
    CheckNativeModule(); ringStage.Frames = 6; ringStage.PixelChecks = 6 * 128 * 64;
    ringStage.Disposed = true; ringStage.Passed = true;
    report.Passed = report.Stages.All(s => s.Passed && s.Disposed);
    if (!report.Passed) throw new InvalidOperationException("A backend stage did not complete and dispose");
    Phase("complete");
    File.WriteAllText(Path.Combine(output, "result.txt"), $"Maintained MonoGame DX12 backend probe: PASS\nAdapter: {report.Adapter}\nNativeAOT: True\nStages: {report.Stages.Count}\nWindow/mip lifetime cycles: 3\nSwapchain resize checks: {report.Stages.Sum(s => s.ResizeChecks)}\nVerified pixel checks: {report.Stages.Sum(s => s.PixelChecks)}\nNative SHA256: {report.NativeSha256}\n");
    Log("BACKEND_PROBE_PASS"); return 0;
}
catch (Exception error)
{
    report.Error = error.ToString(); report.Passed = false; Save(); Log("BACKEND_PROBE_FAIL: " + error);
    Console.Error.WriteLine(error); File.WriteAllText(Path.Combine(output, "result.txt"), "Maintained MonoGame DX12 backend probe: FAIL\nPhase: " + report.Phase + "\n" + error);
    return 1;
}

internal sealed class BackendManifest
{
    public string ProbeSourceCommit { get; set; } = "";
    public string NativeSourceCommit { get; set; } = "";
    public string NativeSha256 { get; set; } = "";
    public string ExeSha256 { get; set; } = "";
}
internal sealed class BackendReport
{
    public string Started { get; set; } = "";
    public string Os { get; set; } = "";
    public int Pid { get; set; }
    public bool DynamicCodeSupported { get; set; }
    public string Framework { get; set; } = "";
    public string DepthMode { get; set; } = "";
    public string Adapter { get; set; } = "";
    public string ProbeSourceCommit { get; set; } = "";
    public string NativeSourceCommit { get; set; } = "";
    public string ExeSha256 { get; set; } = "";
    public string NativePath { get; set; } = "";
    public string NativeSha256 { get; set; } = "";
    public string Phase { get; set; } = "";
    public bool Passed { get; set; }
    public string Error { get; set; } = "";
    public List<BackendStage> Stages { get; set; } = [];
}
internal sealed class BackendStage
{
    public string Name { get; set; } = "";
    public string Adapter { get; set; } = "";
    public long WindowHandle { get; set; }
    public bool Passed { get; set; }
    public bool Disposed { get; set; }
    public int Frames { get; set; }
    public int Presents { get; set; }
    public int ResizeChecks { get; set; }
    public int DeviceResets { get; set; }
    public long PixelChecks { get; set; }
}
[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, WriteIndented = true)]
[JsonSerializable(typeof(BackendReport))]
[JsonSerializable(typeof(BackendManifest))]
[JsonSerializable(typeof(BackendMatrixReport))]
[JsonSerializable(typeof(BackendMatrixCase))]
internal partial class BackendJson : JsonSerializerContext { }

internal sealed class BackendMatrixReport
{
    public string Probe { get; set; } = "Dx12BackendProbe depth-isolation matrix";
    public string ExeSha256 { get; set; } = "";
    public string NativeFileSha256 { get; set; } = "";
    public bool AllPassed { get; set; }
    public List<BackendMatrixCase> Cases { get; set; } = [];
}
internal sealed class BackendMatrixCase
{
    public string Mode { get; set; } = "";
    public int Pid { get; set; }
    public string Started { get; set; } = "";
    public int ExitCode { get; set; }
    public string ExitHex { get; set; } = "";
    public bool TimedOut { get; set; }
    public bool Passed { get; set; }
    public int ValidationErrors { get; set; }
    public string LastPhase { get; set; } = "";
    public string Error { get; set; } = "";
}

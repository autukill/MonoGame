// MonoGame - Copyright (C) MonoGame Foundation, Inc
// This file is subject to LICENSE.txt.
using System.Diagnostics;
using System.Text;
using MonoGame.Effect.TPGParser;

namespace MonoGame.Effect;

// Explicit profile; DirectX_12 continues to select the original SM6 compiler.
class DirectX12Sm51ShaderProfile : DirectX12ShaderProfile
{
    public DirectX12Sm51ShaderProfile() : base("DirectX_12_SM51", 2) { }
    internal override void AddMacros(Dictionary<string, string> macros)
    { macros.Add("HLSL", "1"); macros.Add("SM51", "1"); }
    internal override void ValidateShaderModels(PassInfo pass)
    {
        if (!string.IsNullOrEmpty(pass.vsFunction) && pass.vsModel != "vs_5_1") throw new Exception("DirectX_12_SM51 requires vs_5_1");
        if (!string.IsNullOrEmpty(pass.psFunction) && pass.psModel != "ps_5_1") throw new Exception("DirectX_12_SM51 requires ps_5_1");
    }
    protected override byte[] CompileShader(ShaderResult result, string entry, string profile, bool vertex, out string reflection, ref string messages)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("The SM5.1 offline helper currently supports Windows x64");
        string helper = Path.Combine(AppContext.BaseDirectory, "mgfxc-sm51.exe");
        if (!File.Exists(helper)) throw new FileNotFoundException("Build/copy the maintained SM5.1 offline compiler helper next to mgfxc", helper);
        string source = Path.GetTempFileName(), output = Path.GetTempFileName();
        try
        {
            File.WriteAllText(source, result.FileContent, new UTF8Encoding(false));
            var info = new ProcessStartInfo(helper) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (string argument in new[] { source, entry, profile, output, result.Debug ? "1" : "0" }) info.ArgumentList.Add(argument);
            using var process = Process.Start(info) ?? throw new Exception("SM5.1 compiler helper did not start");
            var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
            if (!process.WaitForExit(60000)) { process.Kill(); process.WaitForExit(); throw new TimeoutException("SM5.1 compiler helper timed out"); }
            reflection = stdout.GetAwaiter().GetResult(); messages += stderr.GetAwaiter().GetResult();
            if (process.ExitCode != 0) throw new ShaderCompilerException();
            return File.ReadAllBytes(output);
        }
        finally { File.Delete(source); File.Delete(output); }
    }
}

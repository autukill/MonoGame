# Dot-source from serial coordinator scripts. No global process cleanup.
function Invoke-WeChatProcess([string]$Name,[string]$File,[string[]]$Arguments,[string]$WorkingDirectory,[string]$Evidence) {
    $psi=[Diagnostics.ProcessStartInfo]::new($File)
    $psi.WorkingDirectory=$WorkingDirectory;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
    $psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
    foreach($argument in $Arguments){$psi.ArgumentList.Add($argument)}
    $process=[Diagnostics.Process]::Start($psi)
    $record=[ordered]@{name=$Name;file=$File;arguments=$Arguments;pid=$process.Id;started=$process.StartTime.ToUniversalTime().ToString('o')}
    [IO.File]::WriteAllText((Join-Path $Evidence "$Name-process.json"),($record|ConvertTo-Json -Depth 8))
    $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
    try {
        if(!$process.WaitForExit(1800000)){throw "Process timed out: $Name"}
        $record.exitCode=$process.ExitCode
        [IO.File]::WriteAllText((Join-Path $Evidence "$Name.log"),$stdout.GetAwaiter().GetResult()+$stderr.GetAwaiter().GetResult())
        if($process.ExitCode){Get-Content (Join-Path $Evidence "$Name.log") -Tail 35;throw "$Name failed: $($process.ExitCode)"}
    } finally {
        if(!$process.HasExited){$process.Kill($true);$process.WaitForExit()}
        $record.exited=$process.HasExited
        [IO.File]::WriteAllText((Join-Path $Evidence "$Name-process.json"),($record|ConvertTo-Json -Depth 8))
        $process.Dispose()
    }
}

param([Parameter(Mandatory)][string]$Package,[Parameter(Mandatory)][string]$ExecutableName,
      [Parameter(Mandatory)][string]$OutputRoot,[string]$NativeLibrary,[string]$AuditFile,
      [int[]]$SampleSeconds=@(5,15,30,60),[switch]$ExpectAot,[switch]$ExpectJit)
$ErrorActionPreference='Stop'
if($ExpectAot -and $ExpectJit){throw 'Choose one runtime identity'}
$taskOut=[IO.Path]::GetFullPath($OutputRoot)
if(Test-Path -LiteralPath $taskOut){throw 'Choose a fresh output directory'}
New-Item -ItemType Directory -Path $taskOut|Out-Null
$taskApp="$taskOut/app"
Copy-Item -LiteralPath $Package -Destination $taskApp -Recurse
if($NativeLibrary){
 Copy-Item -LiteralPath $NativeLibrary -Destination "$taskApp/mgruntime.dll" -Force
 if(Test-Path "$taskApp/runtimes/win-x64/native/mgruntime.dll"){
  Copy-Item -LiteralPath $NativeLibrary -Destination "$taskApp/runtimes/win-x64/native/mgruntime.dll" -Force
 }
}
$taskExe=[IO.Path]::GetFullPath((Join-Path $taskApp $ExecutableName))
$taskInfo=[Diagnostics.ProcessStartInfo]::new($taskExe)
$taskInfo.WorkingDirectory=$taskApp;$taskInfo.UseShellExecute=$false
$taskInfo.RedirectStandardOutput=$true;$taskInfo.RedirectStandardError=$true
$taskInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Normal
$taskInfo.Environment.Remove('MG_RUNNING_UNIT_TESTS')|Out-Null
$taskInfo.Environment.Remove('MGE_DX12_ALLOCATION_AUDIT')|Out-Null
if($AuditFile){$taskInfo.Environment['MGE_DX12_ALLOCATION_AUDIT']=[IO.Path]::GetFullPath($AuditFile)}
$taskProcess=[Diagnostics.Process]::Start($taskInfo)
$taskStarted=$taskProcess.StartTime.ToUniversalTime().ToString('O')
$taskRecord=[ordered]@{Pid=$taskProcess.Id;StartedUtc=$taskStarted;Executable=$taskExe;ExeSha256=(Get-FileHash -LiteralPath $taskExe).Hash;
 NativeSha256=if(Test-Path "$taskApp/mgruntime.dll"){(Get-FileHash -LiteralPath "$taskApp/mgruntime.dll").Hash}else{$null};
 SourcePackage=[IO.Path]::GetFullPath($Package);Diagnostic=[bool]$AuditFile;ExpectedAot=[bool]$ExpectAot;ExpectedJit=[bool]$ExpectJit;NoForcedGc=$true;NoReadback=$true;Samples=@()}
$taskRecord|ConvertTo-Json -Depth 5|Set-Content "$taskOut/process.json"
Write-Host "Owned empty window PID=$($taskProcess.Id) StartedUtc=$taskStarted"
$taskStdout=$taskProcess.StandardOutput.ReadToEndAsync();$taskStderr=$taskProcess.StandardError.ReadToEndAsync()
$taskClock=[Diagnostics.Stopwatch]::StartNew()
try {
 foreach($taskSecond in ($SampleSeconds|Sort-Object -Unique)){
  while($taskClock.Elapsed.TotalSeconds -lt $taskSecond){Start-Sleep -Milliseconds 100;if($taskProcess.HasExited){throw 'Empty window exited before sampling'}}
  $taskProcess.Refresh()
  $taskRow=[ordered]@{Seconds=[math]::Round($taskClock.Elapsed.TotalSeconds,3);WorkingSetBytes=$taskProcess.WorkingSet64;PrivateBytes=$taskProcess.PrivateMemorySize64;PeakWorkingSetBytes=$taskProcess.PeakWorkingSet64;CpuSeconds=$taskProcess.TotalProcessorTime.TotalSeconds;WindowTitle=$taskProcess.MainWindowTitle;WindowHandle=$taskProcess.MainWindowHandle.ToInt64()}
  $taskRecord.Samples+=,[pscustomobject]$taskRow
  $taskRecord|ConvertTo-Json -Depth 6|Set-Content "$taskOut/process.json"
  Write-Host ($taskRow|ConvertTo-Json -Compress)
 }
 $taskRecord.Modules=@($taskProcess.Modules|ForEach-Object{[pscustomobject]@{Name=$_.ModuleName;Path=$_.FileName}})
 $taskCoreModules=@($taskRecord.Modules|Where-Object Name -match 'coreclr|clrjit')
 if($ExpectAot -and $taskCoreModules.Count){throw 'Expected NativeAOT but observed CoreCLR/JIT'}
 if($ExpectJit -and !$taskCoreModules.Count){throw 'Expected JIT but did not observe CoreCLR/JIT'}
 $taskRecord.NativeModules=@($taskRecord.Modules|Where-Object Name -eq 'mgruntime.dll'|ForEach-Object{[ordered]@{Path=$_.Path;Sha256=(Get-FileHash -LiteralPath $_.Path).Hash}})
 if($taskRecord.NativeSha256 -and (!$taskRecord.NativeModules.Count -or @($taskRecord.NativeModules|Where-Object Sha256 -ne $taskRecord.NativeSha256).Count)){
  throw 'Actual loaded native runtime hash differs from the package control'
 }
 if(!@($taskRecord.Samples|Where-Object WindowHandle -ne 0).Count){throw 'No application window observed'}
 $taskRecord.Completed=$true
}finally{
 if(!$taskProcess.HasExited){$taskLive=Get-Process -Id $taskProcess.Id -ErrorAction SilentlyContinue;if($taskLive -and $taskLive.StartTime.ToUniversalTime().ToString('O') -eq $taskStarted -and $taskLive.Path -eq $taskExe){Stop-Process -InputObject $taskLive;$taskLive.WaitForExit()}}
 $taskRecord.Exited=$taskProcess.HasExited
 $taskRecord|ConvertTo-Json -Depth 6|Set-Content "$taskOut/process.json"
 $taskStdout.GetAwaiter().GetResult()|Set-Content "$taskOut/stdout.log"
 $taskStderr.GetAwaiter().GetResult()|Set-Content "$taskOut/stderr.log"
 $taskProcess.Dispose()
}
exit 0

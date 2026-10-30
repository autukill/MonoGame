param([Parameter(Mandatory)][string]$OutputRoot,[string]$OfficialRuntime=(Join-Path $env:USERPROFILE '.nuget/packages/monogame.runtime.windows.dx12/3.8.6/runtimes/win-x64/native/mgruntime.dll'),[switch]$StartupDiagnostics,[string]$Sm51ProbeShaders)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$out=[IO.Path]::GetFullPath($OutputRoot)
if(Test-Path -LiteralPath $out){throw 'Choose a fresh output directory'}
if($Sm51ProbeShaders){
 if(!$StartupDiagnostics){throw 'SM5.1 is private diagnostic-only'}
 $Sm51ProbeShaders=[IO.Path]::GetFullPath($Sm51ProbeShaders)
 if(!(Test-Path -LiteralPath "$Sm51ProbeShaders/GenerateMips_SM51.h")){throw 'Prepare the SM5.1 probe shaders first'}
 $sm51HeaderHash=(Get-FileHash -LiteralPath "$Sm51ProbeShaders/GenerateMips_SM51.h").Hash
}
$pin=Get-Content "$PSScriptRoot/upstream.json" -Raw|ConvertFrom-Json
$commit=(& git -C $root rev-parse HEAD).Trim();if($LASTEXITCODE){throw 'Cannot read source commit'}
& git -C $root merge-base --is-ancestor $pin.commit HEAD;if($LASTEXITCODE){throw 'Wrong source ancestry'}
. "$PSScriptRoot/assert-clean-source.ps1"
Assert-MgeCleanSource -Root $root -Pins $pin.submodules
New-Item -ItemType Directory -Path "$out/effects","$out/payload/licenses" -Force|Out-Null
& python "$PSScriptRoot/extract-builtin-effects.py" $OfficialRuntime "$out/effects";if($LASTEXITCODE){throw 'Effect preservation failed'}
& python -m unittest discover -s "$PSScriptRoot/tests" -v;if($LASTEXITCODE){throw 'Source regressions failed'}
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs=(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
$cmake=Join-Path $vs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
$oldReuse=$env:MSBUILDDISABLENODEREUSE;$oldServer=$env:DOTNET_CLI_USE_MSBUILD_SERVER
$env:MSBUILDDISABLENODEREUSE='1';$env:DOTNET_CLI_USE_MSBUILD_SERVER='0'
try {
 $diagnosticFlag=if($StartupDiagnostics){'ON'}else{'OFF'}
 $sm51Args=@('-DMGE_DX12_SM51_PROBE=OFF');if($Sm51ProbeShaders){$sm51Args=@('-DMGE_DX12_SM51_PROBE=ON',"-DMGE_SM51_SHADERS=$($Sm51ProbeShaders.Replace('\','/'))")}
 $targets=@('mgruntime','dx12-lifecycle');if($StartupDiagnostics){$targets+='dx12-diagnostics'}
 & $cmake -S $PSScriptRoot -B "$out/build" -G 'Visual Studio 18 2026' -A x64 "-DMGE_EFFECTS=$($out.Replace('\','/'))/effects" "-DMGE_DX12_STARTUP_DIAGNOSTICS=$diagnosticFlag" @sm51Args *> "$out/configure.log"
 if($LASTEXITCODE){throw "Configure failed: $out/configure.log"}
 & $cmake --build "$out/build" --config Release --target @targets --parallel 1 -- /m:1 /nr:false /p:UseSharedCompilation=false /p:BuildInParallel=false *> "$out/build.log"
 if($LASTEXITCODE){throw "Build failed: $out/build.log"}
 & python "$PSScriptRoot/verify-runtime.py" $OfficialRuntime "$out/build/Release/mgruntime.dll" "$out/abi-effects.json"
 if($LASTEXITCODE){throw 'ABI or builtin Effect mismatch'}
 & "$out/build/Release/dx12-lifecycle.exe" *> "$out/lifecycle.log"
 if($LASTEXITCODE){throw "Native lifecycle regression failed: $out/lifecycle.log"}
 & "$out/build/Release/dx12-lifecycle.exe" --tier1-bindings *> "$out/tier1-lifecycle.log"
 if($LASTEXITCODE){throw "Tier 1 descriptor binding regression failed: $out/tier1-lifecycle.log"}
 if($StartupDiagnostics){
  $validationErrors=@(Select-String -LiteralPath "$out/lifecycle.log","$out/tier1-lifecycle.log" -Pattern '^\[DX12-VALIDATION\] severity=[01]\b')
  if($validationErrors.Count){throw "Native API validation errors: $out/lifecycle.log / tier1-lifecycle.log"}
  & "$out/build/Release/dx12-diagnostics.exe" *> "$out/diagnostics.log"
  if($LASTEXITCODE){throw "Device removal diagnostic regression failed: $out/diagnostics.log"}
 }
 Assert-MgeCleanSource -Root $root -Pins $pin.submodules
 if((& git -C $root rev-parse HEAD).Trim() -ne $commit -or $LASTEXITCODE){throw 'Source changed during build'}
 Copy-Item -LiteralPath "$out/build/Release/mgruntime.dll" -Destination "$out/payload/mgruntime.dll"
 Copy-Item -LiteralPath "$root/LICENSE.txt","$root/THIRD-PARTY-NOTICES.txt" -Destination "$out/payload/licenses"
 Copy-Item -LiteralPath "$root/native/monogame/external/sdl2/sdl/LICENSE.txt" -Destination "$out/payload/licenses/SDL-LICENSE.txt"
 Copy-Item -LiteralPath "$root/external/stb/LICENSE" -Destination "$out/payload/licenses/STB-LICENSE.txt"
 $toolset=Get-ChildItem "$vs/VC/Tools/MSVC" -Directory|Sort-Object Name -Descending|Select-Object -First 1 -ExpandProperty Name
 [ordered]@{packageId=$pin.packageId;packageVersion=$pin.packageVersion;sourceCommit=$commit;upstream=$pin.upstream;upstreamCommit=$pin.commit;submodules=$pin.submodules;frameworkVersion=$pin.frameworkVersion;sha256=(Get-FileHash "$out/payload/mgruntime.dll").Hash;officialRuntimeSha256=$pin.officialRuntimeSha256;visualStudio=$vs;msvc=$toolset;cmake=(& $cmake --version|Select-Object -First 1);configuration='Release x64 /MT';buildArguments='--parallel 1 -- /m:1 /nr:false /p:UseSharedCompilation=false /p:BuildInParallel=false';diagnosticRuntime=[bool]$StartupDiagnostics;sm51Probe=[bool]$Sm51ProbeShaders;sm51HeaderSha256=$sm51HeaderHash;sourceChecks=$true;abiEffects=$true;nativeLifecycle=$true;deviceRemovalProbe=[bool]$StartupDiagnostics}|ConvertTo-Json -Depth 8|Set-Content "$out/payload/provenance.json" -Encoding utf8
 Get-Content "$out/payload/provenance.json"
}finally{$env:MSBUILDDISABLENODEREUSE=$oldReuse;$env:DOTNET_CLI_USE_MSBUILD_SERVER=$oldServer}

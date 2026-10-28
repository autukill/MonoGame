param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$out=[IO.Path]::GetFullPath($OutputRoot)
if(Test-Path -LiteralPath $out){throw 'Choose a fresh output directory'}
$commit=(& git -C $repo rev-parse HEAD).Trim();if($LASTEXITCODE){throw 'Cannot read source commit'}
$pins=Get-Content "$repo/mge/upstream.json" -Raw|ConvertFrom-Json
. "$repo/mge/assert-clean-source.ps1"
Assert-MgeCleanSource -Root $repo -Pins $pins.submodules
New-Item -ItemType Directory -Path $out | Out-Null
$owner=Get-Process -Id $PID
[ordered]@{pid=$PID;startTime=$owner.StartTime.ToString('o');operation='Standalone DX12 root signature probe build';sourceCommit=$commit}|ConvertTo-Json|Set-Content "$out/build-owner.json" -Encoding utf8
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs=(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
$cmake=Join-Path $vs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
$oldReuse=$env:MSBUILDDISABLENODEREUSE;$oldServer=$env:DOTNET_CLI_USE_MSBUILD_SERVER
$env:MSBUILDDISABLENODEREUSE='1';$env:DOTNET_CLI_USE_MSBUILD_SERVER='0'
try {
 & $cmake -S $PSScriptRoot -B "$out/build" -G 'Visual Studio 18 2026' -A x64 *> "$out/configure.log"
 if($LASTEXITCODE){throw "Configure failed: $out/configure.log"}
 & $cmake --build "$out/build" --config Release --target Dx12RootSignatureProbe --parallel 1 -- /m:1 /nr:false /p:UseSharedCompilation=false /p:BuildInParallel=false *> "$out/build.log"
 if($LASTEXITCODE){throw "Build failed: $out/build.log"}
 New-Item -ItemType Directory -Path "$out/local-validation" | Out-Null
 & "$out/build/Release/Dx12RootSignatureProbe.exe" "$out/local-validation" *> "$out/local-validation.console.log"
 if($LASTEXITCODE){throw "Local probe failed: $out/local-validation/probe.log"}
 $result=Get-Content "$out/local-validation/report.json" -Raw|ConvertFrom-Json
 if(!$result.cases[1].drawReadbackPassed){throw 'Bounded root/draw/readback validation failed'}
 Assert-MgeCleanSource -Root $repo -Pins $pins.submodules
 if((& git -C $repo rev-parse HEAD).Trim() -ne $commit -or $LASTEXITCODE){throw 'Source changed during build'}
 $package=Join-Path $out 'Dx12RootSignatureProbe'
 New-Item -ItemType Directory -Path "$package/source" | Out-Null
 Copy-Item -LiteralPath "$out/build/Release/Dx12RootSignatureProbe.exe" -Destination $package
 Copy-Item -LiteralPath "$PSScriptRoot/Run-Probe.cmd","$PSScriptRoot/README.md","$repo/LICENSE.txt" -Destination $package
 Copy-Item -LiteralPath "$PSScriptRoot/Main.cpp","$PSScriptRoot/CMakeLists.txt" -Destination "$package/source"
 [ordered]@{probe='Dx12RootSignatureProbe';standalone=$true;sourceCommit=$commit;exeSha256=(Get-FileHash "$package/Dx12RootSignatureProbe.exe").Hash;framework='none';gameDependencies=@();configuration='Release x64 /MT';buildArguments='--parallel 1 -- /m:1 /nr:false /p:UseSharedCompilation=false /p:BuildInParallel=false';debugLayerEnabled=$false;localAdapter=$result.adapter;localBoundedDrawReadbackPassed=$true;sourceChecks=$true}|ConvertTo-Json -Depth 6|Set-Content "$package/provenance.json" -Encoding utf8
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $zip=Join-Path $out 'Dx12RootSignatureProbe-win-x64.zip'
 [IO.Compression.ZipFile]::CreateFromDirectory($package,$zip,[IO.Compression.CompressionLevel]::Optimal,$true)
 (Get-FileHash $zip).Hash|Set-Content "$zip.sha256" -Encoding ascii
 Get-Content "$package/provenance.json"
}finally{$env:MSBUILDDISABLENODEREUSE=$oldReuse;$env:DOTNET_CLI_USE_MSBUILD_SERVER=$oldServer}

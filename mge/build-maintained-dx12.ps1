param([Parameter(Mandatory)][string]$OutputRoot,[Parameter(Mandatory)][string]$NuGetConfig,
 [Parameter(Mandatory)][string]$PackagesDirectory)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$out=[IO.Path]::GetFullPath($OutputRoot)
if(Test-Path -LiteralPath $out){throw 'Choose a fresh physical output directory'}
$pin=Get-Content "$PSScriptRoot/upstream.json" -Raw|ConvertFrom-Json
. "$PSScriptRoot/assert-clean-source.ps1"
Assert-MgeCleanSource -Root $root -Pins $pin.submodules
$source=(& git -C $root rev-parse HEAD).Trim()
New-Item -ItemType Directory -Path $out|Out-Null
$env:MSBUILDDISABLENODEREUSE='1';$env:DOTNET_CLI_USE_MSBUILD_SERVER='0'
$env:NUGET_PACKAGES=[IO.Path]::GetFullPath($PackagesDirectory)
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$flags=@('--disable-build-servers','-m:1','-nr:false','-p:UseSharedCompilation=false','-p:BuildInParallel=false','-p:RestoreBuildInParallel=false')
$process=[Diagnostics.Process]::GetCurrentProcess()
[ordered]@{pid=$process.Id;startUtc=$process.StartTime.ToUniversalTime().ToString('O');sourceCommit=$source}|ConvertTo-Json|Set-Content "$out/owner.json"
& "$PSScriptRoot/build.ps1" -OutputRoot "$out/native"
if($LASTEXITCODE){throw 'Native maintenance build failed'}
& "$PSScriptRoot/pack.ps1" -BuildRoot "$out/native" -OutputRoot "$out/feed"
if($LASTEXITCODE){throw 'Native maintenance pack failed'}
& dotnet restore "$root/MonoGame.Framework/MonoGame.Framework.Native.csproj" --configfile $NuGetConfig -p:MgeMaintainedFramework=true @flags *> "$out/framework-restore.log"
if($LASTEXITCODE){throw 'Framework restore failed'}
& dotnet pack "$root/MonoGame.Framework/MonoGame.Framework.Native.csproj" -c Release --no-restore -o "$out/feed" -p:MgeMaintainedFramework=true "-p:PackageVersion=$($pin.packageVersion)" -p:Version=3.8.6 -p:AssemblyVersion=3.8.6.0 -p:FileVersion=3.8.6.0 "-p:RepositoryCommit=$source" -p:RepositoryUrl=https://github.com/autukill/MonoGame -p:PackageProjectUrl=https://github.com/autukill/MonoGame/tree/mge/3.8.6 '-p:Description=MyGameEngine maintained MonoGame 3.8.6 Native framework with BC7 support. Unofficial maintenance release.' @flags *> "$out/framework-build.log"
if($LASTEXITCODE){throw 'Framework maintenance pack failed'}
Assert-MgeCleanSource -Root $root -Pins $pin.submodules
if((& git -C $root rev-parse HEAD).Trim() -ne $source){throw 'Source changed during candidate build'}
[ordered]@{sourceCommit=$source;packageVersion=$pin.packageVersion;featureCommit='3e3bace62';publicMaintenanceRelease=$true;
 packages=@(Get-ChildItem -LiteralPath "$out/feed" -Filter '*.nupkg'|ForEach-Object{@{name=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash}})}|ConvertTo-Json -Depth 5|Set-Content "$out/release.json"
Get-Content "$out/release.json"

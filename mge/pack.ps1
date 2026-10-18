param([Parameter(Mandatory)][string]$BuildRoot,[Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$payload=Join-Path ([IO.Path]::GetFullPath($BuildRoot)) 'payload'
$provenance=Get-Content "$payload/provenance.json" -Raw|ConvertFrom-Json
$pin=Get-Content "$PSScriptRoot/upstream.json" -Raw|ConvertFrom-Json
. "$PSScriptRoot/assert-clean-source.ps1"
Assert-MgeCleanSource -Root $root -Pins $pin.submodules
if((& git -C $root rev-parse HEAD).Trim() -ne $provenance.sourceCommit -or $LASTEXITCODE){throw 'Pack exactly the clean source commit that produced the runtime'}
if((Get-FileHash "$payload/mgruntime.dll").Hash -ne $provenance.sha256){throw 'Payload hash mismatch'}
if($provenance.packageId -ne $pin.packageId -or $provenance.packageVersion -ne $pin.packageVersion -or $provenance.diagnosticRuntime){throw 'Only the matching non-diagnostic versioned payload may be packed'}
(Get-Content "$PSScriptRoot/Package/Runtime.targets.in" -Raw).Replace('@@HASH@@',$provenance.sha256)|Set-Content "$payload/MyGameEngine.MonoGame.Runtime.Windows.DX12.targets" -Encoding utf8
$env:MSBUILDDISABLENODEREUSE='1';$env:DOTNET_CLI_USE_MSBUILD_SERVER='0';$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$flags=@('--disable-build-servers','-m:1','-nr:false','-p:UseSharedCompilation=false','-p:BuildInParallel=false','-p:RestoreBuildInParallel=false')
& dotnet restore "$PSScriptRoot/Package/Runtime.csproj" @flags
if($LASTEXITCODE){throw 'Pack project restore failed'}
& dotnet pack "$PSScriptRoot/Package/Runtime.csproj" --no-build --no-restore -c Release -o ([IO.Path]::GetFullPath($OutputRoot)) "-p:PackageVersion=$($pin.packageVersion)" "-p:MgePayload=$payload" "-p:MgeSourceCommit=$($provenance.sourceCommit)" @flags
if($LASTEXITCODE){throw 'Pack failed'}

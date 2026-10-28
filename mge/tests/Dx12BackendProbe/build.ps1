param([Parameter(Mandatory)][string]$OutputRoot,[Parameter(Mandatory)][string]$NativeBuildRoot)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$out=[IO.Path]::GetFullPath($OutputRoot);$native=[IO.Path]::GetFullPath($NativeBuildRoot)
if(Test-Path -LiteralPath $out){throw 'Choose a fresh output directory'}
$pin=Get-Content "$repo/mge/upstream.json" -Raw|ConvertFrom-Json
. "$repo/mge/assert-clean-source.ps1"
Assert-MgeCleanSource -Root $repo -Pins $pin.submodules
$commit=(& git -C $repo rev-parse HEAD).Trim();if($LASTEXITCODE){throw 'Cannot read source commit'}
$nativeProvenance=Get-Content "$native/payload/provenance.json" -Raw|ConvertFrom-Json
if(!$nativeProvenance.abiEffects -or !$nativeProvenance.nativeLifecycle -or !$nativeProvenance.diagnosticRuntime){throw 'Use the validated diagnostic native candidate'}
if((Get-FileHash "$native/payload/mgruntime.dll").Hash -ne $nativeProvenance.sha256){throw 'Native payload hash mismatch'}
& git -C $repo diff --quiet $nativeProvenance.sourceCommit HEAD -- native/monogame/include native/monogame/common native/monogame/directx12 native/monogame/sdl native/monogame/xaudio mge/CMakeLists.txt
if($LASTEXITCODE){throw 'Native inputs changed since the candidate build; rebuild it first'}
New-Item -ItemType Directory -Path $out|Out-Null
$owner=Get-Process -Id $PID
[ordered]@{pid=$PID;startTime=$owner.StartTime.ToString('o');operation='Standalone MonoGame backend probe NativeAOT build';sourceCommit=$commit;nativeCommit=$nativeProvenance.sourceCommit}|ConvertTo-Json|Set-Content "$out/build-owner.json" -Encoding utf8
'<configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json"/></packageSources></configuration>'|Set-Content "$out/NuGet.Config" -Encoding utf8
$oldReuse=$env:MSBUILDDISABLENODEREUSE;$oldServer=$env:DOTNET_CLI_USE_MSBUILD_SERVER
$env:MSBUILDDISABLENODEREUSE='1';$env:DOTNET_CLI_USE_MSBUILD_SERVER='0';$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$flags=@('--disable-build-servers','-m:1','-nr:false','-p:UseSharedCompilation=false','-p:BuildInParallel=false','-p:RestoreBuildInParallel=false','-p:NuGetAudit=false')
try {
 & dotnet restore "$PSScriptRoot/Dx12BackendProbe.csproj" -r win-x64 --configfile "$out/NuGet.Config" --disable-parallel --ignore-failed-sources @flags *> "$out/restore.log"
 if($LASTEXITCODE){throw "Probe restore failed: $out/restore.log"}
 $assets=Get-Content "$PSScriptRoot/obj/project.assets.json" -Raw|ConvertFrom-Json
 $frameworkPath=@($assets.packageFolders.PSObject.Properties.Name|ForEach-Object{Join-Path $_ 'mygameengine.monogame.framework.native/3.8.6-mge.3/lib/netstandard2.1/MonoGame.Framework.dll'}|Where-Object{Test-Path -LiteralPath $_})|Select-Object -First 1
 if(!$frameworkPath){throw 'Cannot identify the pinned framework input'}
 $frameworkHash=(Get-FileHash -LiteralPath $frameworkPath).Hash
 $package=Join-Path $out 'Dx12BackendProbe'
 & dotnet publish "$PSScriptRoot/Dx12BackendProbe.csproj" -c Release -r win-x64 --no-restore -o $package @flags *> "$out/publish.log"
 if($LASTEXITCODE){throw "Probe NativeAOT publish failed: $out/publish.log"}
 Copy-Item -LiteralPath "$package/licenses/monogame-dx12/provenance.json" -Destination "$out/public-native-package-provenance.json"
 Copy-Item -LiteralPath "$native/payload/mgruntime.dll" -Destination "$package/mgruntime.dll" -Force
 Copy-Item -LiteralPath "$native/payload/provenance.json" -Destination "$package/licenses/monogame-dx12/provenance.json" -Force
 $manifest=[ordered]@{probeSourceCommit=$commit;nativeSourceCommit=$nativeProvenance.sourceCommit;nativeSha256=$nativeProvenance.sha256;exeSha256=(Get-FileHash "$package/Dx12BackendProbe.exe").Hash}
 $manifest|ConvertTo-Json|Set-Content "$package/probe-manifest.json" -Encoding utf8
 Copy-Item -LiteralPath "$PSScriptRoot/Run-Probe.cmd","$PSScriptRoot/README.md","$repo/LICENSE.txt" -Destination $package
 New-Item -ItemType Directory -Path "$package/diagnostics"|Out-Null
 Copy-Item -LiteralPath "$native/payload/provenance.json","$out/public-native-package-provenance.json" -Destination "$package/diagnostics"
 Assert-MgeCleanSource -Root $repo -Pins $pin.submodules
 if((& git -C $repo rev-parse HEAD).Trim() -ne $commit -or $LASTEXITCODE){throw 'Probe source changed during build'}
 [ordered]@{probe='Dx12BackendProbe';diagnosticOnly=$true;probeCommit=$commit;nativeCommit=$nativeProvenance.sourceCommit;nativeSha256=$nativeProvenance.sha256;exeSha256=$manifest.exeSha256;frameworkPackage='MyGameEngine.MonoGame.Framework.Native 3.8.6-mge.3';frameworkCompileSha256=$frameworkHash;dotnetSdk=(& dotnet --version);nativeAot=$true;gameDependencies=@();buildArguments=$flags;sourceChecks=$true}|ConvertTo-Json -Depth 5|Set-Content "$out/build-provenance.json" -Encoding utf8
 Get-Content "$out/build-provenance.json"
 # Running and packaging are separate from compilation, so validation can retain
 # native crash logs and run without triggering another build.
}finally{$env:MSBUILDDISABLENODEREUSE=$oldReuse;$env:DOTNET_CLI_USE_MSBUILD_SERVER=$oldServer}

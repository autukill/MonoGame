param([Parameter(Mandatory)][string]$OutputRoot,
 [string]$ToolchainRoot='D:\Apps\Development\Emscripten-6.0.2-dotnet11-rc2',
 [string]$DotNetRoot='C:\Program Files\dotnet',
 [string]$NodeExecutable=(Get-Command node -ErrorAction Stop).Source,
 [string]$PackageVersion='3.8.7-webgl-mge.0',
 [ValidateSet('All','Managed')][string]$Stage='All')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$out=[IO.Path]::GetFullPath($OutputRoot)
& "$PSScriptRoot/assert-clean.ps1" -Root $root
if($Stage -eq 'All' -and (Test-Path -LiteralPath $out)){throw 'Use a fresh output directory'}
$commit=(& git -C $root rev-parse HEAD).Trim()
New-Item -ItemType Directory -Force -Path "$out/packages","$out/effects"|Out-Null
$env:DOTNET_ROOT=$DotNetRoot
$env:MSBUILDDISABLENODEREUSE='1';$env:DOTNET_CLI_USE_MSBUILD_SERVER='0'
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1';$env:DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE='true';$env:EMCC_CORES='1'
$env:NUGET_PACKAGES=Join-Path (Split-Path $out) 'nuget'
$dotnet=Join-Path $DotNetRoot 'dotnet.exe';$cmake=Join-Path $ToolchainRoot 'cmake/bin/cmake.exe'
$ninja=Join-Path $ToolchainRoot 'ninja/ninja.exe';$python=Join-Path $ToolchainRoot 'python/python.exe'
$bounded=@('--disable-build-servers','-m:1','-nr:false','-p:UseSharedCompilation=false','-p:BuildInParallel=false','-p:RestoreBuildInParallel=false','-p:DisableParallelEmccCompile=true','-p:DisableParallelAot=true')
function Run([string]$Exe,[string[]]$Arguments){ & $Exe @Arguments; if($LASTEXITCODE){throw "Exit $LASTEXITCODE from $Exe"} }
Push-Location $root
try{
 if((& $dotnet --version).Trim() -ne '11.0.100-rc.2.26504.105'){throw 'Expected pinned machine .NET 11 RC2'}
 if($Stage -eq 'All'){
  foreach($effect in @('AlphaTestEffect','BasicEffect','DualTextureEffect','EnvironmentMapEffect','SkinnedEffect','SpriteEffect')){
   $bytes=[IO.File]::ReadAllBytes("$root/MonoGame.Framework/Platform/Graphics/Effect/Resources/$effect.ogl.mgfxo")
   $body=($bytes|ForEach-Object{'0x{0:x2}' -f $_}) -join ','
   [IO.File]::WriteAllText("$out/effects/$effect.ogl.mgfxo.h","// Exact tracked bytes; generated in output only.`nstatic const unsigned char ${effect}_ogl_mgfxo[] = {$body};`n")
  }
  Run $cmake @('-S',$PSScriptRoot,'-B',"$out/native-build",'-G','Ninja',"-DCMAKE_MAKE_PROGRAM=$ninja",'-DCMAKE_BUILD_TYPE=Release',"-DCMAKE_TOOLCHAIN_FILE=$root/native/monogame/browser-wasm/DotNetEmscripten.cmake",'-DDOTNET_EMSCRIPTEN_PACK_VERSION=11.0.0-rc.2.26504.105',"-DDOTNET_EMSCRIPTEN_ROOT_PATH=$ToolchainRoot/upstream/emscripten", "-DDOTNET_EMSCRIPTEN_NODE_JS=$NodeExecutable", "-DDOTNET_EMSCRIPTEN_PYTHON=$python", "-DDOTNET_EMSCRIPTEN_SEED_CACHE_ROOT=$ToolchainRoot/seed-cache/emscripten/cache", "-DMONOGAME_BROWSER_OUTPUT_ROOT=$out/native", "-DMGE_EFFECTS=$out/effects")
  Run $cmake @('--build',"$out/native-build",'--parallel','1')
  @{sourceCommit=$commit;completedUtc=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content "$out/native-source.json"
 }
 $nativeSource=Get-Content "$out/native-source.json" -Raw|ConvertFrom-Json
 & git -C $root diff --quiet $nativeSource.sourceCommit HEAD -- native external ThirdParty MonoGame.Framework/Platform/Graphics/Effect/Resources mge/webgl2/CMakeLists.txt
 if($LASTEXITCODE){throw 'Native source changed; use a fresh full build'}
 $config="<?xml version=`"1.0`"?><configuration><packageSources><clear/><add key=`"local`" value=`"$($out.Replace('&','&amp;'))/packages`"/><add key=`"nuget.org`" value=`"https://api.nuget.org/v3/index.json`"/></packageSources></configuration>"
 [IO.File]::WriteAllText("$out/NuGet.Config",$config)
 foreach($project in @("$root/MonoGame.Framework/MonoGame.Framework.Native.csproj","$PSScriptRoot/Runtime.csproj")){
  Run $dotnet (@('pack',$project,'-c','Release','-o',"$out/packages","-p:Version=$PackageVersion","-p:MgeNativeOutput=$out/native/Release","-p:RestoreConfigFile=$out/NuGet.Config")+$bounded)
 }
 Run $dotnet (@('publish',"$PSScriptRoot/Probe/Probe.csproj",'-c','Release','-o',"$out/publish","-p:MgePackageVersion=$PackageVersion","-p:MgeNodeExecutable=$NodeExecutable","-p:RestoreConfigFile=$out/NuGet.Config", "-p:EmscriptenSdkToolsPath=$ToolchainRoot/upstream/", "-p:EmscriptenUpstreamBinPath=$ToolchainRoot/upstream/bin/", "-p:EmscriptenUpstreamEmscriptenPath=$ToolchainRoot/upstream/emscripten/", "-p:EmscriptenNodeToolsPath=$(Split-Path $NodeExecutable)/", "-p:EmscriptenPythonToolsPath=$ToolchainRoot/python/", "-p:EmscriptenCacheSdkToolsPath=$ToolchainRoot/seed-cache/")+$bounded)
 & "$PSScriptRoot/assert-clean.ps1" -Root $root
 if((& git -C $root rev-parse HEAD).Trim() -ne $commit){throw 'Source changed during build'}
 $tools=@($dotnet,$NodeExecutable,$cmake,$ninja,$python,"$ToolchainRoot/upstream/emscripten/emcc.py")|ForEach-Object{@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash}}
 $payload=Get-ChildItem "$out/publish/wwwroot/_framework" -File|Where-Object Extension -in '.wasm','.js','.webcil'|ForEach-Object{@{file=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash}}
 @{sourceCommit=$commit;nativeSource=$nativeSource;upstream=(Get-Content "$PSScriptRoot/upstream.json" -Raw|ConvertFrom-Json);dotnetRoot=$DotNetRoot;sdk=(& $dotnet --version);nodeVersion=(& $NodeExecutable --version);tools=$tools;payload=$payload;packageVersion=$PackageVersion;outputRoot=$out;buildPid=$PID;completedUtc=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 8|Set-Content "$out/provenance.json"
}finally{Pop-Location}

#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputRoot,[Parameter(Mandatory)][string]$NativeBuildRoot,
 [string]$ToolchainRoot='D:/Apps/Development/emscripten-core',
 [string]$BuildToolsRoot='D:/Apps/Development/Emscripten-6.0.2-dotnet11-rc2',
 [string]$NodeModulesRoot='D:/Projects/Zhao/MyGameEngine/tools/wechat/node_modules')
$ErrorActionPreference='Stop';$root=[IO.Path]::GetFullPath("$PSScriptRoot/../..");$out=[IO.Path]::GetFullPath($OutputRoot)
if(Test-Path $out){throw 'Use a new output directory'}
if((& git -C $root status --porcelain)){throw 'Commit the complete backend candidate before building'}
$revision=(& git -C $root rev-parse HEAD).Trim();New-Item -ItemType Directory "$out/payload/native","$out/payload/tools","$out/payload/licenses","$out/packages"|Out-Null
. "$PSScriptRoot/Process.ps1"
$sdk='C:/Program Files/dotnet/dotnet.exe'
if((& $sdk --version).Trim() -ne '11.0.100-rc.2.26504.105'){throw 'Pinned machine .NET 11 RC2 SDK required'}
if((Get-Content "$ToolchainRoot/upstream/emscripten/emscripten-version.txt" -Raw).Trim().Trim('"') -ne '3.1.56'){throw 'Emscripten 3.1.56 required'}
$env:EMSDK=$ToolchainRoot;$env:EM_CONFIG="$ToolchainRoot/.emscripten";$env:EMSDK_PYTHON="$ToolchainRoot/python/3.13.3_64bit/python.exe";$env:EM_CACHE="$ToolchainRoot/cache";$env:EMCC_CORES='1';$env:BINARYEN_CORES='1';$env:CMAKE_BUILD_PARALLEL_LEVEL='1';$env:MSBUILDDISABLENODEREUSE='1';$env:DOTNET_CLI_USE_MSBUILD_SERVER='0'
$flags=@('--disable-build-servers','-m:1','-nr:false','-p:UseSharedCompilation=false','-p:BuildInParallel=false','-p:RestoreBuildInParallel=false')
Invoke-WeChatProcess 'framework' $sdk (@('build',"$root/MonoGame.Framework/MonoGame.Framework.WeChat.csproj",'-c','Release','-p:Version=3.8.6','-p:NuGetAudit=false')+$flags) $root $out
# The producer verifies pinned source checkouts and regenerates only exact tracked shader bytes.
$locks=Get-Content "$PSScriptRoot/sources.json" -Raw|ConvertFrom-Json
foreach($source in @(@{path="$PSScriptRoot/.sources/SDL";revision=$locks.sdlCommit},@{path="$root/external/stb";revision=(& git -C $root rev-parse 'HEAD:external/stb')},@{path="$root/ThirdParty/StbImageSharp";revision=(& git -C $root rev-parse 'HEAD:ThirdParty/StbImageSharp')},@{path="$root/ThirdParty/StbImageWriteSharp";revision=(& git -C $root rev-parse 'HEAD:ThirdParty/StbImageWriteSharp')})) {
 if((& git -C $source.path rev-parse HEAD).Trim() -ne $source.revision -or (& git -C $source.path status --porcelain)){throw "Pinned source missing or modified: $($source.path)"}
}
New-Item -ItemType Directory "$NativeBuildRoot/effects","$NativeBuildRoot/Release" -Force|Out-Null
foreach($effect in @('AlphaTestEffect','BasicEffect','DualTextureEffect','EnvironmentMapEffect','SkinnedEffect','SpriteEffect')) {
 $data=[IO.File]::ReadAllBytes("$root/MonoGame.Framework/Platform/Graphics/Effect/Resources/$effect.ogl.mgfxo")
 $header="// Exact official 3.8.6 tracked effect bytes.`nstatic const unsigned char $($effect)_ogl_mgfxo[] = {"+(($data|ForEach-Object {'0x'+$_.ToString('x2')}) -join ',')+"};`n"
 $destination="$NativeBuildRoot/effects/$effect.ogl.mgfxo.h"
 if(!(Test-Path $destination) -or [IO.File]::ReadAllText($destination) -ne $header){[IO.File]::WriteAllText($destination,$header)}
}
if(Test-Path "$NativeBuildRoot/build/CMakeCache.txt") {
 $cache=Get-Content "$NativeBuildRoot/build/CMakeCache.txt" -Raw
 if(!$cache.Contains("CMAKE_HOME_DIRECTORY:INTERNAL=$($PSScriptRoot.Replace([char]92,[char]47))")){throw 'Native cache belongs to another source tree'}
} else {
 Invoke-WeChatProcess 'configure' "$BuildToolsRoot/cmake/bin/cmake.exe" @('-S',$PSScriptRoot,'-B',"$NativeBuildRoot/build",'-G','Ninja',"-DCMAKE_MAKE_PROGRAM=$BuildToolsRoot/ninja/ninja.exe",'-DCMAKE_BUILD_TYPE=Release',"-DCMAKE_TOOLCHAIN_FILE=$ToolchainRoot/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake","-DMGE_OUTPUT=$NativeBuildRoot/Release","-DMGE_EFFECTS=$NativeBuildRoot/effects") $root $out
}
Invoke-WeChatProcess 'native' "$BuildToolsRoot/cmake/bin/cmake.exe" @('--build',"$NativeBuildRoot/build",'--parallel','1') $root $out
foreach($name in @('mgruntime.a','libSDL2.a')){Copy-Item "$NativeBuildRoot/Release/$name" "$out/payload/native/$name"}
foreach($name in @('MonoGame.Framework.dll','MonoGame.Framework.xml')){Copy-Item "$root/Artifacts/MonoGame.Framework/WeChat/Release/$name" "$out/payload/$name"}
Copy-Item "$NodeModulesRoot/esbuild/lib/main.js" "$out/payload/tools/esbuild.cjs"
if((Get-Content "$NodeModulesRoot/esbuild/package.json" -Raw|ConvertFrom-Json).version -ne $locks.esbuild){throw 'Pinned esbuild version required'}
$esbuild=Join-Path $NodeModulesRoot '@esbuild/win32-x64/esbuild.exe';if(!(Test-Path $esbuild)){throw 'Pinned esbuild Windows x64 binary missing'}
Copy-Item $esbuild "$out/payload/tools/esbuild.exe"
Copy-Item "$root/LICENSE.txt" "$out/payload/licenses/MonoGame.txt";Copy-Item "$root/THIRD-PARTY-NOTICES.txt" "$out/payload/licenses/ThirdParty.txt";Copy-Item "$PSScriptRoot/.sources/SDL/LICENSE.txt" "$out/payload/licenses/SDL.txt";Copy-Item "$NodeModulesRoot/esbuild/LICENSE.md" "$out/payload/licenses/esbuild.txt"
Copy-Item "$PSScriptRoot/Tools/probe-simd.wasm" "$out/payload/tools/probe-simd.wasm"
$payload=Get-ChildItem "$out/payload" -File -Recurse|ForEach-Object {@{path=[IO.Path]::GetRelativePath("$out/payload",$_.FullName).Replace('\','/');sha256=(Get-FileHash $_.FullName).Hash.ToLowerInvariant();bytes=$_.Length}}
@{packageId='MyGameEngine.MonoGame.Runtime.WeChat.WebGL2';version='3.8.6-mge.2-astc.2';sourceCommit=$revision;inputs=(Get-Content "$PSScriptRoot/sources.json" -Raw|ConvertFrom-Json);payload=$payload;validated=$false;physical='NOT_TESTED';sourceDirty=$false}|ConvertTo-Json -Depth 10|Set-Content "$out/payload/provenance.json"
Invoke-WeChatProcess 'pack' $sdk (@('pack',"$PSScriptRoot/Package/Package.csproj",'-c','Release','-o',"$out/packages","-p:MgePayload=$out/payload","-p:MgeSourceCommit=$revision",'-p:NuGetAudit=false')+$flags) $root $out
if((& git -C $root rev-parse HEAD).Trim() -ne $revision -or (& git -C $root status --porcelain)){throw 'Source state changed during build'}
Write-Output "$out/packages/MyGameEngine.MonoGame.Runtime.WeChat.WebGL2.3.8.6-mge.2-astc.2.nupkg"

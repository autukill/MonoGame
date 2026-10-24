# WeChat backend 3.8.6-mge.1 (implementation in progress)

One self-maintained NuGet: `MyGameEngine.MonoGame.Runtime.WeChat.WebGL2`. Based on official 3.8.6 c610a529, with target-specific WebGL inputs backported from 7bc100e0. The existing DX12, desktop and Android source inputs are not replaced. The package will contain the matching Framework, runtime glue and native archives; ordinary MonoGame projects will not need MyGameEngine/Monster.

Status: not publicly released. Independent MonoGame validation precedes Monster consumption and public upload. Standard 2D SoundEffect/Song audio is being implemented over shared wx WebAudio/file audio. 3D, XACT, dynamic audio streams, microphone and video are outside this release. No silent success substitutes.

Native builds use pinned Emscripten 3.1.56, one worker and immutable source identities. The .NET SDK is 11.0.100-rc.2.26504.105; applications use net10.0 NativeAOT-LLVM/CPP EH. No interpreter fallback. Licenses and notices remain intact. Consumer builds will use package-relative prebuilt inputs.

## Consumer boundary

The package supplies the matching `MonoGame.Framework.dll`, `mgruntime.a`, SDL,
wx Canvas/WebGL2/touch/audio/filesystem adapters and a pinned LLVM exporter.
The Framework contains platform code, so it is compiled for WeChat from the
3.8.6 source rather than reused from a desktop or upstream Native package.
Existing platform builds are unchanged. Do not reference another MonoGame
platform package in the same target. Engine scene policy, dynamic font engines,
profile serialization, asset selection and remote pack deployment stay outside
this backend.

A net10.0 `browser-wasm` executable declares `MonoGameWeChat=true` and references this fixed package and the two pinned LLVM
compiler packages shown in `Probe/Probe.csproj`, then awaits
`MonoGame.Runtime.WeChat.WebGL2.WeChatGame.RunAsync(game)`. RunAsync owns and
disposes the supplied Game. RequestStop/StopAsync follow normal Game.Exit.
The backend does not choose the game's logical or rendering frequencies.
`Probe` uses only standard MonoGame APIs; there are no MyGameEngine or Monster
project references. It is not included in the NuGet runtime payload.

`MonoGameWeChatExportPath` enables the Publish export target, using
`MonoGameWeChatConfiguration` (default `wechat.json`) and Node. The JSON declares
an explicit AppID, orientation, unique storage namespace, local files and mounts.
The producer bundles its dependencies; consumers do not install npm packages or
reference local MonoGame repositories. Public release and Monster verification
remain pending.

## Build inputs and checks

Producer Windows x64: .NET 11 RC2 11.0.100-rc.2.26504.105, Emscripten 3.1.56,
LLVM 10.0.0-rc.1.26357.1, esbuild 0.25.12 and the SDL revision in sources.json.
Initialize official pinned git submodules and the SDL checkout under
`.sources/SDL` first. `build.ps1` verifies their identities and clean state,
uses a fresh OutputRoot, records owned processes, and runs managed/native/pack
steps serially. It never downloads or rebuilds consumer inputs implicitly.
Use `--disable-build-servers -m:1 -nr:false -p:UseSharedCompilation=false
-p:BuildInParallel=false -p:RestoreBuildInParallel=false` for .NET builds;
set MSBUILDDISABLENODEREUSE=1 and DOTNET_CLI_USE_MSBUILD_SERVER=0.
Native builds use one worker. Run regression tests with `bun test mge/wechat/Tests`.

Vendored text-encoding 0.7.0 retains its own license in Host/vendor. The SIMD
fixture is a generated capability check, not game content. SoundEffect accepts
PCM WAV (8/16-bit integer or 32-bit float) and raw PCM constructors, submitting
PCM to wx WebAudio. Other encodings must be decoded by the application;
Song uses local/cache wav or mp3 through wx InnerAudioContext. Actual audible
output and system interruption behavior require phone validation. Unsupported
3D/XACT/streaming/video/native graphics handles raise explicit errors.

The pinned LLVM package owns the AOT pipeline. Do not set the stock SDK
PublishAot=true for browser-wasm: .NET SDK rejects that RID before this LLVM
package can participate in the first restore. This is still native LLVM AOT.

The executable also declares PublishTrimmed=true, SelfContained=true and
UseAppHost=false before its first restore, as shown in Probe.csproj; the SDK
needs these to include its ILLink preparation targets. Export reads the LLVM
NativeOutputPath, whose full runtime modules are not all copied by Publish.
The exporter parses final JavaScript as ES2019, including bundler helpers.

One WebGL clear-state cache is owned by the backend; explicit resize invalidates
it and stop restores native methods. Resume resets MonoGame elapsed time. An
optional extension factory receives backend-owned services and installs engine
policy; it does not create a second audio context, Canvas, filesystem or loop.

Public/protected metadata signatures have been compared against the official
3.8.6 Native DLL: 4,161 entries, zero missing or added. The source-only
Tests/ApiSurface tool uses metadata, without loading native dependencies.
Resource bytes and extension/backend scripts are included in export identity.

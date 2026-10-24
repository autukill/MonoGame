# WeChat backend 3.8.6-mge.1 (implementation in progress)

One self-maintained NuGet: `MyGameEngine.MonoGame.Runtime.WeChat.WebGL2`. Based on official 3.8.6 c610a529, with target-specific WebGL inputs backported from 7bc100e0. The existing DX12, desktop and Android source inputs are not replaced. The package will contain the matching Framework, runtime glue and native archives; ordinary MonoGame projects will not need MyGameEngine/Monster.

Status: not released or accepted. Independent MonoGame validation precedes Monster consumption and public upload. Standard 2D SoundEffect/Song audio is being implemented over shared wx WebAudio/file audio. 3D, XACT, dynamic audio streams, microphone and video are outside this release. No silent success substitutes.

Native builds use pinned Emscripten 3.1.56, one worker and immutable source identities. The .NET SDK is 11.0.100-rc.2.26504.105; applications use net10.0 NativeAOT-LLVM/CPP EH. No interpreter fallback. Licenses and notices remain intact. Consumer builds will use package-relative prebuilt inputs.

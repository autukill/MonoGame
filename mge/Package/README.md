# MyGameEngine.MonoGame.Runtime.Windows.DX12

Unofficial MyGameEngine maintenance runtime based on official MonoGame 3.8.6.
Windows x64 DX12 only; use with official MonoGame.Framework.Native **3.8.6**.
Do not reference MonoGame.Runtime.Windows.DX12 alongside this package.

Six fixes: remove unused constant uploads; avoid SDL Vulkan driver loading on DX12;
release mip signature blobs; create mip pipeline on first use; page CPU SRV descriptors;
restore graphics PSO after mip generation. See docs/ and provenance.json for source,
commit, upstream/submodule pins, build parameters and DLL SHA256.

No managed framework replacement, shader/quality reduction, forced GC or consumer native builds.
The native library keeps its runtime-required name mgruntime.dll.
The maintenance source is currently a local Git repository named MyGameEngine-MonoGame;
no public fork URL is claimed. Original licenses and third-party notices are included.

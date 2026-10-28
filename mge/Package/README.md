# MyGameEngine.MonoGame.Runtime.Windows.DX12

Unofficial MyGameEngine maintenance runtime based on official MonoGame 3.8.6.
Windows x64 DX12 only; use with MyGameEngine.MonoGame.Framework.Native **3.8.6-mge.3**.
Do not reference MonoGame.Runtime.Windows.DX12 alongside this package.

Eight fixes: remove unused constant uploads; avoid SDL Vulkan driver loading on DX12;
release mip signature blobs; create mip pipeline on first use; page CPU SRV descriptors;
restore graphics PSO after mip generation; avoid virgin upload Discard renaming;
reuse existing placement-aligned upload capacity. See docs/ and provenance.json for source,
commit, upstream/submodule pins, build parameters and DLL SHA256.

Adds BC7 linear/sRGB upload, sampling and compressed readback. The paired managed
framework preserves the MonoGame.Framework 3.8.6.0 assembly identity and recognizes
BC7 block sizes. Do not mix it with the official Native framework in one application.
No shader/quality reduction, forced GC or consumer native builds.
The native library keeps its runtime-required name mgruntime.dll.
Maintenance source: https://github.com/autukill/MonoGame/tree/mge/3.8.6
Original licenses and third-party notices are included.

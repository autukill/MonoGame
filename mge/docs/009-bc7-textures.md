# MGE-DX12-009: BC7 texture upload and readback

Feature addition against official 3.8.6 `c610a529667336f63da323c6057274258727664b`.
This is not a claim that all later official releases lack BC7.

Feature commit: `3e3bace62` (`feat(dx12): support BC7 texture upload sampling and readback`).
Replay that commit before the separately committed local packaging integration.

## Porting to a new official release

Keep this change as an independently replayable feature commit. The validation report
records its exact SHA, the companion packaging commit and the engine consumer commit.
On a new `mge/<official-version>` branch first inspect the upstream SurfaceFormat,
generated MGSurfaceFormat and DX12 mappings. If upstream has equivalent BC7 support,
use its enum values and retain these regressions instead of adding duplicate formats.
Otherwise replay this feature, resolve enum additions, regenerate/verify native enum
parity, and rerun native lifecycle plus BC7 public-API GPU tests before packaging.

Managed and native formats are appended as 104/105; 102/103 are reserved by the
maintained WeChat backend. No existing value, exported function or Effect changes.
The paired managed candidate is required because the official framework's block
classification/size validation does not recognize these values. Do not cast unknown
numbers through the official framework or mix the new native package with it.

Review SurfaceFormat, shared managed size/block helpers, generated api_enums.h,
DX12 GraphicsEnums, GetFormatSize/GetTexturePitch and compressed readback rows.
DX12 Texture.h already classifies BC7 as a 4x4 block. Other backends are not enabled.
Odd-sized base textures remain subject to D3D12 allocation restrictions; full mip
tails retain their original dimensions and complete edge blocks.

## Validation

Source checks and independent BC7 GPU upload/sample/readback regressions must cover
linear/sRGB, RGBA, multiple mips, odd/small base sizes, invalid lengths and repeated
resource lifetimes. The report must distinguish rejected base dimensions from valid
mip tails. Preserve the 172-export ABI and six official builtin Effects.
Results are recorded separately; this document alone does not assert a passing run.

Local validation on 2026-10-28 passed source checks, the unchanged 172 exports and
six official Effects, native lifecycle, BC7 public-API GPU checks, and the engine's
26 real KTX2 uploads / 131072 alpha pixels / DX12 NativeAOT full-trim startup.
See `mge/validation/bc7-20261028.json`. This is not a public package release or a
certification for other adapters/backends.

Paired candidate production commit: `eb18681b4`. Packaging metadata correction:
`9edb9ce4b` (maintained repository URL and explicit unofficial description).
The corrected local framework package was packed without rebuilding the verified
DLL, retains its actual compiled source commit `eb18681b4`, and restored in a new
cache with byte-identical DLLs. Original packages/evidence were preserved. Neither
local candidate was published; do not replace a published version in this manner.

Build with serial native `--parallel 1 -- /m:1 /nr:false` and managed
`--disable-build-servers -m:1 -nr:false -p:UseSharedCompilation=false
-p:BuildInParallel=false -p:RestoreBuildInParallel=false`, with
MSBUILDDISABLENODEREUSE=1 and DOTNET_CLI_USE_MSBUILD_SERVER=0.
Candidate packages are local only; no public release or upstream contribution.

## Public maintenance release

The historical candidates above remain unpublished. The rebuilt paired release
`3.8.6-mge.3` is now public; see `release-3.8.6-mge.3.md` for exact producing
commit, new binary hashes, signatures and public-cache GPU validation.
Use `mge/build-maintained-dx12.ps1` for future reviewed maintenance production.
The independently portable feature commit remains `3e3bace62`.

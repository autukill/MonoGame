# ASTC candidate 3.8.6-mge.2-astc.4

The WeChat-only native WebGL2 backend maps ASTC LDR 4x4 and 6x6, with
explicit linear and sRGB surface formats. Existing enum values and other
platform packages are unchanged. The additive probe uses the active context,
enables WEBGL_compressed_texture_astc and validates real compressed uploads
using valid LDR void-extent blocks. It restores texture bindings and requires
neither S3TC nor desktop compressed texture readback. No encoder, decoder,
KTX2, Basis or Zstd library is included in the runtime.

The producer builds serially, with MSBUILDDISABLENODEREUSE=1 and
DOTNET_CLI_USE_MSBUILD_SERVER=0; managed flags are --disable-build-servers
-m:1 -nr:false -p:UseSharedCompilation=false -p:BuildInParallel=false
-p:RestoreBuildInParallel=false. Native builds use --parallel 1. Candidate
validation and physical device results are recorded by the consuming engine;
this document does not claim physical device acceptance or public publication.

Candidate .3 fixes the iOS WeChat 3.17.5 extension object without getSupportedProfiles(). Missing profile metadata continues through advertised formats and actual LDR uploads; exceptions return unsupported so the application can choose PNG. Regression coverage includes the missing method in both color spaces, throwing APIs, failed uploads, and binding/texture cleanup.

Candidate .4 records each ASTC probe phase, format list, prior GL errors and storage/upload errors. The probe drains at most 16 prior context errors before testing, so unrelated initialization errors do not become ASTC failures. Success still requires advertised formats and successful real LDR uploads. These capability diagnostics add no player test controls.

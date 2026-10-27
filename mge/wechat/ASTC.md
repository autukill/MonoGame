# ASTC candidate 3.8.6-mge.2-astc.2

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

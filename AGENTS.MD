# MyGameEngine MonoGame maintenance branch

This is the user's independent maintenance repository. AI-assisted local fixes,
documentation, regression tests and commits are explicitly permitted here.
The upstream MonoGame contribution policy still governs contributions to upstream:
never open an upstream issue/PR or submit this branch there.

- Maintain one branch per official release: mge/<version>.
- Only implement fixes required by MyGameEngine; document and test each fix.
- Preserve licenses, notices, public ABI, builtin shaders and other backends.
- Build serially. Set MSBUILDDISABLENODEREUSE=1 and DOTNET_CLI_USE_MSBUILD_SERVER=0.
- Managed builds: --disable-build-servers -m:1 -nr:false
  -p:UseSharedCompilation=false -p:BuildInParallel=false -p:RestoreBuildInParallel=false.
- Native builds: --parallel 1 -- /m:1 /nr:false /p:UseSharedCompilation=false /p:BuildInParallel=false.
- Await and reconcile owned processes; never stop unrelated apps/builds.
- Publish only a clean, committed, validated package. Never store credentials.

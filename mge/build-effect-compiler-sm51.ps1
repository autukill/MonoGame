param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$out=[IO.Path]::GetFullPath($OutputRoot)
if(Test-Path -LiteralPath $out){throw 'Choose a fresh compiler output directory'}
$pins=Get-Content "$PSScriptRoot/upstream.json" -Raw|ConvertFrom-Json
. "$PSScriptRoot/assert-clean-source.ps1"
Assert-MgeCleanSource -Root $repo -Pins $pins.submodules
$commit=(& git -C $repo rev-parse HEAD).Trim();if($LASTEXITCODE){throw 'Cannot read source commit'}
New-Item -ItemType Directory -Path $out | Out-Null
[ordered]@{pid=$PID;startTime=(Get-Process -Id $PID).StartTime.ToString('o');operation='Serial SM5.1 offline compiler build';sourceCommit=$commit}|ConvertTo-Json|Set-Content "$out/owner.json"
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs=(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
$cmake=Join-Path $vs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
$oldReuse=$env:MSBUILDDISABLENODEREUSE;$oldServer=$env:DOTNET_CLI_USE_MSBUILD_SERVER
$env:MSBUILDDISABLENODEREUSE='1';$env:DOTNET_CLI_USE_MSBUILD_SERVER='0'
$flags=@('--disable-build-servers','-m:1','-nr:false','-p:UseSharedCompilation=false','-p:BuildInParallel=false','-p:RestoreBuildInParallel=false','-p:NuGetAudit=false')
try {
 & $cmake -S "$PSScriptRoot/tools/Sm51Compiler" -B "$out/native-build" -G 'Visual Studio 18 2026' -A x64 *> "$out/configure.log"
 if($LASTEXITCODE){throw "Helper configure failed: $out/configure.log"}
 & $cmake --build "$out/native-build" --config Release --parallel 1 -- /m:1 /nr:false /p:UseSharedCompilation=false /p:BuildInParallel=false *> "$out/native-build.log"
 if($LASTEXITCODE){throw "Helper build failed: $out/native-build.log"}
 & dotnet restore "$repo/Tools/MonoGame.Effect.Compiler/MonoGame.Effect.Compiler.csproj" --disable-parallel @flags *> "$out/restore.log"
 if($LASTEXITCODE){throw "Compiler restore failed: $out/restore.log"}
 & dotnet publish "$repo/Tools/MonoGame.Effect.Compiler/MonoGame.Effect.Compiler.csproj" -c Release --no-restore -o "$out/compiler" @flags *> "$out/publish.log"
 if($LASTEXITCODE){throw "Compiler build failed: $out/publish.log"}
 Copy-Item -LiteralPath "$out/native-build/Release/mgfxc-sm51.exe" -Destination "$out/compiler"
 Assert-MgeCleanSource -Root $repo -Pins $pins.submodules
 [ordered]@{sourceCommit=$commit;compilerSha256=(Get-FileHash "$out/compiler/mgfxc.dll").Hash;helperSha256=(Get-FileHash "$out/compiler/mgfxc-sm51.exe").Hash;profile='DirectX_12_SM51';nativeConfiguration='Release x64 /MT';managedBuildArguments=$flags;sourceChecks=$true}|ConvertTo-Json -Depth 4|Set-Content "$out/compiler/provenance-sm51.json" -Encoding utf8
 Get-Content "$out/compiler/provenance-sm51.json"
}finally{$env:MSBUILDDISABLENODEREUSE=$oldReuse;$env:DOTNET_CLI_USE_MSBUILD_SERVER=$oldServer}

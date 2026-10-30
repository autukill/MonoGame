param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$out=[IO.Path]::GetFullPath($OutputRoot)
if(Test-Path -LiteralPath $out){throw 'Choose a fresh shader output directory'}
$pins=Get-Content "$repo/mge/upstream.json" -Raw|ConvertFrom-Json
. "$repo/mge/assert-clean-source.ps1"
Assert-MgeCleanSource -Root $repo -Pins $pins.submodules
$commit=(& git -C $repo rev-parse HEAD).Trim();if($LASTEXITCODE){throw 'Cannot read source commit'}
$kits=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots').KitsRoot10
$fxc=Get-ChildItem -LiteralPath "$kits/bin" -Directory | Sort-Object Name -Descending |
 ForEach-Object {Join-Path $_.FullName 'x64/fxc.exe'} | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
if(!$fxc){throw 'Windows SDK x64 FXC is required only on the build machine'}
New-Item -ItemType Directory -Path $out | Out-Null
[ordered]@{pid=$PID;startTime=(Get-Process -Id $PID).StartTime.ToString('o');operation='Serial offline FXC SM5.1 compilation';sourceCommit=$commit}|ConvertTo-Json|Set-Content "$out/owner.json"
$oldReuse=$env:MSBUILDDISABLENODEREUSE;$oldServer=$env:DOTNET_CLI_USE_MSBUILD_SERVER
$env:MSBUILDDISABLENODEREUSE='1';$env:DOTNET_CLI_USE_MSBUILD_SERVER='0'
try {
 foreach($stage in @('vs','ps')) {
  $vertex=if($stage -eq 'vs'){'1'}else{'0'}
  & $fxc /nologo /WX /O3 /T "${stage}_5_1" /E $stage.ToUpperInvariant() /D "VERTEX_STAGE=$vertex" /Fo "$out/$stage.cso" /Fc "$out/$stage.asm" "$PSScriptRoot/Probe.hlsl" *> "$out/$stage.compile.log"
  if($LASTEXITCODE){throw "FXC $stage failed: $out/$stage.compile.log"}
 }
 & $fxc /nologo /WX /O3 /T cs_5_1 /E main /Fo "$out/mips.cso" /Fh "$out/GenerateMips_SM51.h" /Vn GenerateMips_main /Fc "$out/mips.asm" "$repo/native/monogame/directx12/GenerateMips.hlsl" *> "$out/mips.compile.log"
 if($LASTEXITCODE){throw "FXC compute failed: $out/mips.compile.log"}
 & python "$PSScriptRoot/verify-shaders.py" $out
 if($LASTEXITCODE){throw 'SM5.1 bytecode/reflection verification failed'}
 $hashes=[ordered]@{}
 foreach($name in @('vs.cso','ps.cso','mips.cso','GenerateMips_SM51.h')){$hashes[$name]=(Get-FileHash -LiteralPath "$out/$name").Hash}
 [ordered]@{sourceCommit=$commit;shaderModel='5.1 DXBC';compiler=$fxc;compilerSha256=(Get-FileHash -LiteralPath $fxc).Hash;filesSha256=$hashes;probeHlslSha256=(Get-FileHash -LiteralPath "$PSScriptRoot/Probe.hlsl").Hash;mipHlslSha256=(Get-FileHash -LiteralPath "$repo/native/monogame/directx12/GenerateMips.hlsl").Hash;fixedSchemaFixture=$true}|ConvertTo-Json -Depth 5|Set-Content "$out/shader-inputs.json" -Encoding utf8
 Assert-MgeCleanSource -Root $repo -Pins $pins.submodules
 Get-Content "$out/shader-inputs.json"
}finally{$env:MSBUILDDISABLENODEREUSE=$oldReuse;$env:DOTNET_CLI_USE_MSBUILD_SERVER=$oldServer}

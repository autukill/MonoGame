param([Parameter(Mandatory)][string]$Root)
$ErrorActionPreference='Stop'
$status=@(& git -C $Root status --porcelain --untracked-files=all)
if($LASTEXITCODE -or $status.Count){throw "Source must be committed and clean: $Root $status"}
$pins=Get-Content "$Root/mge/webgl2/upstream.json" -Raw|ConvertFrom-Json
foreach($entry in $pins.submodules.PSObject.Properties){
  $checkout=Join-Path $Root $entry.Name
  $actual=& git -C $checkout rev-parse HEAD
  if($LASTEXITCODE -or $actual -ne $entry.Value){throw "Wrong submodule: $($entry.Name)"}
  $dirty=@(& git -C $checkout status --porcelain --untracked-files=all)
  if($LASTEXITCODE -or $dirty.Count){throw "Dirty submodule: $($entry.Name)"}
  $extras=@(& git -C $checkout ls-files --others)
  if($LASTEXITCODE -or $extras.Count){throw "Untracked submodule input: $($entry.Name)"}
}
$extras=@(& git -C $Root ls-files --others -- native/monogame external/stb ThirdParty/StbImageSharp ThirdParty/StbImageWriteSharp)
if($LASTEXITCODE -or $extras.Count){throw "Untracked native inputs (including ignored headers): $extras"}

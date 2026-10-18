function Assert-MgeCleanSource {
 param([Parameter(Mandatory)][string]$Root,[Parameter(Mandatory)][object]$Pins)
 $checkouts=@($Root)+@($Pins.PSObject.Properties|ForEach-Object{Join-Path $Root $_.Name})
 foreach($checkout in $checkouts){
  $status=@(& git -C $checkout status --porcelain --untracked-files=all)
  if($LASTEXITCODE -ne 0){throw "Cannot verify source status: $checkout"}
  if($status.Count){throw "Source checkout has uncommitted or untracked files: $checkout"}
 }
 # git ls-files --others without --exclude-standard also includes ignored files.
 # Reject ignored generated headers that could shadow the verified Effect headers.
 $compiled=@('native/monogame/include','native/monogame/common','native/monogame/directx12','native/monogame/sdl','native/monogame/xaudio','mge/tests/native')
 $extras=@(& git -C $Root ls-files --others -- @compiled)
 if($LASTEXITCODE -ne 0){throw 'Cannot enumerate native source inputs'}
 if($extras.Count){throw "Untracked native source inputs: $($extras -join ', ')"}
 foreach($entry in $Pins.PSObject.Properties){
  $checkout=Join-Path $Root $entry.Name
  $actual=(& git -C $checkout rev-parse HEAD)
  if($LASTEXITCODE -ne 0 -or $actual -ne $entry.Value){throw "Wrong submodule revision: $($entry.Name)"}
  $extras=@(& git -C $checkout ls-files --others)
  if($LASTEXITCODE -ne 0){throw "Cannot enumerate submodule inputs: $($entry.Name)"}
  if($extras.Count){throw "Untracked submodule inputs: $($entry.Name)"}
 }
}

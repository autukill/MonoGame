param([switch]$Merge)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
& "$PSScriptRoot/assert-clean.ps1" -Root $root
$pin=Get-Content "$PSScriptRoot/upstream.json" -Raw|ConvertFrom-Json
& git -c http.proxy= -c http.sslBackend=openssl -C $root fetch --no-tags webgl-upstream
if($LASTEXITCODE){throw 'Author fetch failed'}
& git -c http.proxy= -c http.sslBackend=openssl -C $root fetch --no-tags upstream refs/pull/9559/head:refs/remotes/upstream/pr/9559
if($LASTEXITCODE){throw 'Official PR fetch failed'}
$author=(& git -C $root rev-parse webgl-upstream/webgl2).Trim()
$official=(& git -C $root rev-parse upstream/pr/9559).Trim()
if($author -ne $official){throw 'Author branch and official PR differ; review the source before merging'}
& git -C $root merge-base --is-ancestor $pin.commit $author
if($LASTEXITCODE){throw 'Upstream rewrote history; preserve pins and reconcile manually, never force-push'}
& git -C $root log --oneline "$($pin.commit)..$author"
if($Merge){
 if((& git -C $root branch --show-current).Trim() -ne 'mge/webgl2'){throw 'Merge only on mge/webgl2'}
 & git -C $root merge --no-ff --no-edit $author
 if($LASTEXITCODE){throw 'Merge requires manual conflict resolution'}
 Write-Host 'Review code, update upstream.json and fix applicability, commit, rebuild/regress, then push.'
}

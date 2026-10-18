$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. "$root/mge/assert-clean-source.ps1"
$pin=Get-Content "$root/mge/upstream.json" -Raw|ConvertFrom-Json
Assert-MgeCleanSource -Root $root -Pins $pin.submodules
$fixture=Join-Path $root ('native/monogame/directx12/MgeGuard-'+[Guid]::NewGuid().ToString('N')+'.dx12.mgfxo.h')
try{
 [IO.File]::WriteAllText($fixture,'// ignored native input guard regression')
 & git -C $root check-ignore -q -- $fixture
 if($LASTEXITCODE -ne 0){throw 'Fixture must exercise an ignored native input'}
 $rejected=$false
 try{Assert-MgeCleanSource -Root $root -Pins $pin.submodules}catch{if($_.Exception.Message -like 'Untracked native source inputs:*'){$rejected=$true}else{throw}}
 if(!$rejected){throw 'Ignored native source input was accepted'}
}finally{if(Test-Path -LiteralPath $fixture){Remove-Item -LiteralPath $fixture}}
Assert-MgeCleanSource -Root $root -Pins $pin.submodules
Write-Host 'PASS clean source, ignored native input rejection, and unchanged pinned submodules'

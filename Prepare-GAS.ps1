param([switch]$Push,[switch]$Deploy)
$ErrorActionPreference='Stop'
$afExpectedId='1SM3hKmFADM-gYV6IuuZiH6XreZcwhIiAqUaObuiZf5KXGmUMKBHUfzdu'
$afDeploymentId='AKfycbxShlJXB7L1ctoDWG0TV9exyI3SQUA66cypHoeYUmID3_NUzVoREz39yLi1OnWnksNs9g'
$afManifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'patch-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
if($afManifest.scriptId -ne $afExpectedId){throw 'Script ID mismatch'}
$afTaskRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$afStage=Join-Path $afTaskRoot ('work/private/daytrade-prepare-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $afStage -Force | Out-Null
$afBinding=@{scriptId=$afExpectedId;rootDir='';scriptExtensions=@('.js','.gs');htmlExtensions=@('.html');jsonExtensions=@('.json')} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $afStage '.clasp.json'),$afBinding,[Text.UTF8Encoding]::new($false))
function Get-AfTextHash([string]$afPath){
 $afText=[IO.File]::ReadAllText($afPath).Replace("`r`n","`n").Trim()
 $afHasher=[Security.Cryptography.SHA256]::Create()
 try{return ([BitConverter]::ToString($afHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($afText)))).Replace('-','').ToLowerInvariant()}
 finally{$afHasher.Dispose()}
}
Push-Location -LiteralPath $afStage
try{
 & clasp pull
 if($LASTEXITCODE -ne 0){throw 'Clasp pull failed; no push attempted'}
 foreach($afFile in $afManifest.files){
  $afSource=Join-Path $PSScriptRoot $afFile.source
  if((Get-AfTextHash $afSource) -ne $afFile.patchedSha256){throw ('Patch changed: '+$afFile.source)}
  $afTarget=Join-Path $afStage $afFile.target
  if(Test-Path -LiteralPath $afTarget){
   $afCurrentHash=Get-AfTextHash $afTarget
   if($afCurrentHash -ne $afFile.baselineSha256 -and $afCurrentHash -ne $afFile.patchedSha256){throw ('Remote source changed; review required: '+$afFile.target)}
  }elseif($null -ne $afFile.baselineSha256){throw ('Expected remote file missing: '+$afFile.target)}
  Copy-Item -LiteralPath $afSource -Destination $afTarget
 }
 $afRuntime=Get-Content -LiteralPath 'appsscript.json' -Raw -Encoding utf8 | ConvertFrom-Json
 if($afRuntime.runtimeVersion -ne 'V8'){throw 'Expected V8 runtime'}
 if($afManifest.requiredScopes){
  $afScopes=@($afRuntime.oauthScopes)+@($afManifest.requiredScopes) | Where-Object { $_ } | Select-Object -Unique
  if($afRuntime.PSObject.Properties.Name -contains 'oauthScopes'){$afRuntime.oauthScopes=@($afScopes)}else{$afRuntime|Add-Member -NotePropertyName oauthScopes -NotePropertyValue @($afScopes)}
  [IO.File]::WriteAllText((Join-Path $afStage 'appsscript.json'),($afRuntime|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
 }
 if($afManifest.removeScopes){
  $afRuntime.oauthScopes=@($afRuntime.oauthScopes | Where-Object { $_ -notin $afManifest.removeScopes })
  [IO.File]::WriteAllText((Join-Path $afStage 'appsscript.json'),($afRuntime|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
 }
 # Preserve other remote files, access settings, provider config and properties; add only declared scopes.
 & clasp status
 if($LASTEXITCODE -ne 0){throw 'Clasp status failed'}
 Write-Output ('Prepared private staging: '+$afStage)
 if($Push -or $Deploy){
  $afLiveBinding=Get-Content -LiteralPath '.clasp.json' -Raw -Encoding utf8 | ConvertFrom-Json
  if($afLiveBinding.scriptId -ne $afExpectedId){throw 'Refusing push: Script ID mismatch'}
  & clasp push --force
  if($LASTEXITCODE -ne 0){throw 'Clasp push failed'}
 }
 if($Deploy){
  & clasp deploy --deploymentId $afDeploymentId --description 'Unblock analysis during status reads; reduce repeated ledger scans'
  if($LASTEXITCODE -ne 0){throw 'Clasp deploy failed'}
 }
}finally{Pop-Location}

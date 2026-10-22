param([string]$BaseUrl = 'http://127.0.0.1:8789')
$ErrorActionPreference = 'Stop'
$testKey = 'lp_' + ([Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))).ToLowerInvariant()
$otherKey = 'lp_' + ([Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))).ToLowerInvariant()
$item = @{ bvid='BV1zNGhzeEK4'; page=1; title='遥远的、遥远的、夏的彼方' }
function Send-TestRequest($Method='GET', $Body=$null, $Key=$testKey, $ExtraHeaders=@{}) {
  $requestHeaders = @{ Authorization="Bearer $Key" }
  foreach ($name in $ExtraHeaders.Keys) { $requestHeaders[$name] = $ExtraHeaders[$name] }
  $requestOptions = @{ Uri="$BaseUrl/api/favorites"; Method=$Method; Headers=$requestHeaders; SkipHttpErrorCheck=$true; TimeoutSec=30 }
  if ($null -ne $Body) { $requestOptions.Body = $Body | ConvertTo-Json -Compress; $requestOptions.ContentType = 'application/json; charset=utf-8' }
  Invoke-WebRequest @requestOptions
}
function Assert-Test($Condition, $Message) { if (-not $Condition) { throw $Message } }
try {
  Assert-Test ((Send-TestRequest 'GET' $null '').StatusCode -eq 401) 'Missing key should be rejected'
  Assert-Test ((Send-TestRequest 'POST' $item $testKey @{Origin='https://untrusted.example'}).StatusCode -eq 403) 'Foreign origin should be rejected'
  Assert-Test ((Send-TestRequest 'POST' @{bvid=$item.bvid; page=-1}).StatusCode -eq 400) 'Invalid page should be rejected'
  for ($i=0; $i -lt 2; $i++) {
    $r = Send-TestRequest 'POST' $item
    Assert-Test ($r.StatusCode -eq 201) "Save failed: $($r.Content)"
  }
  $saved = (Send-TestRequest).Content | ConvertFrom-Json
  Assert-Test ($saved.favorites.Count -eq 1) 'Duplicate favorite was not deduplicated'
  Assert-Test ($saved.favorites[0].title -eq $item.title) 'Saved title did not persist'
  Assert-Test ($saved.favorites[0].bvid -eq $item.bvid) 'BV did not persist'
  $other = (Send-TestRequest 'GET' $null $otherKey).Content | ConvertFrom-Json
  Assert-Test ($other.favorites.Count -eq 0) 'Library isolation failed'
  Assert-Test ((Send-TestRequest 'DELETE' $item $otherKey).StatusCode -eq 200) 'Other library deletion failed'
  Assert-Test (((Send-TestRequest).Content | ConvertFrom-Json).favorites.Count -eq 1) 'Another key deleted our favorite'
  $r = Send-TestRequest 'POST' @{input="https://www.bilibili.com/video/$($item.bvid)/?p=2"}
  Assert-Test ($r.StatusCode -eq 201) 'Direct URL save failed'
  Assert-Test (((Send-TestRequest).Content | ConvertFrom-Json).favorites.Count -eq 2) 'Part number was not preserved'
  Write-Output 'PASS: D1 save, read, duplicate prevention, key isolation, direct URL save, part preservation, validation and origin checks'
} finally {
  foreach ($part in @(1,2)) {
    $r = Send-TestRequest 'DELETE' @{bvid=$item.bvid; page=$part}
    Assert-Test ($r.StatusCode -eq 200) 'Test cleanup failed'
  }
  Assert-Test (((Send-TestRequest).Content | ConvertFrom-Json).favorites.Count -eq 0) 'Test rows remain'
  Write-Output 'PASS: delete and test data cleanup'
}

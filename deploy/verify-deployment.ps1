param(
  [Parameter(Mandatory=$true)]
  [string]$BackendApiBase,
  [Parameter(Mandatory=$true)]
  [string]$FrontendUrl
)

$backend = $BackendApiBase.Trim().TrimEnd('/')
$front = $FrontendUrl.Trim().TrimEnd('/')

Write-Host "Checking backend health..."
$health = Invoke-WebRequest -UseBasicParsing -Uri "$backend/health" -TimeoutSec 20
Write-Host "Backend /health status: $($health.StatusCode)"

Write-Host "Checking frontend index..."
$index = Invoke-WebRequest -UseBasicParsing -Uri "$front/" -TimeoutSec 20
Write-Host "Frontend / status: $($index.StatusCode)"

if ($health.StatusCode -ne 200 -or $index.StatusCode -ne 200) {
  throw "Deployment check failed."
}

Write-Host "Deployment check passed."
param(
  [Parameter(Mandatory=$true)]
  [string]$BackendApiBase
)

$base = $BackendApiBase.Trim().TrimEnd('/')
if ([string]::IsNullOrWhiteSpace($base)) {
  throw "BackendApiBase cannot be empty."
}

$configPath = Join-Path $PSScriptRoot "..\config.js"
$body = @"
window.__IG2_RUNTIME_CONFIG__ = window.__IG2_RUNTIME_CONFIG__ || {
  BACKEND_API_BASE: \"$base\"
};
"@

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($configPath, $body, $utf8NoBom)
Write-Host "Updated config.js BACKEND_API_BASE = $base"
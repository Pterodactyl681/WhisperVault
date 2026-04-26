param(
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

function Find-NodeDir {
  param([string]$Root)

  $candidates = @(
    (Join-Path $Root ".tools\\node-v20.20.1-win-x64"),
    "D:\\GhostTab\\.tools\\node-v20.20.1-win-x64",
    "C:\\Users\\Pterodactyl\\Documents\\mgbcool\\.tools\\node-v20.20.1-win-x64"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path (Join-Path $candidate "node.exe")) {
      return $candidate
    }
  }

  return $null
}

$nodeDir = Find-NodeDir -Root $repoRoot
$npmCmd = "npm"

if ($nodeDir) {
  $env:Path = "$nodeDir;$env:Path"
  $npmCmd = Join-Path $nodeDir "npm.cmd"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js was not found." -ForegroundColor Red
  Write-Host "Install Node.js 20+ or place portable Node in .tools\\node-v20.20.1-win-x64" -ForegroundColor Yellow
  exit 1
}

$env:npm_config_cache = Join-Path $repoRoot ".npm-cache"

if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  & $npmCmd install
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Write-Host "Starting dev server on port $Port..." -ForegroundColor Green
& $npmCmd run dev -- -p $Port
exit $LASTEXITCODE

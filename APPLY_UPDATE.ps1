$ErrorActionPreference = "Stop"

$updateRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$defaultRepoRoot = Split-Path -Parent $updateRoot
$repoRoot = if ($args.Count -gt 0) { $args[0] } else { $defaultRepoRoot }
$requiredFilesPath = Join-Path $updateRoot "REQUIRED_FILES.txt"

if (!(Test-Path -LiteralPath $requiredFilesPath)) {
  throw "Missing REQUIRED_FILES.txt in update folder."
}

$requiredFiles = Get-Content -LiteralPath $requiredFilesPath | Where-Object { $_.Trim().Length -gt 0 }

foreach ($relativePath in $requiredFiles) {
  $sourcePath = Join-Path $updateRoot $relativePath

  if (!(Test-Path -LiteralPath $sourcePath)) {
    throw "Update package is incomplete. Missing: $relativePath"
  }
}

foreach ($relativePath in $requiredFiles) {
  $sourcePath = Join-Path $updateRoot $relativePath
  $targetPath = Join-Path $repoRoot $relativePath
  $targetDirectory = Split-Path -Parent $targetPath

  if (!(Test-Path -LiteralPath $targetDirectory)) {
    New-Item -ItemType Directory -Path $targetDirectory | Out-Null
  }

  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
  Write-Output "Copied $relativePath"
}

$daemonSource = Join-Path $repoRoot "scripts/agent-worker-daemon.ts"
if (!(Test-Path -LiteralPath $daemonSource)) {
  throw "Railway build would fail: scripts/agent-worker-daemon.ts is missing after copy."
}

Write-Output ""
Write-Output "Update applied."
Write-Output "Required Railway daemon source exists: scripts/agent-worker-daemon.ts"
Write-Output "Expected compiled daemon path after build: .agent-worker-dist/scripts/agent-worker-daemon.js"
Write-Output ""
Write-Output "Run these checks from the repository root:"
Write-Output "  npx tsc -p tsconfig.agent-worker.json"
Write-Output "  npm run agent:worker:dry-run"
Write-Output "  npm run test:agent-budget"
Write-Output "  npm run typecheck"
Write-Output "  npm run build"

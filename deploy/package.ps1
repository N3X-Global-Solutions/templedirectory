<#
.SYNOPSIS
  Builds a clean upload package for the server: runs the tests, then creates
  dist\temple-directory-<timestamp>.tar.gz without node_modules, data, .env or backups.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\package.ps1
#>
[CmdletBinding()]
param(
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$distDir = Join-Path $projectRoot 'dist'
$archive = Join-Path $distDir "temple-directory-$stamp.tar.gz"
$staging = Join-Path ([System.IO.Path]::GetTempPath()) "temple-package-$stamp"
$stageApp = Join-Path $staging 'temple-directory'

Push-Location $projectRoot
try {
  if (-not $SkipTests) {
    Write-Host '==> Running tests' -ForegroundColor Yellow
    npm test --silent
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed - package not created.' }
  }

  Write-Host '==> Checking shell scripts use Unix line endings' -ForegroundColor Yellow
  $crlf = Get-ChildItem -Path (Join-Path $projectRoot 'deploy\server') -Recurse -File |
    Where-Object { [System.IO.File]::ReadAllText($_.FullName).Contains("`r`n") }
  if ($crlf) { throw "These files have Windows (CRLF) line endings and would break on Linux: $($crlf.FullName -join ', ')" }

  Write-Host '==> Staging files' -ForegroundColor Yellow
  if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
  New-Item -ItemType Directory -Force -Path $stageApp | Out-Null
  robocopy $projectRoot $stageApp /E /NFL /NDL /NJH /NJS /NP `
    /XD node_modules data dist coverage .git .claude `
    /XF .env *.db *.db-wal *.db-shm *.log | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copying files failed (robocopy exit code $LASTEXITCODE)" }

  $leaked = Get-ChildItem -Path $stageApp -Recurse -Force -File |
    Where-Object { $_.Name -eq '.env' -or $_.Extension -in '.db', '.db-wal', '.db-shm' }
  if ($leaked) { throw "Refusing to package secrets or data: $($leaked.FullName -join ', ')" }

  Write-Host '==> Creating archive' -ForegroundColor Yellow
  New-Item -ItemType Directory -Force -Path $distDir | Out-Null
  tar -czf $archive -C $staging temple-directory
  if ($LASTEXITCODE -ne 0) { throw 'tar failed' }

  $sizeKb = [math]::Round((Get-Item $archive).Length / 1KB)
  Write-Host ''
  Write-Host "Package ready: $archive ($sizeKb KB)" -ForegroundColor Green
  Write-Host ''
  Write-Host 'Upload it to the server (replace the key path and IP):'
  Write-Host "  scp -i `$HOME\.ssh\oracle-temple `"$archive`" ubuntu@SERVER_IP:~"
  Write-Host 'Then follow deploy\README.md (Step 6 for a first install, "Updating" for a new version).'
}
finally {
  Pop-Location
  if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
}

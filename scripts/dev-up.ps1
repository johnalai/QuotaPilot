#!/usr/bin/env powershell
<#
.SYNOPSIS
  Bring up QuotaPilot's local dependencies in the right order, then start the app.

.DESCRIPTION
  Order matters. The omniroute gateway takes roughly two minutes to become ready,
  and Claude Code fails with ECONNREFUSED if it starts before the gateway accepts
  requests. This script brings everything up in sequence and waits for each piece
  to actually report healthy:

    1. Docker engine      (starts Docker Desktop if it is not running)
    2. Postgres           (docker compose service 'db', waits for healthy)
    3. omniroute gateway  (127.0.0.1:20128, waits for the health endpoint)
    4. pnpm dev           (foreground, unless -NoDev)

.PARAMETER NoDev
  Stop once the dependencies are healthy; do not start the dev server.

.PARAMETER GatewayTimeoutSeconds
  How long to wait for the gateway health endpoint. Default 300.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\dev-up.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\dev-up.ps1 -NoDev

.NOTES
  ASCII-only, no here-strings, CRLF on purpose: Windows PowerShell 5.1 mis-decodes
  UTF-8 punctuation in .ps1 files and does not terminate here-strings reliably in
  LF-only files.
#>
[CmdletBinding()]
param(
  [string]$RepoPath = (Split-Path -Parent $PSScriptRoot),
  [int]$GatewayTimeoutSeconds = 300,
  [switch]$NoDev
)

$ErrorActionPreference = 'Continue'

function Step([string]$Text) {
  Write-Host ''
  Write-Host "== $Text" -ForegroundColor Cyan
}

function Wait-For([string]$What, [int]$TimeoutSeconds, [scriptblock]$Test) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Test) { return $true }
    Start-Sleep -Seconds 5
  }
  return $false
}

function Test-PortListening([int]$Port) {
  $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$c
}

Set-Location -LiteralPath $RepoPath
Write-Host "repo: $RepoPath"

# --- 1. Docker engine ------------------------------------------------------
Step '1/4 Docker engine'
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host '  not running - starting Docker Desktop...'
  $desktop = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (-not (Test-Path -LiteralPath $desktop)) {
    throw "Docker Desktop not found at $desktop - start it manually."
  }
  Start-Process -FilePath $desktop | Out-Null

  $ready = Wait-For 'docker engine' 240 { docker info 2>&1 | Out-Null; return ($LASTEXITCODE -eq 0) }
  if (-not $ready) { throw 'Docker engine did not come up within 240s.' }
}
Write-Host '  engine up.' -ForegroundColor Green

# --- 2. Postgres -----------------------------------------------------------
Step '2/4 Postgres'
docker compose up -d db 2>&1 | Out-Null
$healthy = Wait-For 'postgres' 120 {
  return ((docker inspect --format '{{.State.Health.Status}}' quotapilot-db 2>$null) -eq 'healthy')
}
if (-not $healthy) { throw 'Postgres container did not become healthy.' }
Write-Host '  quotapilot-db healthy on 127.0.0.1:5432.' -ForegroundColor Green

# --- 3. omniroute gateway --------------------------------------------------
Step '3/4 model gateway (omniroute on 127.0.0.1:20128)'
$healthUrl = 'http://127.0.0.1:20128/api/monitoring/health'

if (Test-PortListening 20128) {
  Write-Host '  already listening - waiting for health instead of restarting.'
} else {
  $omniroute = "$env:APPDATA\npm\omniroute.cmd"
  if (-not (Test-Path -LiteralPath $omniroute)) {
    throw "omniroute not found at $omniroute (npm i -g omniroute)."
  }
  Write-Host '  starting - this takes about 2 minutes...'
  Start-Process -FilePath $omniroute -ArgumentList 'serve' -WindowStyle Minimized | Out-Null
}

$gatewayUp = Wait-For 'gateway health' $GatewayTimeoutSeconds {
  try {
    $r = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    return ($r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (-not $gatewayUp) {
  throw "Gateway did not report healthy within $GatewayTimeoutSeconds s. Check the omniroute window, or run 'omniroute doctor'."
}
Write-Host '  gateway healthy - Claude Code will reach it.' -ForegroundColor Green

# --- 4. dev server ---------------------------------------------------------
if ($NoDev) {
  Step '4/4 skipped (-NoDev)'
  Write-Host '  dependencies are up.' -ForegroundColor Green
  exit 0
}

Step '4/4 dev server (Ctrl+C to stop)'
pnpm dev

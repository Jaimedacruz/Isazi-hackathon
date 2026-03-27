Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSCommandPath
$localRoot = Join-Path $env:LOCALAPPDATA "OpenClawSecure"
$stdout = Join-Path $localRoot "gateway.stdout.log"
$stderr = Join-Path $localRoot "gateway.stderr.log"

$existing = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -like "*openclaw.mjs gateway run*" -and
    $_.CommandLine -like "*node-v24.14.1-win-x64*"
  }
if ($existing) {
  Write-Output "Gateway already running: $($existing.ProcessId -join ', ')"
  exit 0
}

Start-Process `
  -FilePath "powershell" `
  -ArgumentList "-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "run-openclaw.ps1"), "gateway", "run" `
  -WorkingDirectory $root `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -WindowStyle Hidden | Out-Null

Write-Output "Gateway start requested. Logs: $stdout"

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$procs = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -like "*openclaw.mjs gateway run*" -and
    $_.CommandLine -like "*node-v24.14.1-win-x64*"
  }

if (-not $procs) {
  Write-Output "Gateway not running."
  exit 0
}

$procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Output "Stopped gateway PID(s): $($procs.ProcessId -join ', ')"

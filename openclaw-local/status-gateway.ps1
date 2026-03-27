Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSCommandPath
powershell -ExecutionPolicy Bypass -File (Join-Path $root "run-openclaw.ps1") gateway status --require-rpc

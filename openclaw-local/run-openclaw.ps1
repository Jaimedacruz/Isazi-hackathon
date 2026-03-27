Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSCommandPath
$localRoot = Join-Path $env:LOCALAPPDATA "OpenClawSecure"
$envFile = Join-Path $localRoot ".env"

$scrubVars = @(
  "OPENAI_API_KEY",
  "OPENAI_API_KEYS",
  "OPENAI_API_KEY_1",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_API_KEYS",
  "ANTHROPIC_API_KEY_1",
  "GEMINI_API_KEY",
  "GEMINI_API_KEYS",
  "GEMINI_API_KEY_1",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENCLAW_LIVE_OPENAI_KEY",
  "OPENCLAW_LIVE_ANTHROPIC_KEY",
  "OPENCLAW_LIVE_GEMINI_KEY",
  "ZAI_API_KEY",
  "AI_GATEWAY_API_KEY",
  "MINIMAX_API_KEY",
  "SYNTHETIC_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "DISCORD_BOT_TOKEN",
  "SLACK_BOT_TOKEN",
  "SLACK_APP_TOKEN",
  "MATTERMOST_BOT_TOKEN",
  "MATTERMOST_URL",
  "ZALO_BOT_TOKEN",
  "OPENCLAW_TWITCH_ACCESS_TOKEN",
  "BRAVE_API_KEY",
  "PERPLEXITY_API_KEY",
  "FIRECRAWL_API_KEY",
  "ELEVENLABS_API_KEY",
  "XI_API_KEY",
  "DEEPGRAM_API_KEY",
  "OPENCLAW_GATEWAY_TOKEN",
  "OPENCLAW_GATEWAY_PASSWORD"
)
foreach ($name in $scrubVars) {
  [Environment]::SetEnvironmentVariable($name, $null, "Process")
}

if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
      continue
    }
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
      [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
    }
  }
}

$env:OPENCLAW_STATE_DIR = Join-Path $localRoot "state"
$env:OPENCLAW_CONFIG_PATH = Join-Path $env:OPENCLAW_STATE_DIR "openclaw.json"
$env:OPENCLAW_HOME = $localRoot

$node = Join-Path $root "runtime\\node-v24.14.1-win-x64\\node.exe"
$entry = Join-Path $env:APPDATA "npm\\node_modules\\openclaw\\openclaw.mjs"

if (-not (Test-Path $node)) {
  throw "Portable Node 24 runtime not found at $node"
}
if (-not (Test-Path $entry)) {
  throw "OpenClaw CLI entrypoint not found at $entry"
}

& $node $entry @args

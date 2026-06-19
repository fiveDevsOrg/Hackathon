# Nudge OS launcher — loads your Anthropic key from the canonical .env and
# starts the guide. Usage:  powershell -ExecutionPolicy Bypass -File run.ps1
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

if (-not $env:ANTHROPIC_API_KEY) {
  $envfile = "C:\Users\adibi\Obsidian\Brain\AIAS\_secrets\.env"
  if (Test-Path $envfile) {
    $line = (Select-String -Path $envfile -Pattern '^ANTHROPIC_API_KEY=' | Select-Object -First 1)
    if ($line) {
      $val = ($line.Line -replace '^ANTHROPIC_API_KEY=', '').Trim().Trim('"').Trim("'")
      if ($val) { $env:ANTHROPIC_API_KEY = $val }
    }
  }
}
if (-not $env:ANTHROPIC_API_KEY) {
  Write-Host "[Nudge] No ANTHROPIC_API_KEY found - the AI brain will use the local heuristic." -ForegroundColor Yellow
} else {
  Write-Host "[Nudge] AI brain ready." -ForegroundColor Green
}

& ".\.venv\Scripts\python.exe" "nudge_desktop.py"

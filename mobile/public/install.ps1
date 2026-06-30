<#
.SYNOPSIS
  One-line bootstrap installer for Helm (Windows / PowerShell).

.DESCRIPTION
  Downloads the prebuilt Helm Copilot CLI extension and drops it where
  `gh copilot` auto-discovers it (~/.copilot/extensions/helm), wired to the
  hosted relay so there is zero config. No git clone, no Node build.

  Designed to be run with:
    irm https://usehelm.netlify.app/install.ps1 | iex

  With arguments (run-your-own-relay):
    & ([scriptblock]::Create((irm https://usehelm.netlify.app/install.ps1))) -SupabaseUrl https://xxx.supabase.co -SupabaseKey sb_publishable_xxx

.PARAMETER InstallDir
  Where to install the extension. Default: ~/.copilot/extensions/helm

.PARAMETER SupabaseUrl
  Override the relay Supabase URL (to run your own relay).

.PARAMETER SupabaseKey
  Override the relay publishable (anon) key.

.PARAMETER Force
  Overwrite an existing .env even if one is already present.
#>
[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:USERPROFILE '.copilot\extensions\helm'),
    [string]$SupabaseUrl = 'https://jqzohxjouzxzawqqlifv.supabase.co',
    [string]$SupabaseKey = 'sb_publishable_Rf_bymYhJk9fF2Op4xKT0w_eaWLiyCY',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$base = 'https://usehelm.netlify.app'

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }

Step 'Installing Helm extension'
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Invoke-WebRequest -Uri "$base/extension.mjs" -OutFile (Join-Path $InstallDir 'extension.mjs') -UseBasicParsing
Ok "extension.mjs -> $InstallDir"

$envPath = Join-Path $InstallDir '.env'
if ((Test-Path $envPath) -and -not $Force) {
    Ok 'kept your existing .env (use -Force to overwrite)'
} else {
@"
# Helm relay config. The publishable key is client-safe by design; the channel is
# guarded by Supabase RLS + end-to-end AES-256-GCM. To run your own relay, swap these
# for your own Supabase project's URL + publishable key.
HELM_TRANSPORT=supabase
SUPABASE_URL=$SupabaseUrl
SUPABASE_ANON_KEY=$SupabaseKey
HELM_APPROVAL_TIMEOUT_MS=120000
"@ | Set-Content -Path $envPath -Encoding utf8
    Ok "wrote relay config -> $envPath"
}

Step 'Done'
Write-Host '  1. Start Copilot CLI in any repo (run /helm-pair to re-show the QR).'
Write-Host '  2. Open https://usehelm.netlify.app on your phone and scan the QR.'
Write-Host '  3. Trigger a Copilot action and approve / deny from your phone.'
Write-Host ""
Write-Host "Uninstall: Remove-Item -Recurse -Force `"$InstallDir`"" -ForegroundColor DarkGray

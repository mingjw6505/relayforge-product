[CmdletBinding()]
param(
    [string]$ProjectDir,
    [string]$SessionDir,
    [Alias('Host')][string]$BindHost = '127.0.0.1',
    [string]$UrlHost,
    [ValidateRange(1, 525600)][int]$IdleTimeoutMinutes = 240,
    [switch]$Open,
    [switch]$Foreground,
    [switch]$NewSession
)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required. Use the self-contained static HTML fallback instead.'
}
$launcher = Join-Path $PSScriptRoot 'companion.cjs'
$launcherArgs = @('start', '--host', $BindHost, '--idle-timeout-minutes', [string]$IdleTimeoutMinutes)
if ($ProjectDir) { $launcherArgs += @('--project-dir', $ProjectDir) }
if ($SessionDir) { $launcherArgs += @('--session-dir', $SessionDir) }
if ($UrlHost) { $launcherArgs += @('--url-host', $UrlHost) }
if ($Open) { $launcherArgs += '--open' }
if ($Foreground) { $launcherArgs += '--foreground' } else { $launcherArgs += '--background' }
if ($NewSession) { $launcherArgs += '--new-session' }
& node $launcher @launcherArgs
exit $LASTEXITCODE

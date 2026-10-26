[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SessionDir
)

$ErrorActionPreference = 'Stop'
$resolvedSession = [System.IO.Path]::GetFullPath($SessionDir)
$stateDir = Join-Path $resolvedSession 'state'
$pidFile = Join-Path $stateDir 'server.pid'
$serverIdFile = Join-Path $stateDir 'server-instance-id'
$infoFile = Join-Path $stateDir 'server-info'
$stoppedFile = Join-Path $stateDir 'server-stopped'

function Write-Stopped([string]$Reason) {
    Remove-Item -LiteralPath $infoFile -Force -ErrorAction SilentlyContinue
    $record = @{ reason = $Reason; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($stoppedFile, "$record`n", [System.Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
    @{ status = 'not_running' } | ConvertTo-Json -Compress
    exit 0
}

$rawPid = (Get-Content -LiteralPath $pidFile -Raw).Trim()
$rawServerId = if (Test-Path -LiteralPath $serverIdFile -PathType Leaf) {
    (Get-Content -LiteralPath $serverIdFile -Raw).Trim()
} else { '' }

$parsedPid = 0
$validPid = [int]::TryParse($rawPid, [ref]$parsedPid)
$validId = $rawServerId -match '^[A-Za-z0-9_-]{32,64}$'
$processInfo = if ($validPid) {
    Get-CimInstance Win32_Process -Filter "ProcessId = $parsedPid" -ErrorAction SilentlyContinue
} else { $null }
$expectedArgument = "--brainstorm-server-id=$rawServerId"
$isExpectedServer = $processInfo -and $validId -and $processInfo.CommandLine -and $processInfo.CommandLine.Contains($expectedArgument)

if (-not $isExpectedServer) {
    Remove-Item -LiteralPath $pidFile, $serverIdFile -Force -ErrorAction SilentlyContinue
    Write-Stopped 'stale_pid'
    @{ status = 'stale_pid' } | ConvertTo-Json -Compress
    exit 0
}

Stop-Process -Id $parsedPid -ErrorAction SilentlyContinue
$deadline = [DateTime]::UtcNow.AddSeconds(2)
while ([DateTime]::UtcNow -lt $deadline -and (Get-Process -Id $parsedPid -ErrorAction SilentlyContinue)) {
    Start-Sleep -Milliseconds 100
}
if (Get-Process -Id $parsedPid -ErrorAction SilentlyContinue) {
    Stop-Process -Id $parsedPid -Force
}
if (Get-Process -Id $parsedPid -ErrorAction SilentlyContinue) {
    throw 'Visual companion process is still running.'
}

Remove-Item -LiteralPath $pidFile, $serverIdFile -Force -ErrorAction SilentlyContinue
Write-Stopped 'stop-server.ps1'
@{ status = 'stopped' } | ConvertTo-Json -Compress

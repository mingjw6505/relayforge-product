[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectDir,

    [Alias('Host')]
    [string]$BindHost = '127.0.0.1',

    [string]$UrlHost,

    [ValidateRange(1, 525600)]
    [int]$IdleTimeoutMinutes = 240,

    [switch]$Open,

    [switch]$Foreground
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverScript = Join-Path $scriptDir 'server.cjs'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw 'Node.js is required for the interactive visual companion. Use the static HTML fallback instead.'
}
if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
    throw "Visual companion server was not found: $serverScript"
}

$resolvedProject = [System.IO.Path]::GetFullPath($ProjectDir)
if (-not (Test-Path -LiteralPath $resolvedProject -PathType Container)) {
    throw "Project directory does not exist: $resolvedProject"
}
if (-not $UrlHost) {
    $UrlHost = if ($BindHost -in @('127.0.0.1', 'localhost')) { 'localhost' } else { $BindHost }
}

$unixSeconds = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$sessionId = "$PID-$unixSeconds"
$brainstormRoot = Join-Path $resolvedProject '.relayforge\brainstorm'
$sessionDir = Join-Path $brainstormRoot $sessionId
$contentDir = Join-Path $sessionDir 'content'
$stateDir = Join-Path $sessionDir 'state'
New-Item -ItemType Directory -Path $contentDir, $stateDir -Force | Out-Null

$random = [byte[]]::new(24)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($random)
$serverId = -join ($random | ForEach-Object { $_.ToString('x2') })
$serverIdFile = Join-Path $stateDir 'server-instance-id'
[System.IO.File]::WriteAllText($serverIdFile, "$serverId`n", [System.Text.UTF8Encoding]::new($false))

$portFile = Join-Path $brainstormRoot '.last-port'
$tokenFile = Join-Path $brainstormRoot '.last-token'
$pidFile = Join-Path $stateDir 'server.pid'
$logFile = Join-Path $stateDir 'server.log'
$errorLog = Join-Path $stateDir 'server-error.log'
$infoFile = Join-Path $stateDir 'server-info'

$environment = @{
    BRAINSTORM_DIR = $sessionDir
    BRAINSTORM_HOST = $BindHost
    BRAINSTORM_URL_HOST = $UrlHost
    BRAINSTORM_OWNER_PID = ''
    BRAINSTORM_PORT_FILE = $portFile
    BRAINSTORM_TOKEN_FILE = $tokenFile
    BRAINSTORM_IDLE_TIMEOUT_MS = [string]($IdleTimeoutMinutes * 60 * 1000)
    BRAINSTORM_OPEN = if ($Open) { '1' } else { $null }
}

$previous = @{}
foreach ($entry in $environment.GetEnumerator()) {
    $previous[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
}

try {
    # Start-Process joins ArgumentList entries; quote the script path explicitly
    # so plugin installation directories containing spaces remain executable.
    $quotedServerScript = '"' + $serverScript + '"'
    $arguments = @($quotedServerScript, "--brainstorm-server-id=$serverId")
    if ($Foreground) {
        $process = Start-Process -FilePath $nodeCommand.Source -ArgumentList $arguments -NoNewWindow -PassThru
        [System.IO.File]::WriteAllText($pidFile, [string]$process.Id, [System.Text.UTF8Encoding]::new($false))
        $process.WaitForExit()
        exit $process.ExitCode
    }

    $process = Start-Process -FilePath $nodeCommand.Source -ArgumentList $arguments -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $logFile -RedirectStandardError $errorLog
    [System.IO.File]::WriteAllText($pidFile, [string]$process.Id, [System.Text.UTF8Encoding]::new($false))
} finally {
    foreach ($entry in $previous.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
}

$deadline = [DateTime]::UtcNow.AddSeconds(7)
while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-Path -LiteralPath $infoFile -PathType Leaf) {
        Start-Sleep -Milliseconds 300
        if ($process.HasExited) {
            throw "Visual companion exited after startup. See $errorLog"
        }
        Get-Content -LiteralPath $infoFile -Raw
        exit 0
    }
    if ($process.HasExited) {
        $details = if (Test-Path -LiteralPath $errorLog) { Get-Content -LiteralPath $errorLog -Raw } else { '' }
        throw "Visual companion failed to start. $details"
    }
    Start-Sleep -Milliseconds 100
}

Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
throw "Visual companion did not become ready within 7 seconds. See $errorLog"

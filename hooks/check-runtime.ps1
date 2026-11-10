param([ValidateSet('Hook', 'Json')][string]$Format = 'Hook')

# Windows PowerShell 5.1 and PowerShell 7; no Python/Node dependency to run.
# ASCII source and explicit UTF-8 resources keep Windows PowerShell 5.1 safe.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Invoke-RuntimeProbe([string]$Name, [string]$Arguments) {
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) { return @{ Status = 'missing'; Output = '' } }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $command.Source
    $info.Arguments = $Arguments
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.EnvironmentVariables['PYTHON_MANAGER_AUTOMATIC_INSTALL'] = 'false'
    $info.EnvironmentVariables['PYTHONDONTWRITEBYTECODE'] = '1'
    $info.EnvironmentVariables.Remove('PYLAUNCHER_ALLOW_INSTALL')
    $info.EnvironmentVariables.Remove('PYLAUNCHER_ALWAYS_INSTALL')
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(2000)) {
            try { $process.Kill() } catch {}
            return @{ Status = 'probe_failed'; Output = '' }
        }
        # Do not await inherited pipes indefinitely if a launcher spawned children.
        if (-not $stdout.Wait(500) -or -not $stderr.Wait(500) -or $process.ExitCode -ne 0) {
            return @{ Status = 'probe_failed'; Output = '' }
        }
        $output = $stdout.Result.Trim()
        if ($output.Length -gt 4096) { return @{ Status = 'probe_failed'; Output = '' } }
        return @{ Status = 'ok'; Output = $output }
    } catch {
        return @{ Status = 'probe_failed'; Output = '' }
    } finally {
        $process.Dispose()
    }
}

function Get-NativeRuntimeStatus {
    $node = Invoke-RuntimeProbe 'node' '--version'
    $nodeStatus = $node.Status
    if ($nodeStatus -eq 'ok') {
        if ($node.Output -match '^v([0-9]{1,6})\.[0-9]+\.[0-9]+$') {
            if ([int]$Matches[1] -ge 18) { $nodeStatus = 'ready' } else { $nodeStatus = 'unsupported' }
        } else { $nodeStatus = 'probe_failed' }
    }
    $pythonStatus = 'missing'
    $statuses = @()
    # Only run this fixed probe when an interpreter was found. Absence needs no Python.
    $probeFile = Join-Path $PSScriptRoot 'python-probe.py'
    foreach ($candidate in @(@('python', ''), @('python3', ''), @('py', '-3 '))) {
        $result = Invoke-RuntimeProbe $candidate[0] ($candidate[1] + '"' + $probeFile + '"')
        $status = $result.Status
        if ($status -eq 'ok') {
            if ($result.Output -in @('ready', 'unsupported', 'sqlite_unavailable')) { $status = $result.Output }
            else { $status = 'probe_failed' }
        }
        $statuses += $status
        if ($status -eq 'ready') { $pythonStatus = 'ready'; break }
    }
    if ($pythonStatus -ne 'ready') {
        if ($statuses -contains 'probe_failed') { $pythonStatus = 'probe_failed' }
        elseif ($statuses -contains 'sqlite_unavailable') { $pythonStatus = 'sqlite_unavailable' }
        elseif ($statuses -contains 'unsupported') { $pythonStatus = 'unsupported' }
    }
    return @{ node = $nodeStatus; python = $pythonStatus; source = 'native_startup'; host_ui = 'unverified' }
}

function Write-NativeRuntimeReport([string]$OutputFormat) {
    $report = Get-NativeRuntimeStatus
    if ($OutputFormat -eq 'Json') { $report | ConvertTo-Json -Compress; return }
    $context = 'RelayForge Product native startup preflight: Node.js=' + $report.node + '; Python=' + $report.python + '. '
    $context += 'This check ran without requiring either runtime. Minimums: Node.js 18+, Python 3.11+ with sqlite3. '
    $context += 'When RelayForge Product is used, explain any missing/unsupported runtime and present a concrete official installation plan before asking the user to choose assisted installation, manual instructions, or continuing without installation. '
    $context += 'probe_failed is uncertain, not proof of absence: diagnose before prescribing installation. Reuse any prior decline and do not repeat installation questions. Never install automatically or treat silence as consent. '
    $context += 'Do not create product requirements for setup. For unrelated work do not ask installation questions. Runtime readiness does not prove that MCP tools loaded or UI rendered.'
    $output = @{ hookSpecificOutput = @{ hookEventName = 'SessionStart'; additionalContext = $context } }
    if ($report.node -ne 'ready' -or $report.python -ne 'ready') {
        $notice = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'runtime-notice.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
        $output.systemMessage = 'Node.js=' + $report.node + '; Python=' + $report.python + '. ' + $notice
    }
    $output | ConvertTo-Json -Depth 4 -Compress
}

if ($MyInvocation.InvocationName -ne '.') { Write-NativeRuntimeReport $Format }

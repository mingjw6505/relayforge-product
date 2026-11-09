[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$SessionDir)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
# Authenticated shutdown works without CIM access or PID-based termination.
& node (Join-Path $PSScriptRoot 'companion.cjs') stop --session-dir $SessionDir
exit $LASTEXITCODE

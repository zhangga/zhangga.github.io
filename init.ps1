[CmdletBinding()]
param(
    [switch]$SkipServer
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RequiredCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "Required command '$Name' was not found. Install it and add it to PATH."
    }

    return $command.Source
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host "> $FilePath $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

$repositoryRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$originalLocation = Get-Location

try {
    Set-Location -LiteralPath $repositoryRoot

    $git = Get-RequiredCommand -Name 'git.exe'
    $node = Get-RequiredCommand -Name 'node.exe'
    $npm = Get-RequiredCommand -Name 'npm.cmd'

    $gitTopLevel = (& $git rev-parse --show-toplevel 2>$null).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'This script must be run from a Git working tree.'
    }

    $gitTopLevel = [System.IO.Path]::GetFullPath($gitTopLevel)
    if (-not $gitTopLevel.Equals($repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "The script location is not the Git repository root: $repositoryRoot"
    }

    $currentBranch = (& $git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to determine the current Git branch.'
    }

    if ($currentBranch -ne 'source') {
        throw "Current branch is '$currentBranch'. Run 'git switch source' first."
    }

    if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot 'package-lock.json'))) {
        throw 'package-lock.json is missing; deterministic npm installation is unavailable.'
    }

    $nodeVersion = (& $node --version).Trim()
    $npmVersion = (& $npm --version).Trim()
    Write-Host "Repository: $repositoryRoot"
    Write-Host "Branch:     $currentBranch"
    Write-Host "Node:       $nodeVersion"
    Write-Host "npm:        $npmVersion"

    Write-Host "`n[1/3] Initializing Git submodules..." -ForegroundColor Cyan
    Invoke-CheckedCommand -FilePath $git -Arguments @('submodule', 'sync', '--recursive')
    Invoke-CheckedCommand -FilePath $git -Arguments @('submodule', 'update', '--init', '--recursive')

    Write-Host "`n[2/3] Installing npm dependencies..." -ForegroundColor Cyan
    Invoke-CheckedCommand -FilePath $npm -Arguments @('ci')

    Write-Host "`n[3/3] Verifying the Hexo build..." -ForegroundColor Cyan
    Invoke-CheckedCommand -FilePath $npm -Arguments @('run', 'build')

    Write-Host "`nInitialization completed successfully." -ForegroundColor Green

    if ($SkipServer) {
        Write-Host "Run 'npm run server' when you are ready to start Hexo."
    }
    else {
        Write-Host "Starting Hexo at http://localhost:4000/ (press Ctrl+C to stop)..."
        Invoke-CheckedCommand -FilePath $npm -Arguments @('run', 'server')
    }
}
catch {
    Write-Error $_
    exit 1
}
finally {
    Set-Location -LiteralPath $originalLocation
}

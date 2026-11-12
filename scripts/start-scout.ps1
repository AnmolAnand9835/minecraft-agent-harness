$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot 'examples\scout.json'
$envPath = Join-Path $repoRoot '.env'
$config = Get-Content $configPath -Raw | ConvertFrom-Json

if (-not (Test-Path $configPath)) {
    throw "Scout config not found: $configPath"
}
if (-not (Test-Path $envPath)) {
    throw "Copy .env.example to .env and set your Aternos address/port first."
}

# Read simple KEY=VALUE entries without evaluating .env as PowerShell code.
foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
        continue
    }
    $key = $Matches[1]
    $value = $Matches[2]
    if ($value.Length -ge 2 -and
        (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    $currentValue = [Environment]::GetEnvironmentVariable($key, 'Process')
    if ([string]::IsNullOrEmpty($currentValue)) {
        [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw 'Node.js 22.19 or newer is required. Install a supported Node.js LTS release, then reopen PowerShell.'
}
$nodeVersionText = (& node --version).Trim().TrimStart('v')
if ([version]$nodeVersionText -lt [version]'22.19.0') {
    throw "Node.js 22.19 or newer is required; found $nodeVersionText."
}
if (-not (Test-Path (Join-Path $repoRoot 'node_modules\@earendil-works\pi-ai'))) {
    throw "Dependencies are missing. From $repoRoot run: npm ci"
}

$modelRef = if ($env:AGENT_MODEL) { $env:AGENT_MODEL.Trim() } else { $config.model }
if ($modelRef -notmatch '^google/') {
    throw "Scout is configured for Gemini. Set AGENT_MODEL=google/gemini-2.5-flash in .env or update examples\scout.json."
}
if ([string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY)) {
    throw 'Set GEMINI_API_KEY in .env. Keep the key private; do not paste it into chat or commit it.'
}

$modelCheck = @'
import { readConfigFile, resolveConfig, fromEnv } from './src/config.js';
import { checkModel } from './src/startup.js';
const config = resolveConfig(
  [readConfigFile('examples/scout.json'), fromEnv(process.env)],
  { cwd: process.cwd(), env: process.env, probeDocker: () => false },
);
const problem = await checkModel(config);
if (problem) throw new Error(problem);
if (config.model.provider !== 'google') throw new Error('Scout must use the Google Gemini provider.');
console.log(`Gemini model configuration passed for ${config.model.id}.`);
'@
Push-Location $repoRoot
try {
    & node --input-type=module -e $modelCheck
    if ($LASTEXITCODE -ne 0) {
        throw 'Gemini model configuration check failed. Verify GEMINI_API_KEY and AGENT_MODEL in .env.'
    }
} finally {
    Pop-Location
}

$serverHost = if ($env:MC_HOST) { $env:MC_HOST } else { $config.host }
$serverPort = if ($env:MC_PORT) { [int]$env:MC_PORT } else { [int]$config.port }
if ([string]::IsNullOrWhiteSpace($serverHost) -or $serverHost -match '^(REPLACE_|your[-_])') {
    throw 'Set MC_HOST in .env to the exact Aternos address shown on your server page.'
}
if ($serverPort -lt 1 -or $serverPort -gt 65535) {
    throw "MC_PORT must be between 1 and 65535; found $serverPort."
}

Write-Host "Waiting for the manually started Minecraft server at ${serverHost}:$serverPort (up to 10 minutes)."
Write-Host 'This only checks reachability; it does not start the Aternos server or bypass its queue/policies.'
$timer = [System.Diagnostics.Stopwatch]::StartNew()
$lastNotice = 0
$serverReady = $false
while ($timer.Elapsed.TotalSeconds -lt 600) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $client.BeginConnect($serverHost, $serverPort, $null, $null)
        if ($connect.AsyncWaitHandle.WaitOne(2500, $false)) {
            $client.EndConnect($connect)
            if ($client.Connected) {
                $serverReady = $true
                break
            }
        }
    } catch {
        # Aternos can still be starting; keep retrying until the bounded wait expires.
    } finally {
        $client.Close()
    }
    if ([int]$timer.Elapsed.TotalSeconds -ge $lastNotice + 30) {
        Write-Host "Still waiting for ${serverHost}:$serverPort..."
        $lastNotice = [int]$timer.Elapsed.TotalSeconds
    }
    Start-Sleep -Seconds 5
}
if (-not $serverReady) {
    throw "Minecraft did not become reachable at ${serverHost}:$serverPort within 10 minutes. Confirm Aternos shows the server as online and verify its current address and port."
}

Push-Location $repoRoot
try {
    npm start -- --config examples/scout.json
    $agentExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $agentExitCode

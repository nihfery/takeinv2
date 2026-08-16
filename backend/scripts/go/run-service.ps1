[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet(
        'identity-service',
        'customer-service',
        'provider-service',
        'catalog-service',
        'booking-service',
        'payment-service',
        'billing-service',
        'notification-service',
        'chat-service',
        'media-service',
        'audit-service'
    )]
    [string]$Service,

    [ValidateSet('api', 'worker')]
    [string]$Component = 'api'
)

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$serviceDirectory = Join-Path $repoRoot (Join-Path 'services' $Service)
$envFile = Join-Path $serviceDirectory '.env'

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "Missing $envFile. Copy the service .env.example to .env first."
}

foreach ($rawLine in Get-Content -LiteralPath $envFile) {
    $line = $rawLine.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith('#')) {
        continue
    }

    $separator = $line.IndexOf('=')
    if ($separator -le 0) {
        throw "Invalid environment entry in ${envFile}: $rawLine"
    }

    $name = $line.Substring(0, $separator).Trim()
    if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw "Invalid environment variable name in ${envFile}: $name"
    }

    $value = $line.Substring($separator + 1).Trim()
    if ($value.Length -ge 2) {
        $first = $value[0]
        $last = $value[$value.Length - 1]
        if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
            $value = $value.Substring(1, $value.Length - 2)
        }
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

$runtimeName = if ($Component -eq 'worker') { "$Service-worker" } else { $Service }
[Environment]::SetEnvironmentVariable('SERVICE_NAME', $runtimeName, 'Process')

Push-Location $serviceDirectory
try {
    & go run ".\cmd\$Component"
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

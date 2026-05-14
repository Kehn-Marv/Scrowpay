<#
.SYNOPSIS
    Grants admin privileges to a ScrowPay user.

.DESCRIPTION
    Flips users.is_admin = 1 for the given phone number in your Turso
    database. Reads TURSO_DATABASE_URL + TURSO_AUTH_TOKEN from the
    project's .env file so you never have to paste credentials.

    If you change Turso databases (new URL / new token), just update
    .env and re-run the script.

.PARAMETER PhoneNumber
    The phone number of the user to promote, in E.164 format
    (e.g. +2348012345678). Optional - falls back to $DEFAULT_PHONE
    below.

.PARAMETER EnvFile
    Path to the .env file. Defaults to ../.env relative to the script.

.PARAMETER UserId
    Numeric users.id of the user to promote. Bypasses phone matching
    entirely - useful when the stored phone has hidden whitespace or
    encoding differences that defeat exact equality.

.EXAMPLE
    .\make-admin.ps1 -PhoneNumber "+2348012345678"

.EXAMPLE
    .\make-admin.ps1 -UserId 1
    # Most reliable - promotes by primary key.

.EXAMPLE
    .\make-admin.ps1
    # uses $DEFAULT_PHONE

.NOTES
    - PowerShell 5.1+ (built into Windows 10/11).
    - Talks to Turso's HTTP /v2/pipeline endpoint.
    - Pure ASCII output - no Unicode arrows or box-drawing chars,
      so it renders cleanly in any console.
#>

[CmdletBinding()]
param(
    [string]$PhoneNumber = '',
    [string]$EnvFile     = (Join-Path $PSScriptRoot '..\.env'),
    [int]   $UserId      = 0
)

# =====================================================================
# EDIT THIS if you prefer not to pass -PhoneNumber on the CLI
# =====================================================================
$DEFAULT_PHONE = '+2348127704927'
# =====================================================================

$ErrorActionPreference = 'Stop'

function Write-Header($text) {
    Write-Host ''
    Write-Host '======================================================='
    Write-Host "  $text"
    Write-Host '======================================================='
}

function Read-DotEnv {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Cannot find .env file at: $Path"
    }

    $envMap = @{}

    # Read with explicit UTF-8 to handle BOM correctly
    $lines = Get-Content -Path $Path -Encoding UTF8

    foreach ($raw in $lines) {
        if ($null -eq $raw) { continue }

        # Strip a UTF-8 BOM if it leaked in (zero-width no-break space)
        $line = $raw -replace "^\uFEFF", ''
        $line = $line.Trim()

        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line.StartsWith('#'))               { continue }

        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { continue }

        $key   = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()

        # Strip any inline comment ( ... # comment) that wasn't quoted
        # Only do this if the # is preceded by whitespace, so URLs
        # containing # in fragments are safe.
        if ($value -match '^\s*([^"''#].*?)\s+#') {
            $value = $matches[1].Trim()
        }

        # Strip surrounding quotes if present
        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last  = $value.Substring($value.Length - 1, 1)
            if (($first -eq '"' -and $last -eq '"') -or
                ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        # Strip any stray CR
        $value = $value -replace "`r", ''

        $envMap[$key] = $value
    }

    return $envMap
}

function Convert-LibsqlToHttps {
    param([string]$Url)
    if ([string]::IsNullOrWhiteSpace($Url)) { return $Url }
    $u = $Url.Trim()
    if ($u.StartsWith('libsql://')) {
        return 'https://' + $u.Substring('libsql://'.Length)
    }
    return $u
}

function Invoke-TursoSql {
    param(
        [string]$BaseUrl,
        [string]$Token,
        [string]$Sql,
        [array] $SqlArgs = @()
    )

    $endpoint = "$BaseUrl/v2/pipeline"

    # Build typed args. Integers must be sent as type='integer'; everything
    # else as text. IMPORTANT: must be a generic List[object], not a plain
    # PowerShell array, otherwise PS 5.1's ConvertTo-Json serializes a
    # single-element array as a bare object (no '[]') and Turso then binds
    # zero parameters - silently returning 0 rows.
    $stmtArgs = New-Object 'System.Collections.Generic.List[object]'
    foreach ($a in $SqlArgs) {
        if ($a -is [int] -or $a -is [long] -or $a -is [int16] -or $a -is [int64]) {
            [void]$stmtArgs.Add(@{ type = 'integer'; value = [string]$a })
        } else {
            [void]$stmtArgs.Add(@{ type = 'text'; value = [string]$a })
        }
    }

    # Build the args JSON manually so we are 100% sure single-element
    # arrays serialize as JSON arrays (PS 5.1's ConvertTo-Json unwraps
    # single-element arrays in property positions, even for List[object]).
    $argParts = @()
    foreach ($entry in $stmtArgs) {
        $t = $entry.type
        $v = $entry.value -replace '\\', '\\' -replace '"', '\"'
        $argParts += ('{{"type":"{0}","value":"{1}"}}' -f $t, $v)
    }
    $argsJson = '[' + ($argParts -join ',') + ']'

    # Escape SQL for embedding in JSON
    $sqlEscaped = $Sql -replace '\\', '\\' -replace '"', '\"'

    $body = '{"requests":[{"type":"execute","stmt":{"sql":"' + $sqlEscaped + '","args":' + $argsJson + '}},{"type":"close"}]}'

    if ($env:MAKE_ADMIN_DEBUG -eq '1') {
        Write-Host ''
        Write-Host '----- request body -----'
        Write-Host $body
        Write-Host '------------------------'
    }

    $headers = @{
        'Authorization' = "Bearer $Token"
        'Content-Type'  = 'application/json'
    }

    try {
        return Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body $body
    } catch {
        Write-Host ''
        Write-Host "Endpoint that failed: [$endpoint]"
        Write-Host ''
        throw "Turso HTTP call failed: $($_.Exception.Message)"
    }
}

function Get-CellValue($cell) {
    if ($null -eq $cell) { return $null }
    if ($cell -is [string]) { return $cell }
    if ($cell.PSObject.Properties.Match('value').Count -gt 0) { return $cell.value }
    return $cell
}

# ---------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------

Write-Header 'ScrowPay - Grant Admin'

if ([string]::IsNullOrWhiteSpace($PhoneNumber)) {
    $PhoneNumber = $DEFAULT_PHONE
}

if ($PhoneNumber -eq '+2348012345678') {
    Write-Host '[!] You are using the placeholder phone number.'
    Write-Host '    Edit $DEFAULT_PHONE at the top of this script,'
    Write-Host '    or pass -PhoneNumber "+234..." on the command line.'
    Write-Host ''
    $confirm = Read-Host 'Continue anyway? (y/N)'
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host 'Aborted.'
        exit 1
    }
}

Write-Host "Phone number : $PhoneNumber"
Write-Host "Env file     : $EnvFile"

# 1. Load .env
Write-Host ''
Write-Host '> Reading .env...'
$envVars = Read-DotEnv -Path $EnvFile

$tursoUrl   = $envVars['TURSO_DATABASE_URL']
$tursoToken = $envVars['TURSO_AUTH_TOKEN']

# Diagnostic: show what we actually parsed (URL only - never log token)
Write-Host ''
Write-Host '----- diagnostic -----'
if ($null -eq $tursoUrl) {
    Write-Host 'TURSO_DATABASE_URL : <NOT FOUND in .env>'
} else {
    Write-Host ("TURSO_DATABASE_URL : [{0}]  (length {1})" -f $tursoUrl, $tursoUrl.Length)
}
if ($null -eq $tursoToken) {
    Write-Host 'TURSO_AUTH_TOKEN   : <NOT FOUND in .env>'
} else {
    $tokPreview = if ($tursoToken.Length -ge 12) { $tursoToken.Substring(0, 12) } else { $tursoToken }
    Write-Host ("TURSO_AUTH_TOKEN   : [{0}...]  (length {1})" -f $tokPreview, $tursoToken.Length)
}
Write-Host '----------------------'
Write-Host ''

if ([string]::IsNullOrWhiteSpace($tursoUrl) -or $tursoUrl -like '*your-database-name*') {
    throw "TURSO_DATABASE_URL is missing or still placeholder in $EnvFile"
}
if ([string]::IsNullOrWhiteSpace($tursoToken) -or $tursoToken -like '*your-turso-auth-token*') {
    throw "TURSO_AUTH_TOKEN is missing or still placeholder in $EnvFile"
}

$httpUrl = Convert-LibsqlToHttps $tursoUrl

# Sanity-check the constructed URL before we use it
try {
    $parsed = [System.Uri]$httpUrl
    if (-not $parsed.IsAbsoluteUri -or [string]::IsNullOrWhiteSpace($parsed.Host)) {
        throw "URL parsed but has no host: $httpUrl"
    }
} catch {
    Write-Host ''
    Write-Host "ERROR: TURSO_DATABASE_URL is not a valid URL after parsing."
    Write-Host "Got: [$httpUrl]"
    Write-Host ''
    Write-Host "Expected something like: libsql://my-db.turso.io"
    Write-Host "Open .env and check the line - no quotes, no trailing"
    Write-Host "characters, no inline comments."
    throw
}

Write-Host "HTTP endpoint base : $httpUrl"

# 2. Look up the user
Write-Host ''
if ($UserId -gt 0) {
    Write-Host "> Looking up user by id = $UserId ..."
    $lookup = Invoke-TursoSql `
        -BaseUrl $httpUrl `
        -Token   $tursoToken `
        -Sql     'SELECT id, first_name, last_name, phone_number, is_admin FROM users WHERE id = ?' `
        -SqlArgs @($UserId)
} else {
    Write-Host '> Looking up user by phone...'
    $lookup = Invoke-TursoSql `
        -BaseUrl $httpUrl `
        -Token   $tursoToken `
        -Sql     'SELECT id, first_name, last_name, phone_number, is_admin FROM users WHERE phone_number = ?' `
        -SqlArgs @($PhoneNumber)
}

$rows = $lookup.results[0].response.result.rows
if (-not $rows -or $rows.Count -eq 0) {
    Write-Host ''
    Write-Host "[X] No user found with phone_number = $PhoneNumber"
    Write-Host ''
    Write-Host '> Searching for similar numbers / showing recent users...'

    # Strip leading + and any non-digits for a loose match
    $digits = ($PhoneNumber -replace '[^0-9]', '')
    $likePattern = "%$digits%"

    # NB: SQLite treats double-quoted tokens as identifiers, so use single quotes
    # inside the SQL. The PowerShell string is already single-quoted, so SQL
    # single quotes are fine here.
    $loose = Invoke-TursoSql `
        -BaseUrl $httpUrl `
        -Token   $tursoToken `
        -Sql     "SELECT id, first_name, last_name, phone_number, is_admin FROM users WHERE REPLACE(REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), '-', '') LIKE ? LIMIT 10" `
        -SqlArgs @($likePattern)

    $looseRows = $loose.results[0].response.result.rows

    if ($looseRows -and $looseRows.Count -gt 0) {
        Write-Host ''
        Write-Host 'Found these similar users:'
        foreach ($r in $looseRows) {
            $id = Get-CellValue $r[0]
            $fn = Get-CellValue $r[1]
            $ln = Get-CellValue $r[2]
            $ph = Get-CellValue $r[3]
            $ia = Get-CellValue $r[4]
            Write-Host ("  - [{0}]  {1} {2}  phone=[{3}]  is_admin={4}" -f $id, $fn, $ln, $ph, $ia)
        }

        if ($looseRows.Count -eq 1) {
            $matchId    = [int](Get-CellValue $looseRows[0][0])
            $matchPhone = Get-CellValue $looseRows[0][3]
            $matchAdmin = Get-CellValue $looseRows[0][4]

            Write-Host ''
            Write-Host "The stored phone ([$matchPhone]) does not match what you typed ([$PhoneNumber])"
            Write-Host 'exactly - probably a hidden character or different formatting.'
            Write-Host ''
            $confirm = Read-Host "Promote user id=$matchId to admin anyway? (y/N)"
            if ($confirm -eq 'y' -or $confirm -eq 'Y') {
                if ("$matchAdmin" -eq '1') {
                    Write-Host '[OK] Already an admin. Nothing to do.'
                    exit 0
                }
                Write-Host '> Setting is_admin = 1 by id...'
                Invoke-TursoSql `
                    -BaseUrl $httpUrl `
                    -Token   $tursoToken `
                    -Sql     'UPDATE users SET is_admin = 1 WHERE id = ?' `
                    -SqlArgs @($matchId) | Out-Null

                $verify = Invoke-TursoSql `
                    -BaseUrl $httpUrl `
                    -Token   $tursoToken `
                    -Sql     'SELECT is_admin FROM users WHERE id = ?' `
                    -SqlArgs @($matchId)
                $nowAdmin = Get-CellValue $verify.results[0].response.result.rows[0][0]
                if ("$nowAdmin" -eq '1') {
                    Write-Host ''
                    Write-Host '[OK] Success! User is now an admin.'
                    exit 0
                } else {
                    Write-Host "[!] Verification returned is_admin = $nowAdmin"
                    exit 1
                }
            }
        }
        exit 1
    } else {
        Write-Host ''
        Write-Host 'No similar numbers either. Showing the 10 most recent users in this DB:'

        $recent = Invoke-TursoSql `
            -BaseUrl $httpUrl `
            -Token   $tursoToken `
            -Sql     'SELECT id, first_name, last_name, phone_number, is_admin FROM users ORDER BY id DESC LIMIT 10' `
            -SqlArgs @()

        $recentRows = $recent.results[0].response.result.rows
        if (-not $recentRows -or $recentRows.Count -eq 0) {
            Write-Host '  (users table is EMPTY - you are probably pointed at the wrong Turso DB,'
            Write-Host '   or no one has signed up on this DB yet.)'
        } else {
            foreach ($r in $recentRows) {
                $id = Get-CellValue $r[0]
                $fn = Get-CellValue $r[1]
                $ln = Get-CellValue $r[2]
                $ph = Get-CellValue $r[3]
                $ia = Get-CellValue $r[4]
                Write-Host ("  - [{0}]  {1} {2}  phone=[{3}]  is_admin={4}" -f $id, $fn, $ln, $ph, $ia)
            }
        }
    }

    Write-Host ''
    Write-Host 'Make sure:'
    Write-Host '  1. You completed signup with this exact number'
    Write-Host '  2. The format matches what is stored (with leading +)'
    Write-Host '  3. .env points at the right Turso database'
    exit 1
}

$row       = $rows[0]
$userId    = [int](Get-CellValue $row[0])
$firstName = Get-CellValue $row[1]
$lastName  = Get-CellValue $row[2]
$phone     = Get-CellValue $row[3]
$wasAdmin  = Get-CellValue $row[4]

Write-Host ''
Write-Host 'Found user:'
Write-Host "  ID         : $userId"
Write-Host "  Name       : $firstName $lastName"
Write-Host "  Phone      : $phone"
Write-Host "  is_admin   : $wasAdmin (before)"

if ("$wasAdmin" -eq '1') {
    Write-Host ''
    Write-Host '[OK] Already an admin. Nothing to do.'
    exit 0
}

# 3. Promote
Write-Host ''
Write-Host '> Setting is_admin = 1...'

# Always promote/verify by the id we just read - avoids any hidden-char
# weirdness in phone_number.
Invoke-TursoSql `
    -BaseUrl $httpUrl `
    -Token   $tursoToken `
    -Sql     'UPDATE users SET is_admin = 1 WHERE id = ?' `
    -SqlArgs @($userId) | Out-Null

# 4. Verify
Write-Host '> Verifying...'

$verify = Invoke-TursoSql `
    -BaseUrl $httpUrl `
    -Token   $tursoToken `
    -Sql     'SELECT is_admin FROM users WHERE id = ?' `
    -SqlArgs @($userId)

$verifyRow = $verify.results[0].response.result.rows[0]
$nowAdmin  = Get-CellValue $verifyRow[0]

if ("$nowAdmin" -eq '1') {
    Write-Host ''
    Write-Host '[OK] Success! User is now an admin.'
    Write-Host ''
    Write-Host 'Next steps:'
    Write-Host '  1. Sign in to the dashboard'
    Write-Host '  2. Open the profile panel (avatar top-right)'
    Write-Host '  3. Click "Admin Console"'
    Write-Host '  Or open directly: http://localhost:8080/admin.html'
} else {
    Write-Host ''
    Write-Host "[!] Verification returned is_admin = $nowAdmin (expected 1)"
    Write-Host '    Check the Turso dashboard manually.'
    exit 1
}

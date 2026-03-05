# run-migrations.ps1
# Applies all migrations in the database folder sequentially via psql

param (
    [string]$DbUrl = $env:SUPABASE_DB_URL
)

Write-Host "Yilama Events Database Migration Runner" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($DbUrl)) {
    Write-Error "Error: You must provide your Supabase PostgreSQL connection string."
    Write-Host "Usage: .\run-migrations.ps1 'postgresql://postgres:postgres@localhost:54322/postgres'"
    Write-Host "Or set the SUPABASE_DB_URL environment variable."
    exit 1
}

try {
    # Test connection and create migrations table
    psql $DbUrl -c "
    CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT now()
    );" | Out-Null
} catch {
    Write-Error "Failed to connect to postgres database. Make sure 'psql' is installed and in your PATH."
    exit 1
}

Write-Host "Checking for pending migrations..."

# Fetch applied migrations
$AppliedMigrations = psql $DbUrl -t -A -c "SELECT filename FROM schema_migrations;"
if ($null -eq $AppliedMigrations) { $AppliedMigrations = @() }

$MigrationsPath = Join-Path $PSScriptRoot "..\database"
$SqlFiles = Get-ChildItem -Path $MigrationsPath -Filter *.sql | Where-Object { $_.Name -ne "master_schema.sql" } | Sort-Object Name

# Special Logic for Fresh Install (Master Schema)
if ($AppliedMigrations.Count -eq 0) {
    $MasterFile = Join-Path $MigrationsPath "master_schema.sql"
    if (Test-Path $MasterFile) {
        Write-Host "Fresh install detected. Applying Master Schema..." -ForegroundColor Cyan
        $psqlArgs = @("-v", "ON_ERROR_STOP=1", "-1", "-f", $MasterFile)
        Start-Process -FilePath "psql" -ArgumentList ($DbUrl, $psqlArgs) -Wait -NoNewWindow
        
        if ($LASTEXITCODE -eq 0) {
            # Mark master and all current migrations (up to 81) as applied
            psql $DbUrl -c "INSERT INTO schema_migrations (filename) VALUES ('master_schema.sql');" | Out-Null
            foreach ($File in $SqlFiles) {
                psql $DbUrl -c "INSERT INTO schema_migrations (filename) VALUES ('$($File.Name)');" | Out-Null
            }
            Write-Host "Master Schema applied and baseline seeded." -ForegroundColor Green
            # Update $AppliedMigrations list for the rest of the script
            $AppliedMigrations = psql $DbUrl -t -A -c "SELECT filename FROM schema_migrations;"
        } else {
            Write-Error "Master Schema application failed."
            exit 1
        }
    }
}

$AppliedCount = 0

foreach ($File in $SqlFiles) {
    if ($AppliedMigrations -contains $File.Name) {
        continue
    }

    Write-Host "Applying incremental: $($File.Name)" -ForegroundColor Yellow
    
    # Run the file
    $psqlArgs = @("-v", "ON_ERROR_STOP=1", "-1", "-f", $File.FullName)
    Start-Process -FilePath "psql" -ArgumentList ($DbUrl, $psqlArgs) -Wait -NoNewWindow
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Migration failed on file: $($File.Name)"
        exit 1
    }

    # Record it
    psql $DbUrl -c "INSERT INTO schema_migrations (filename) VALUES ('$($File.Name)');" | Out-Null
    
    $AppliedCount++
}

if ($AppliedCount -eq 0 -and $LASTEXITCODE -eq 0) {
    Write-Host "Database is already up to date!" -ForegroundColor Green
} elseif ($AppliedCount -gt 0) {
    Write-Host "Successfully applied $AppliedCount incremental migrations." -ForegroundColor Green
}

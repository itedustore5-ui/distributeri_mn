# Pravi pg_dump bekap za svakog klijenta iz alati/klijenti.txt u bekap/, i briše starije od 90 dana.
# Zahtijeva da je pg_dump instaliran i dostupan u PATH-u (dio PostgreSQL client alata).
# Pokretanje: powershell -File alati/bekap.ps1

$ovdje = Split-Path -Parent $MyInvocation.MyCommand.Path
$klijentiPath = Join-Path $ovdje "klijenti.txt"
$bekapDir = Join-Path (Split-Path -Parent $ovdje) "bekap"

if (-not (Test-Path $bekapDir)) {
    New-Item -ItemType Directory -Path $bekapDir | Out-Null
}

if (-not (Test-Path $klijentiPath)) {
    Write-Error "Nema alati/klijenti.txt — dodajte redove oblika: Naziv = postgresql://..."
    exit 1
}

$datum = Get-Date -Format "yyyy-MM-dd"

Get-Content $klijentiPath | ForEach-Object {
    $red = $_.Trim()
    if ($red -eq "" -or $red.StartsWith("#")) { return }
    $delovi = $red -split "=", 2
    $naziv = $delovi[0].Trim()
    $url = $delovi[1].Trim()
    $fajl = Join-Path $bekapDir "$naziv-$datum.sql"

    Write-Host "Bekapujem $naziv -> $fajl"
    & pg_dump $url --no-owner --no-privileges -f $fajl
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "pg_dump nije uspio za $naziv"
    }
}

Write-Host "Brisanje bekapa starijih od 90 dana..."
Get-ChildItem $bekapDir -Filter "*.sql" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-90) } | Remove-Item -Force

Write-Host "Gotovo."

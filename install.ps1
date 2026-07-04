#Requires -Version 5.1
# install.ps1 — MangoOS, Phase 1 (jalon C) du plan de distribution (docs/plan-distribution.md §3.4).
# Installe les dépendances des deux repos (server/ + ui/), les navigateurs Playwright,
# crée un server/.env vierge à partir de server/.env.example (sans jamais écraser un
# .env existant), build l'UI, puis lance `mango doctor` pour un diagnostic final.
#
# Usage : powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

Step "Vérification de Node.js"
$nodeVersion = (& node --version) 2>$null
if (-not $nodeVersion) {
    Write-Host "Node.js introuvable. Installe Node 20+ (voir .nvmrc) avant de continuer." -ForegroundColor Red
    exit 1
}
Write-Host "Node détecté : $nodeVersion"

Step "Installation des dépendances — server/"
Push-Location (Join-Path $root "server")
try {
    if (Test-Path "package-lock.json") {
        npm ci
    } else {
        npm install
    }
} finally {
    Pop-Location
}

Step "Installation des dépendances — ui/"
Push-Location (Join-Path $root "ui")
try {
    if (Test-Path "package-lock.json") {
        npm ci
    } else {
        npm install
    }
} finally {
    Pop-Location
}

Step "Installation des navigateurs Playwright (server/)"
Push-Location (Join-Path $root "server")
try {
    npx playwright install
} catch {
    Write-Host "Échec de `npx playwright install` — relance-le manuellement dans server/ si besoin." -ForegroundColor Yellow
} finally {
    Pop-Location
}

Step "Configuration server/.env"
$envExample = Join-Path $root "server\.env.example"
$envFile = Join-Path $root "server\.env"
if (Test-Path $envFile) {
    Write-Host "server/.env existe déjà — non modifié."
} elseif (Test-Path $envExample) {
    Copy-Item $envExample $envFile
    Write-Host "server/.env créé à partir de server/.env.example (valeurs vides)."

    $eleveKey = Read-Host "Clé ELEVE_API_KEY (obligatoire pour faire tourner l'Élève — Entrée pour laisser vide et la renseigner plus tard)"
    if ($eleveKey) {
        (Get-Content $envFile) -replace '^ELEVE_API_KEY=.*$', "ELEVE_API_KEY=$eleveKey" | Set-Content $envFile
    }
    $pexelsKey = Read-Host "Clé PEXELS_API_KEY (optionnelle, images réelles — Entrée pour ignorer)"
    if ($pexelsKey) {
        (Get-Content $envFile) -replace '^PEXELS_API_KEY=.*$', "PEXELS_API_KEY=$pexelsKey" | Set-Content $envFile
    }
} else {
    Write-Host "server/.env.example introuvable — impossible de créer server/.env automatiquement." -ForegroundColor Yellow
}

Step "Build de l'UI"
Push-Location (Join-Path $root "ui")
try {
    npm run build
} finally {
    Pop-Location
}

Step "Diagnostic final — mango doctor"
node (Join-Path $root "scripts\doctor.mjs")
$doctorExit = $LASTEXITCODE

Write-Host ""
if ($doctorExit -eq 0) {
    Write-Host "Installation terminée — tout est vert. Lance `node scripts/start.mjs` pour démarrer MangoOS." -ForegroundColor Green
} else {
    Write-Host "Installation terminée avec des points à corriger (voir le rapport mango doctor ci-dessus)." -ForegroundColor Yellow
}
exit $doctorExit

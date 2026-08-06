# Installe la tâche planifiée qui réapplique la protection GPU à chaque ouverture
# de session (limites.md L139). À lancer UNE FOIS, dans un PowerShell ADMINISTRATEUR.
#
#   Set-Location D:\IA\MangoOS ; .\scripts\gpu-protection-install.ps1
#
# Désinstallation :
#   .\scripts\gpu-protection-install.ps1 -Desinstaller
#
# L'élévation est nécessaire pour deux raisons distinctes, et les deux comptent :
#   1. enregistrer une tâche avec `RunLevel Highest` ;
#   2. `nvidia-smi -pl` lui-même refuse de s'appliquer sans privilèges — sans le
#      point 1, la tâche tournerait à chaque démarrage en échouant en silence,
#      ce qui reproduirait exactement le défaut qu'on corrige.

param([switch]$Desinstaller)

$ErrorActionPreference = 'Stop'

$NomTache = 'MangoOS - Protection GPU (L61-L139)'
$Script   = Join-Path $PSScriptRoot 'gpu-protection.ps1'

function Est-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Est-Admin)) {
    Write-Host ''
    Write-Host '  Ce script doit tourner en ADMINISTRATEUR.' -ForegroundColor Red
    Write-Host '  Ouvre PowerShell par un clic droit > "Executer en tant qu''administrateur", puis :' -ForegroundColor Yellow
    Write-Host ''
    Write-Host "    Set-Location D:\IA\MangoOS ; .\scripts\gpu-protection-install.ps1" -ForegroundColor Cyan
    Write-Host ''
    exit 1
}

if ($Desinstaller) {
    if (Get-ScheduledTask -TaskName $NomTache -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $NomTache -Confirm:$false
        Write-Host "  Tache supprimee : $NomTache" -ForegroundColor Green
        Write-Host '  ATTENTION : la carte repassera a 250 W au prochain redemarrage (cf. L61).' -ForegroundColor Yellow
    } else {
        Write-Host '  Aucune tache a supprimer.' -ForegroundColor Yellow
    }
    exit 0
}

if (-not (Test-Path $Script)) {
    Write-Host "  Script introuvable : $Script" -ForegroundColor Red
    exit 1
}

# Déclencheur : à l'ouverture de session, avec 1 minute de délai. Le pilote NVIDIA
# n'est pas toujours prêt à la seconde où la session s'ouvre ; le script sait déjà
# retenter pendant 30 s, le délai est une seconde ceinture.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $Script)

$trigger = New-ScheduledTaskTrigger -AtLogOn
$trigger.Delay = 'PT1M'

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName $NomTache -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force `
    -Description ('Reapplique la limite de puissance 150 W sur la GTX 1080 Ti a chaque ouverture de session. ' +
                  'Protection contre le decrochage PSU documente en limites.md L61 ; corrige L139 — un ' +
                  'nvidia-smi -pl ne survit pas au redemarrage et rien ne le reappliquait.') | Out-Null

Write-Host "  Tache enregistree : $NomTache" -ForegroundColor Green
# On ne se contente PAS d'enregistrer : on exécute ET on prouve.
#
# ⚠️ LEÇON DE LA PREMIÈRE VERSION (2026-08-06) — cette vérification a rendu un FAUX
# VERT. Elle contrôlait que la limite valait 150 W... ce qui était déjà vrai AVANT
# l'installation. Elle a donc affiché « VERIFIE » alors que le script n'avait même
# pas pu être analysé (fichier UTF-8 sans BOM, illisible par powershell.exe 5.1) et
# que la tâche renvoyait le code 1. Vérifier un ÉTAT déjà atteint ne prouve rien sur
# l'ACTION — c'est exactement le défaut que L139 dénonce, reproduit par le correctif
# de L139 lui-même.
#
# On vérifie donc TROIS choses distinctes, et il faut les trois :
#   1. le code de retour de la tâche vaut 0 ;
#   2. une ligne de journal FRAÎCHE a été écrite → preuve que le script a tourné ;
#   3. la limite effective est bien à 150 W.
Write-Host '  Execution immediate pour verification...' -ForegroundColor Cyan

$journal   = "$env:LOCALAPPDATA\MangoOS\gpu-protection.log"
$tailleAvant = if (Test-Path $journal) { (Get-Item $journal).Length } else { 0 }

Start-ScheduledTask -TaskName $NomTache
Start-Sleep -Seconds 10

$info        = Get-ScheduledTaskInfo -TaskName $NomTache
$tailleApres = if (Test-Path $journal) { (Get-Item $journal).Length } else { 0 }
$limite      = (& "$env:SystemRoot\System32\nvidia-smi.exe" --query-gpu=power.limit --format=csv,noheader,nounits | Select-Object -First 1).Trim()

$okCode    = ($info.LastTaskResult -eq 0)
$okJournal = ($tailleApres -gt $tailleAvant)
$okLimite  = ([math]::Abs([double]$limite - 150) -lt 0.5)

Write-Host ''
Write-Host ('  code de retour de la tache : {0}   {1}' -f $info.LastTaskResult, $(if ($okCode) { 'OK' } else { 'ECHEC' })) -ForegroundColor $(if ($okCode) { 'Green' } else { 'Red' })
Write-Host ('  journal ecrit              : {0}' -f $(if ($okJournal) { 'OUI' } else { 'NON - le script n a pas tourne' })) -ForegroundColor $(if ($okJournal) { 'Green' } else { 'Red' })
Write-Host ('  limite effective           : {0} W   {1}' -f $limite, $(if ($okLimite) { 'OK' } else { 'ECHEC' })) -ForegroundColor $(if ($okLimite) { 'Green' } else { 'Red' })
Write-Host ''

if ($okCode -and $okJournal -and $okLimite) {
    Write-Host '  PROTECTION ACTIVE ET PROUVEE.' -ForegroundColor Green
    Write-Host "  Journal : $journal"
    Write-Host ''
} else {
    Write-Host '  PROTECTION NON PROUVEE - ne pas se fier a cette installation.' -ForegroundColor Red
    Write-Host "  Diagnostic : $journal" -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

# Protection GPU — réapplique la limite de puissance de la GTX 1080 Ti au démarrage.
#
# POURQUOI (limites.md L61 puis L139) :
# Le 2026-06-30, deux coupures d'alimentation brutales (Kernel-Power 41 + arrêt 6008,
# AUCUN minidump) pendant une génération Flux. Diagnostic : ce n'est pas un crash
# logiciel ni un dépassement de VRAM, c'est la PSU qui décroche — la 1080 Ti sous
# charge Flux tire 250 W avec des pics transitoires vers 300 W. Atténuation retenue :
# brider la carte à 150 W.
#
# LE DÉFAUT QUE CE SCRIPT CORRIGE (L139, mesuré le 2026-08-06) :
# `nvidia-smi -pl` ne survit PAS à un redémarrage, et rien ne le réappliquait — ni
# outil de tuning, ni tâche planifiée. À chaque reboot la carte repassait donc à
# 250 W et la faille se rouvrait EN SILENCE. Une protection qui s'efface sans le dire
# est pire qu'une protection absente : on croit être couvert.
#
# CE QUE ÇA NE FAIT PAS : régler la cause. Le fond reste matériel (alimentation à
# dimensionner ≥ 600 W de qualité, câbles PCIe séparés — cf. L61). Ceci est une
# atténuation, et elle s'assume comme telle.
#
# Idempotent : si la limite est déjà bonne, on ne touche à rien et on le journalise.

$ErrorActionPreference = 'Stop'

$LimiteVoulue = 150
$NvidiaSmi    = "$env:SystemRoot\System32\nvidia-smi.exe"
$Journal      = Join-Path $env:LOCALAPPDATA 'MangoOS\gpu-protection.log'

function Ecrire([string]$niveau, [string]$message) {
    $ligne = "{0}  [{1}]  {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $niveau, $message
    $dossier = Split-Path $Journal -Parent
    if (-not (Test-Path $dossier)) { New-Item -ItemType Directory -Path $dossier -Force | Out-Null }
    Add-Content -Path $Journal -Value $ligne -Encoding UTF8
    Write-Output $ligne
}

if (-not (Test-Path $NvidiaSmi)) {
    Ecrire 'ERREUR' "nvidia-smi introuvable ($NvidiaSmi) — pilote absent ou déplacé. Protection NON appliquée."
    exit 1
}

# Lecture de l'état AVANT. Au démarrage, le pilote peut ne pas être prêt tout de
# suite : on retente quelques fois plutôt que d'abandonner sur un faux négatif.
$avant = $null
foreach ($essai in 1..6) {
    try {
        $avant = (& $NvidiaSmi --query-gpu=power.limit --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
        if ($avant) { break }
    } catch { }
    Start-Sleep -Seconds 5
}
if (-not $avant) {
    Ecrire 'ERREUR' 'le pilote NVIDIA n a pas répondu après 6 essais (30 s) — protection NON appliquée.'
    exit 1
}

$avantW = [double]($avant.Trim())
if ([math]::Abs($avantW - $LimiteVoulue) -lt 0.5) {
    Ecrire 'OK' ("limite déjà à {0} W — rien à faire." -f $LimiteVoulue)
    exit 0
}

Ecrire 'INFO' ("limite trouvée à {0} W → application de {1} W (protection L61)." -f $avantW, $LimiteVoulue)
& $NvidiaSmi -pl $LimiteVoulue | Out-Null

# On RELIT la valeur effective : un `nvidia-smi -pl` peut échouer silencieusement
# faute de privilèges. Journaliser « appliqué » sans vérifier reproduirait le défaut
# même qu'on corrige — une protection qu'on croit posée et qui ne l'est pas.
$apres  = (& $NvidiaSmi --query-gpu=power.limit --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
$apresW = [double]($apres.Trim())

if ([math]::Abs($apresW - $LimiteVoulue) -lt 0.5) {
    Ecrire 'OK' ("protection appliquée et vérifiée : {0} W." -f $apresW)
    exit 0
} else {
    Ecrire 'ERREUR' ("échec : la limite est restée à {0} W (privilèges insuffisants ?). LA CARTE N EST PAS PROTÉGÉE." -f $apresW)
    exit 1
}

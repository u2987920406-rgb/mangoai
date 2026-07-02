# Audit des compétences de MangoOS + 3 nouvelles compétences

**Date** : 2026-07-02 · **Demandeur** : Raf · **Méthode** : exploration du code (`server/src/eleve-*-tools.ts`, `brain-registry.ts`, `agent-forge.ts`, `stratege.ts`, `wiki/transmission-competences.md`, `limites.md`).

## Surface actuelle — ≈ 30 outils (KernelTools) + 13 cerveaux + forge d'agents

| Famille | Compétences (outils) | Gate / défaut | Maturité |
|---|---|---|---|
| Fichiers & build | read_file, list_files, search_code, check_build, write_file, edit_file, run_command, add_dependency | toujours ON | ✅ mûr |
| Web & recherche | chercher_web, lire_page, requete_web, chercher_image | ELEVE_WEB/HTTP · ON | ✅ mûr |
| Documents & archives | lire_document (PDF/DOCX/XLSX), lire_archive (ZIP/RAR) | ELEVE_DOCUMENT/ARCHIVE · ON | ✅ (trous L4/L5/L6) |
| Exploration web | extraire_site (5 phases) | ELEVE_SITE · ON | ✅ (L11/L14) |
| Vision & images | vois_ecran, lire_image, genere_image, decoupe_assets | ELEVE_VISION/FLUX · **OFF** | ⚠️ opt-in |
| Test / QA | teste_parcours, unity_test | ELEVE_PARCOURS · ON | ✅ |
| Planification | planifier, etape_faite | ELEVE_PLANIFIER · ON | ✅ |
| Réutilisation | chercher_artefact (Blackboard cross-projet) | ELEVE_ARTEFACT · ON | ✅ |
| Contenu structuré | genere_contenu, verifie_coherence_images | ELEVE_CONTENT · **OFF** | ⚠️ opt-in |
| Infra back | assemble_brique (auth/db/paiement/RGPD/sécurité) | ELEVE_BRICKS · **OFF** | ⚠️ opt-in |
| Secrets | utilise_secret (Bitwarden / fichier chiffré) | ELEVE_VAULT · **OFF** | ⚠️ opt-in |
| Domaine Unity | unity_build, unity_test | ELEVE_UNITY · **OFF** | ⚠️ opt-in |
| **Méta — auto-test** | **ecris_test, lance_tests** (NOUVEAU 2026-07-02) | ELEVE_AUTOTEST · **OFF** | ✅ livré |
| **Méta — déblocage** | Stratège #164 (diagnostic→remède→apprentissage→escalade) | ELEVE_STRATEGE · observe | ✅ |
| **Méta — clôture** | Gardien #161 (intention/goût/QA/récit) | ON | ✅ |
| **Méta — auto-évolution** | Forge d'agents #168 (Mango crée des agents ciblés) | ON | ✅ |

**Trous structurants** (limites.md) : coût GLM non tracé (L7), sur-exploration résiduelle (L35), juge intention/goût bruité (L19/L34), PDF scannés (L4), pas de téléchargement binaire (L43).

## Les 3 compétences proposées — « Mango qui se connaît, apprend, et se vérifie »

1. **📊 Auto-mesure & frugalité** (résout L7) — capter le coût réel par tour (tokens GLM, latence, appels), l'agréger, et nourrir le Stratège pour que Mango détecte SON gaspillage et s'auto-freine. Efficacité méta ; souveraineté enfin chiffrée. 🟢 codable interne.
2. **🧠 Capitalisation inter-projets** — distiller une « recette » par build (contexte → approche gagnante → pièges) et la reconsulter au projet suivant. Compounding : chaque projet rend le suivant plus rapide. 🟢 (réutilise Blackboard + embeddings).
3. **✅ Auto-test génératif** — Mango écrit et rejoue ses propres tests pour attraper ses régressions seul. 🟢 (réutilise le moteur teste_parcours). **→ CHOISI & IMPLÉMENTÉ ce jour.**

## Compétence livrée : Auto-test génératif (2026-07-02)

Deux outils, gaté `ELEVE_AUTOTEST=on` (défaut OFF), bâtis sur le moteur `teste_parcours` (`startPreview` + `runParcours`), **zéro dépendance ajoutée** dans les projets générés :
- **`ecris_test` `{ nom, etapes }`** — enregistre un parcours-test (mêmes actions/attendus que teste_parcours) dans `<projet>/.mango-tests/<slug>.json`. Mango déclare « ce flux doit continuer à marcher ».
- **`lance_tests` `{ nom? }`** — rejoue toute la suite (ou un test) sur l'aperçu live, renvoie ✓/✗ par test, `isError` si une régression → la boucle GLM se corrige. Cap de 12 specs par appel.

Fichiers : `server/src/eleve-autotest-tools.ts` (+ deps injectées), `test-eleve-autotest.ts` (14/0), branchement gaté dans `eleve-action-tools.ts`.
**v1 = parcours rejouables** ; tests unitaires **vitest** sur la logique pure = extension future (exigerait vitest dans chaque projet) — voir limites.

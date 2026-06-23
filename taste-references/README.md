# taste-references — la graine de TON goût (#149 Moteur de Goût)

Ce dossier est la **source de vérité** des références que le Sharingan va mesurer
pour ancrer les variantes (skins) sur du **vrai design**, jamais sur de l'inventé.

## Comment ça marche — le Sharingan a DEUX bouches

- **URL** (site produit réel) → tokens CSS réels (palette, variables, typo, fonts).
- **IMAGE** (photo Unsplash, shot Dribbble, screen Mobbin que tu enregistres ici)
  → palette dominante + ambiance perceptuelle (luminosité · saturation · température).

## Comment ajouter une référence

Un sous-dossier par **direction esthétique**. Dans chaque `refs.json` :

```json
{
  "direction": "minimal-froid",
  "name": "Minimal froid",
  "urls": ["https://linear.app", "https://vercel.com"],
  "images": [],
  "notes": "ce que tu aimes ici, en une phrase"
}
```

- **URLs** : ajoute/retire des sites produit → bouche URL.
- **Images** : dépose simplement des fichiers `.png/.jpg/.webp` dans le sous-dossier
  (capture d'Unsplash/Dribbble/Mobbin). Le moteur les détecte automatiquement → bouche IMAGE.
  (Le champ `images` peut rester vide : le moteur scanne le dossier.)
- **notes** : libre — ça aide la distillation à comprendre ce qui te plaît.

Tu peux aussi créer de **nouvelles directions** (nouveau sous-dossier + refs.json) :
elles seront proposées dans la galerie au même titre que les directions de départ.

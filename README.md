# Élite Sniper

Mini-GTA / tireur d'élite en monde ouvert 3D (Three.js), empaqueté en application Android avec Capacitor.
L'APK est compilé automatiquement par GitHub Actions.

## Obtenir l'APK (GitHub Actions)

1. Créez un dépôt GitHub et poussez-y **tout** le contenu de ce dossier (y compris `.github/` et `public/map/`).
2. Onglet **Actions** → workflow **Build Android APK** (à chaque push, ou **Run workflow**).
3. Téléchargez l'artefact **elite-sniper-apk** → `app-debug.apk`, copiez-le sur le téléphone et installez-le.

## Tester sur PC

```bash
npm install
npm run dev
```

## La carte « Vallée des Élites » (2 km × 2 km)

Générée par `tools/generate-map.mjs` (déterministe, graine fixe) puis chargée par le jeu.

- **100 fichiers** `public/map/chunk_X_Z.bin` (10 × 10 chunks de 200 m) + `manifest.json` — **≈ 22,8 Mo**.
- Chaque chunk : terrain 257×257 (un point tous les 78 cm), peinture du sol 160×160, et la liste de ses objets.
- **1000 bâtiments tous différents** (32 types : maisons, villas, immeubles, commerces, bureaux, gratte-ciel, entrepôts,
  usines, granges, fermes, églises, écoles, hôpital, mairies, casernes, bunkers, miradors, hangars, cabanes, remises à bateaux,
  phares, silos, moulins, huttes, ruines, stations-service, hôtels, marchés, antennes, casernes de pompiers, cuves, conteneurs),
  chacun avec ses dimensions, étages, toit, couleurs et accessoires (cheminée, balcons, porche, garage, lucarne, panneaux solaires,
  auvent, enseigne, citerne, antenne, parabole…).
- **Eau** : 3 cours d'eau, 5 lacs, mer en bordure, **10 ponts**. **Piscines** : villas au bord des lacs, parcs urbains, bassins-fontaines.
- **Villes** : 1 grande ville avec quartier d'affaires, 3 villes, 4 villages, zone industrielle, base militaire ; 5-8 fermes avec champs et enclos ; routes, pistes, lampadaires, voitures, poteaux.
- **Animaux** (≈ 700, 17 espèces) : vaches, moutons, chevaux, cerfs, lapins, renards, chiens, sangliers, canards, cygnes, poissons,
  corbeaux, aigles, chèvres, poules, cochons, chats. Ils fuient au bruit des tirs.
- Environ 15 000 arbres (pins, chênes, bouleaux, peupliers, buissons).

Régénérer la carte : `npm run map` (modifier la graine ou les paramètres dans `tools/generate-map.mjs`).
Vérifier la carte : `npm run check-map`.

## Monde ouvert

- Vous marchez / courez librement sur toute la carte (2 km × 2 km), caméra 3ᵉ personne. Le monde se charge autour de vous (chunks de 200 m).
- 5 véhicules (berline, compacte, fourgon, jeep, camion) : approchez-vous → **ENTRER**.
- 3 armes : pistolet, fusil d'assaut, sniper (balistique + vent + lunette 4×/8×/12×).
- 10 missions d'histoire (aller à, éliminer, récupérer, chrono, enchaînements) + contrats rapides générés (livraison, camp ennemi).
  Les balises dorées lancent les missions ; ☰ ouvre la liste (GPS / départ rapide). Argent sauvegardé.
- Ennemis : patrouillent, vous repèrent, vous poursuivent. Civils dans les villes (fuient quand on tire).
- Minimap : terrain, eau, bâtiments, véhicules, ennemis, objectifs.

## Structure du code

- `src/main.js` : boucle de jeu, déplacement, caméra, armes, véhicules, HUD, missions
- `src/world.js` : chargement/streaming des chunks, terrain (LOD), eau, arbres, bâtiments, ponts, piscines, animaux
- `src/worldcore.js` : hauteur du terrain, collisions, rayons, déplacement d'acteurs (sans dépendance graphique)
- `src/buildings.js` : construction procédurale des 32 types de bâtiments
- `src/props.js`, `src/animals.js`, `src/textures.js`, `src/meshbuilder.js`, `src/mapformat.js`
- `src/enemy.js` (soldats, civils, IA), `src/vehicles.js`, `src/missions.js` (moteur de missions), `src/audio.js`
- `tools/` : générateur de carte et tests (`npm run map`, `npm run check-map`)
- `android-overrides/MainActivity.java` : plein écran immersif (copié par le workflow)
- `.github/workflows/android-build.yml` : build de l'APK

## Contrôles

Mobile : joystick gauche (marcher, courir à fond) · glisser à droite = regarder · TIR · VISER (lunette du sniper) · ARME · RECHARGER · ENTRER/SORTIR · ☰ missions · II pause.
PC : ZQSD/WASD · Maj = courir · clic = tirer · clic droit/X = viser · E = entrer/sortir · R = recharger · G/Tab = arme · M = missions · Échap = pause.

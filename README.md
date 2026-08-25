# NEXORA Mobile (Android)

Ce dossier contient l'application Android de NEXORA, empaquetée avec
[Capacitor](https://capacitorjs.com/) autour du même frontend que la
version web/desktop.

## Pourquoi passer par GitHub Actions ?

Compiler un `.apk` nécessite le SDK Android + Gradle, des outils lourds à
installer. GitHub Actions les fournit déjà préinstallés sur ses machines
de build (gratuites, y compris pour un dépôt **privé** : 2000 minutes/mois
offertes). Le workflow fourni ici (`.github/workflows/build-apk.yml`)
compile l'APK dans le cloud et le publie automatiquement en **Release**
sur votre dépôt — pas en "artifact", donc **ça ne compte pas dans le
quota de stockage limité** (500 Mo) des Packages/Artifacts. Les Releases
ont leur propre espace, jusqu'à 2 Go par fichier, gratuit, même en privé.

## Mise en route (une seule fois)

1. Créez un nouveau dépôt **privé** sur GitHub (ne cochez aucune case
   d'initialisation : pas de README, pas de .gitignore — ce dossier les a déjà).
2. Poussez ce dossier tel quel :
   ```bash
   cd nexora-mobile
   git init
   git add .
   git commit -m "Initial commit — NEXORA mobile"
   git branch -M main
   git remote add origin https://github.com/VOTRE_COMPTE/VOTRE_DEPOT.git
   git push -u origin main
   ```
3. Sur GitHub, allez dans l'onglet **Actions** de votre dépôt : le workflow
   "Build NEXORA APK" doit apparaître.
4. Cliquez sur **Run workflow** (bouton en haut à droite) pour lancer une
   première compilation manuelle. Ça prend 3 à 5 minutes.
5. Une fois terminé, allez dans l'onglet **Releases** (à droite de la page
   principale du dépôt) : votre `.apk` y est attaché, prêt à télécharger et
   installer sur un téléphone Android (activez "Sources inconnues" dans les
   réglages Android pour installer un APK hors Play Store).

Pour les fois suivantes, poussez un tag `v1.0.1`, `v1.1.0`, etc. — le
workflow se relance automatiquement et publie une nouvelle Release.

## ⚠️ Fonctionnement réseau : ce qui est local, ce qui a besoin d'internet

**Mise à jour : l'app est maintenant réellement offline-first.** Toutes vos
données — projets, transactions, stock, états de besoin — sont stockées
directement sur l'appareil (IndexedDB, natif dans la WebView Android,
aucun plugin à compiler). Testé réellement : réseau coupé au niveau
navigateur, création de projet + transaction + article de stock, puis
redémarrage de l'app — toutes les données étaient toujours là. Aucune de
ces actions n'appelle de serveur.

**Seul l'assistant IA a besoin d'un serveur** (une IA ne peut pas tourner
sur le téléphone). Au premier lancement, l'app fonctionne immédiatement
sans rien configurer ; pour activer le chat IA, allez dans le menu
"🌐 Serveur" et entrez l'adresse de votre serveur NEXORA (celui de
`1-application-web/`, lancé avec `npm start`). Sans ça, l'app affiche
clairement "Serveur IA non configuré" — jamais de blocage silencieux.

---

**Développé par Sam Digital Pro Creator © Août 2026 — Tous droits réservés.**
+242 06 635-5053 — bricesam10@gmail.com

# MiniGram

Client Telegram bureau pour enfant, basé sur [TDLib](https://core.telegram.org/tdlib). Verrouillé côté UI : l'enfant ne peut communiquer qu'avec une liste blanche de contacts définie par le parent.

## Fonctionnalités

- Conversations texte, photos, vidéos, vocaux, GIFs, stickers, documents
- Scroll infini avec archivage complet de l'historique (texte + médias)
- Réactions emoji avec aperçu des réacteurs
- Citations de messages
- Réponses à un message
- Notifications Windows
- Membres de groupe cliquables → ouverture d'un chat privé
- Lightbox plein écran pour photos et vidéos

## Contrôle parental

- **Whitelist** : seuls les contacts/groupes listés dans `whitelist.json` (userData) sont visibles
- **Demandes en attente** : les nouveaux contacts inconnus arrivent en attente, jamais affichés à l'enfant
- **Gate admin caché** (`Ctrl+Alt+Shift+P`) : protégé par mot de passe, permet d'approuver/rejeter les demandes, rechercher et ajouter des contacts, voir le compte connecté
- Toute recherche Telegram globale est désactivée pour l'enfant

## Stack

- **Electron** + **React** + **Vite** + **TypeScript** + **Tailwind CSS**
- **tdl** + **prebuilt-tdlib** (bindings Node.js pour TDLib, sans compilation C++)

---

## Prérequis développement

- Node.js 18+
- Un compte Telegram (numéro de téléphone pour l'enfant)
- Des clés API Telegram : créer une app sur [my.telegram.org](https://my.telegram.org) pour obtenir `api_id` et `api_hash`

## Installation

```bash
git clone https://github.com/sputier/minigram.git
cd minigram
npm install
```

Copier `.env.example` vers `.env` et renseigner les valeurs :

```env
TELEGRAM_API_ID=        # depuis my.telegram.org
TELEGRAM_API_HASH=      # depuis my.telegram.org
TDLIB_ENCRYPTION_KEY=   # chaîne aléatoire longue — ne jamais la changer/perdre
ADMIN_PASSWORD=         # mot de passe du gate admin parent
```

> ⚠️ `TDLIB_ENCRYPTION_KEY` chiffre la base de données TDLib locale. La perdre ou la changer rend la session illisible.

## Développement

```bash
npm run dev
```

## Tests

```bash
npm test
```

---

## Déploiement sur le PC de l'enfant

### Première installation

1. **Builder l'installeur** sur la machine de développement :

   ```bash
   npm run dist
   ```

   Génère `release/MiniGram Setup <version>.exe`.

2. **Copier l'installeur** sur le PC de l'enfant (clé USB, partage réseau, etc.) et le lancer. L'assistant d'installation est en français ; il crée un raccourci bureau et un raccourci dans le menu Démarrer.

### Publier une mise à jour

Les mises à jour sont distribuées via [GitHub Releases](https://github.com/sputier/minigram/releases). L'app vérifie automatiquement au démarrage si une nouvelle version est disponible et la télécharge en arrière-plan. L'enfant reçoit une notification pour redémarrer ; aucune manipulation n'est nécessaire côté PC de l'enfant.

**Procédure de mise à jour :**

1. Modifier le code.

2. Bumper la version dans `package.json` :

   ```json
   "version": "0.2.0"
   ```

3. Builder le nouvel installeur :

   ```bash
   npm run dist
   ```

4. Publier la release sur GitHub (nécessite [GitHub CLI](https://cli.github.com/) authentifié) :

   ```bash
   gh release create v0.2.0 \
     "release/MiniGram Setup 0.2.0.exe" \
     "release/MiniGram Setup 0.2.0.exe.blockmap" \
     "release/latest.yml" \
     --title "MiniGram v0.2.0" \
     --notes "Description des changements."
   ```

   Au prochain démarrage de l'app chez l'enfant, elle détecte la nouvelle version, la télécharge silencieusement, et propose un redémarrage.

---

## Configuration initiale du compte Telegram

La session TDLib doit être initialisée une fois par le parent :

1. Lancer l'app en développement (`npm run dev`)
2. Ouvrir le gate admin (`Ctrl+Alt+Shift+P`), saisir le mot de passe
3. Entrer le numéro de téléphone de l'enfant et suivre le flow d'authentification Telegram
4. Une fois connecté, la whitelist est auto-peuplée avec les conversations existantes

La session chiffrée est stockée dans `%AppData%\MiniGram\td_db`. Elle persiste entre les redémarrages ; l'enfant ne voit jamais le flow d'authentification.

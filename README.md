# Multiplayer Blackjack

Browser-based multiplayer blackjack. Host on GitHub Pages, play with friends via room code.

## Setup

### 1. Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project
3. Add a Web app — copy the config object
4. Enable **Realtime Database** (start in test mode, then apply rules below)
5. Enable **Authentication → Anonymous**

### 2. Configure the app

Edit `firebase-config.js` and paste your Firebase config values.

### 3. Deploy Firebase security rules

Install the Firebase CLI: `npm install -g firebase-tools`

```bash
firebase login
firebase init database   # select your project, use existing rules file
firebase deploy --only database
```

### 4. Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to Settings → Pages → Source: Deploy from branch → `main` / root
3. Share your `https://yourusername.github.io/repo-name/` URL

## Playing

1. Host visits the site, enters name, clicks **Create Game**
2. Share the 5-character room code with friends
3. Friends enter name + code, click **Join Game**
4. Host configures rules in the lobby settings panel
5. Host clicks **Start Game**

## Running tests (engine logic only)

```bash
node tests/engine.test.mjs
```

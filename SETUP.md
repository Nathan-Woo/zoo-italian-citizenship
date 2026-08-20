# Zoo's Italian Citizenship — Setup Guide

Same pattern as Zoo's Joint Finances: a static site (no build step) using
Firebase for Auth + Firestore + Storage, edited in VS Code, hosted on
GitHub Pages. Sign-in is Google-only (no passwords).

---

## 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Name it something like `zoo-italian-citizenship`. Google Analytics is optional — skip it if you want.
3. Once created, click the **`</>`** (web) icon to register a web app. Name it anything (e.g. "web"). You don't need Firebase Hosting checked — you're deploying via GitHub Pages.
4. Firebase shows you a `firebaseConfig` object. Copy it — you'll paste it into the app in step 4.

## 2. Turn on Auth, Firestore, and Storage

**Authentication**
- **Build → Authentication → Get started**.
- Under **Sign-in method**, enable **Google**. Pick a support email (your own is fine) and save. That's the whole setup — no OAuth consent screen fiddling needed for basic sign-in with just email/profile.

**Firestore Database**
- **Build → Firestore Database → Create database**.
- **Important: when it asks for a Database ID, use `(default)`** (this is usually the pre-filled default option — don't rename it). Renaming it means the app's Firestore client would need to be told that exact name explicitly in `js/firebase-init.js`, which is easy to forget and produces a confusing "client is offline" error that looks like a network problem but isn't.
- Start in **production mode** (we'll paste in real rules next). Pick a region close to you (e.g. `us-west1` for LA).

**Storage** (for the voice recordings)
- **Build → Storage → Get started**. Production mode, same region.
- Note: Storage requires the **Blaze (pay-as-you-go)** plan, but for two people recording short clips you're very unlikely to be charged anything. If you'd rather skip billing, leave every quiz item's prompt/response mode set to "Typed" — everything else works on the free Spark plan.

## 3. Paste in the security rules

- **Firestore Database → Rules** tab → replace the contents with everything in `firestore.rules` from this project → **Publish**.
- **Storage → Rules** tab → replace the contents with everything in `storage.rules` from this project → **Publish**.

These rules mean: only signed-in Google accounts can read app data, only a master profile can create/edit content, quizzes, and rewards, and each profile can only write its own submissions and self-study logs.

## 4. Open the project in VS Code

1. Unzip the project folder you downloaded from this chat.
2. Open the folder in VS Code (`File → Open Folder…`).
3. Open `js/firebase-init.js` and paste in the `firebaseConfig` values from step 1:

   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "...",
   };
   ```

4. Install the **Live Server** extension (if you don't already have it from the finance app) and click **Go Live** to preview locally at `http://localhost:5500`.

## 5. Approve the two of you to sign in

The app only lets pre-approved Google emails sign in.

- In Firebase Console → **Firestore Database → Data**, create a collection called `allowedEmails`.
- Add one document per person: **Document ID = their Google email address, all lowercase** (e.g. `nate@gmail.com`). The document's contents don't matter — a field like `addedAt: (any value)` is fine.
- Do this for both your email and Ari's, using whichever email each of you signs into Google with.

## 6. Set up the AI content-suggestion feature (optional)

The "✨ Suggest for me" button in Content Library calls a small Cloud Function, which is the only piece of this app that isn't just static files — it exists so your Anthropic API key stays on a server and never sits in browser code where anyone could see it.

1. **Get an Anthropic API key**: sign up / log in at [console.anthropic.com](https://console.anthropic.com), go to **API Keys**, and create one. Note that this uses your own Anthropic account and billing — it's separate from Firebase, and normal per-request API pricing applies (suggestion requests are small and cheap, but not free).
2. **Install the Firebase CLI** (skip if you already have it): `npm install -g firebase-tools`, then `firebase login`.
3. From the project folder root (not `functions/`), run `firebase use --add` and pick your `zoo-italian-citizenship` project.
4. Store your API key as a secret (never commit it to a file): 
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
   Paste the key when prompted.
5. Install the function's dependencies and deploy:
   ```bash
   cd functions
   npm install
   cd ..
   firebase deploy --only functions
   ```
6. Cloud Functions (2nd gen) also requires the **Blaze plan** — same one Storage needs, so if you already enabled Storage you're covered.

If you'd rather skip this entirely, the rest of the app works fine without it — the Suggest button will just show an error if clicked, and you can add content manually instead.

## 7. Open the project in VS Code

1. Unzip the project folder you downloaded from this chat.
2. Open the folder in VS Code (`File → Open Folder…`).
3. Open `js/firebase-init.js` and paste in the `firebaseConfig` values from step 1:

   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "...",
   };
   ```

4. Install the **Live Server** extension (if you don't already have it from the finance app) and click **Go Live** to preview locally at `http://localhost:5500`.

## 8. Push it to GitHub

1. Create a new repo on GitHub (e.g. `zoo-italian-citizenship`).
2. In VS Code's terminal, from the project folder:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/zoo-italian-citizenship.git
   git push -u origin main
   ```

   (`functions/node_modules` and any `.env` files are already excluded via `.gitignore` — your API key never gets committed.)

3. On GitHub: **Settings → Pages** → **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)** → **Save**.
4. After a minute or two, GitHub gives you a live URL like `https://YOUR_USERNAME.github.io/zoo-italian-citizenship/`.

## 9. Authorize that domain in Firebase

- Firebase Console → **Authentication → Settings → Authorized domains** → **Add domain** → paste just the domain (`YOUR_USERNAME.github.io`, no `https://` or path).
- Without this, the Google sign-in popup will fail on the live site (it works fine on `localhost` regardless, since Firebase authorizes that by default).

## 10. Try it out

1. Visit your GitHub Pages URL and click **Sign in with Google**.
2. First time in, you'll pick a **username** and then **Studente or Maestro** — pick **Maestro** for yourself first. The username is what shows up on rosters and grading screens, separate from your Google account name.
3. Go to **Content Library** and add your first vocab words (Italian, English, an optional hint, and a voice recording if you enabled Storage), or try **✨ Suggest for me** if you set up the AI feature.
4. Optionally group related entries into a **pack** (Content Library → Manage packs) — e.g. "Chapter 3" or "Restaurant vocab."
5. Go to **Roster** and add Ari by her username once she's signed in and chosen Studente (or use the "+ Add my own account as a student" shortcut to test the student side yourself, right now, on the same login).
6. Build a quiz in **Quizzes** — search for content, tap the four small toggles to set prompt/response language and mode, or add a whole pack at once.

---

## How the features map to the app

| Your request | Where it lives |
|---|---|
| Google sign-in, no password | Sign-in screen; gated by the `allowedEmails` collection |
| First screen picks Student/Master, with a username | Role-choice screen, shown the first time a signed-in account has no profile yet — username is required and checked for uniqueness |
| Switch roles on one account, kept as separate "account files" | The role-switch pill in the nav (once both exist) — each role is its own Firestore document (`{uid}_student` / `{uid}_master`) with its own points, submissions, self-study log, etc. |
| Master chooses which students they manage (including their own account) | **Roster** tab — add by username, or the "+ Add my own account as a student" shortcut |
| Vocab/phrases/sentences/conjugations w/ Italian, English, hint, voice recording | **Content Library** tab (master only) |
| Language "packs" to categorize content | **Content Library → Manage packs** — assign any entry to one or more packs; use packs to bulk-add a whole set to a quiz, or filter self-study by pack |
| AI-suggested content based on the student's progress | **Content Library → ✨ Suggest for me** — needs the optional Cloud Function setup (step 6) |
| Easier quiz building — search content, compact controls, add whole packs | **Quizzes → Build a quiz**: type-to-search content picker, four small tap-to-cycle toggles (Prompt language/mode, Reply language/mode) instead of stacked dropdowns, and a "+ Add entire pack" button |
| Master-built pop quizzes, mixed prompt/response modes, assigned to chosen roster members | **Quizzes** tab → "Build a quiz" — pick which of your roster students get it |
| Manual grading + points | **Quizzes** tab → "Grade" on any quiz with submissions |
| Point milestones / rewards | **Rewards** tab (master) / progress bars on the student **Dashboard** |
| Weekly/monthly/yearly progress | Student **Dashboard**, bar chart with a Week/Month/Year toggle |
| Open vs. past quizzes | Student **Quizzes** tab |
| Flashcard practice by category | Student **Practice** tab |
| Self-study mini-quiz, auto-graded, student picks item count and pack, daily point cap | Student **Self-Study** tab; cap is configured by the master in **Settings** |

## Notes & things worth knowing

- **Audio fix**: recordings were previously always labeled `audio/webm` no matter what the browser actually recorded — fine on Chrome (which defaults to webm), broken on Safari (which uses mp4/aac and doesn't support webm at all), which is why playback showed "error." The recorder now detects and honors whatever format the browser actually used, both for local preview and for what gets uploaded. If you'd already recorded clips before this fix, they may still be mislabeled in Storage and need re-recording.
- **Quiz prompts now reuse the content library's own recording** — building a quiz with an audio prompt no longer requires recording it again at quiz-build time; it just uses whatever's attached to that content item. If an item has no recording yet, add one in the Content Library first (or use Typed instead).
- **Data model**: there's no more `users` collection — everything lives under `profiles/{profileId}`, where `profileId` is `{googleUid}_student` or `{googleUid}_master`. Usernames are stored on each profile (`displayName` + a lowercase `usernameLower` for lookups) and must be unique across the app.
- **Roster-based visibility**: a master only sees/grades quizzes for students on their own roster. If you and Ari are both masters at some point, your rosters stay independent.
- **Alternate accepted answers**: in the Content Library, separate acceptable English translations with a `/`, e.g. `to eat / eating` — the self-study grader accepts any of them.
- Same trust model as before: once a Google account has a master profile, the app trusts it — Firestore rules check for the existence of that profile doc, not any deeper vetting. Fine for a 2-person app; just keep the `allowedEmails` list tight.

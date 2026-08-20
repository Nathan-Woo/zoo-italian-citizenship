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

## 6. Push it to GitHub

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

3. On GitHub: **Settings → Pages** → **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)** → **Save**.
4. After a minute or two, GitHub gives you a live URL like `https://YOUR_USERNAME.github.io/zoo-italian-citizenship/`.

## 7. Authorize that domain in Firebase

- Firebase Console → **Authentication → Settings → Authorized domains** → **Add domain** → paste just the domain (`YOUR_USERNAME.github.io`, no `https://` or path).
- Without this, the Google sign-in popup will fail on the live site (it works fine on `localhost` regardless, since Firebase authorizes that by default).

## 8. Try it out

1. Visit your GitHub Pages URL and click **Sign in with Google**.
2. First time in, you'll be asked **Studente or Maestro** — pick **Maestro** for yourself first.
3. Go to **Content Library** and add your first vocab words (Italian, English, an optional hint, and a voice recording if you enabled Storage).
4. Go to **Roster** and add Ari once she's signed in and chosen Studente (or use the "+ Add my own account as a student" shortcut to test the student side yourself, right now, on the same login).
5. Build a quiz in **Quizzes**, check off who it's assigned to, and grade submissions as they come in.

---

## How the features map to the app

| Your request | Where it lives |
|---|---|
| Google sign-in, no password | Sign-in screen; gated by the `allowedEmails` collection |
| First screen picks Student/Master | Role-choice screen, shown the first time a signed-in account has no profile yet |
| Switch roles on one account, kept as separate "account files" | The role-switch pill in the nav (once both exist) — each role is its own Firestore document (`{uid}_student` / `{uid}_master`) with its own points, submissions, self-study log, etc. |
| Master chooses which students they manage (including their own account) | **Roster** tab — add by email, or the "+ Add my own account as a student" shortcut, which creates/reuses your student profile and adds it to your own roster |
| Vocab/phrases/sentences/conjugations w/ Italian, English, hint, voice recording | **Content Library** tab (master only) |
| Master-built pop quizzes, mixed prompt/response modes, assigned to chosen roster members | **Quizzes** tab → "Build a quiz" — pick which of your roster students get it |
| Manual grading + points | **Quizzes** tab → "Grade" on any quiz with submissions |
| Point milestones / rewards | **Rewards** tab (master) / progress bars on the student **Dashboard** |
| Weekly/monthly/yearly progress | Student **Dashboard**, bar chart with a Week/Month/Year toggle |
| Open vs. past quizzes | Student **Quizzes** tab |
| Flashcard practice by category | Student **Practice** tab |
| Self-study mini-quiz, auto-graded, student picks item count, daily point cap | Student **Self-Study** tab; cap is configured by the master in **Settings** |

## Notes & things worth knowing

- **About the "client is offline" error**: that's a generic Firestore SDK error, usually meaning either (a) `firebase-init.js` still has placeholder config values instead of your real ones, (b) an ad-blocker/extension is blocking Firestore's connection, or (c) an actual network problem. Switching to Google sign-in also removes the one Firestore read that used to happen *before* authentication (checking the allowlist pre-signup) — that pre-auth read was a likely source of exactly this error, since unauthenticated reads are handled more strictly by the SDK. If you still see it after re-checking your config values, try a hard refresh and a different network.
- **Data model**: there's no more `users` collection — everything lives under `profiles/{profileId}`, where `profileId` is `{googleUid}_student` or `{googleUid}_master`. This is what makes the same Google login able to hold two fully separate accounts.
- **Roster-based visibility**: a master only sees/grades quizzes for students on their own roster. If you and Ari are both masters at some point, your rosters stay independent.
- **Audio format**: recordings save as `.webm` via the browser's `MediaRecorder`. Works well in Chrome/Edge/Firefox; Safari's recording support is a bit newer/spottier — test on Ari's device early if she's on iPhone.
- **Alternate accepted answers**: in the Content Library, separate acceptable English translations with a `/`, e.g. `to eat / eating` — the self-study grader accepts any of them.
- Same trust model as before: once a Google account has a master profile, the app trusts it — Firestore rules check for the existence of that profile doc, not any deeper vetting. Fine for a 2-person app; just keep the `allowedEmails` list tight.

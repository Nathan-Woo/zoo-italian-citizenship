# Zoo's Italian Citizenship — Setup Guide

Same pattern as Zoo's Joint Finances: a static site (no build step) using
Firebase for Auth + Firestore + Storage, edited in VS Code, hosted on
GitHub Pages.

---

## 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Name it something like `zoo-italian-citizenship`. Google Analytics is optional — you can skip it.
3. Once created, click the **`</>`** (web) icon to register a web app. Name it anything (e.g. "web"). You don't need Firebase Hosting checked — you're deploying via GitHub Pages.
4. Firebase shows you a `firebaseConfig` object. Copy it — you'll paste it into the app in step 4.

## 2. Turn on Auth, Firestore, and Storage

**Authentication**
- In the left sidebar: **Build → Authentication → Get started**.
- Under **Sign-in method**, enable **Email/Password**.

**Firestore Database**
- **Build → Firestore Database → Create database**.
- Start in **production mode** (we'll paste in real rules next). Pick a region close to you (e.g. `us-west1` for LA).

**Storage** (for the voice recordings)
- **Build → Storage → Get started**. Production mode, same region.
- Note: Storage requires the project to be on the **Blaze (pay-as-you-go)** plan, but Blaze still has a generous free tier — for two users recording short clips, you're very unlikely to be charged anything. If you'd rather not add billing, you can launch without recordings by leaving `promptMode`/`responseMode` set to "Typed" everywhere — everything else works on the free Spark plan.

## 3. Paste in the security rules

- **Firestore Database → Rules** tab → replace the contents with everything in `firestore.rules` from this project → **Publish**.
- **Storage → Rules** tab → replace the contents with everything in `storage.rules` from this project → **Publish**.

These rules mean: only signed-in users can read app data, only a "master" account can create/edit content, quizzes, and rewards, and students can only write their own submissions and self-study logs.

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

4. Install the **Live Server** extension in VS Code (if you don't already have it from the finance app) and click **Go Live** at the bottom-right to preview locally at `http://localhost:5500`.

## 5. Approve the two of you to sign up

The app only lets pre-approved emails create an account.

- In Firebase Console → **Firestore Database → Data**, create a collection called `allowedEmails`.
- Add one document per person: **Document ID = their email address, all lowercase** (e.g. `nate@gmail.com`). The document's contents don't matter — a single field like `addedAt: (any value)` is fine.
- Do this for both your email and Ari's.

Once an email is approved, that person can go to the app, choose **Create an account**, enter that email, set a password, pick a display name, and choose **Studente** or **Maestro**. You'll probably want to be the Maestro so you can build out the content library and quizzes first.

*(Once you have a master account, there's also a note in the app's Settings tab reminding you how to approve new emails — handy for later.)*

## 6. Push it to GitHub

1. Create a new repo on GitHub (e.g. `zoo-italian-citizenship`) — public or private both work for GitHub Pages, though private Pages requires GitHub Pro.
2. In VS Code's terminal, from the project folder:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/zoo-italian-citizenship.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages** → under "Build and deployment," set **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)** → **Save**.
4. After a minute or two, GitHub gives you a live URL like `https://YOUR_USERNAME.github.io/zoo-italian-citizenship/`.

## 7. Authorize that domain in Firebase

- Firebase Console → **Authentication → Settings → Authorized domains** → **Add domain** → paste your `github.io` URL's domain (just `YOUR_USERNAME.github.io`, no `https://` or path).
- Without this step, login will fail on the live site (it'll work fine on `localhost` regardless).

## 8. Try it out

- Visit your GitHub Pages URL, sign up as the Maestro, and head to **Content Library** to add your first vocab words (Italian, English, an optional hint, and a voice recording if you enabled Storage).
- Build a quiz in the **Quizzes** tab, assign it to "all students" or to Ari specifically once she's signed up.
- Have Ari sign up as **Studente** — she'll see her dashboard, open quizzes, flashcards, and self-study.

---

## How the features map to the app

| Your request | Where it lives |
|---|---|
| Master/student account types | Chosen at signup, stored on `users/{uid}.role`, gates the whole nav |
| Vocab/phrases/sentences/conjugations w/ Italian, English, hint, voice recording | **Content Library** tab (master only) |
| Master-built pop quizzes, mixed prompt/response modes (text or the master's/student's own recording, either language direction) | **Quizzes** tab → "Build a quiz" |
| Manual grading + points | **Quizzes** tab → "Grade" on any quiz with submissions |
| Point milestones / rewards | **Rewards** tab (master) / shown with progress bars on the student **Dashboard** |
| Weekly/monthly/yearly progress | Student **Dashboard**, bar chart with a Week/Month/Year toggle |
| Open vs. past quizzes | Student **Quizzes** tab |
| Flashcard practice by category | Student **Practice** tab |
| Self-study mini-quiz, auto-graded, student picks item count, daily point cap | Student **Self-Study** tab; cap is configured by the master in **Settings** |

## Notes & things worth knowing

- **Audio format**: recordings are saved as `.webm` via the browser's `MediaRecorder`. This plays back fine in Chrome/Edge/Firefox; Safari's support is spottier for recording (playback of `.webm` audio works, but recording may need the newest Safari). If Ari's using an iPhone, test recording in Safari first — if it's flaky there, Chrome on iOS uses the same underlying WebKit engine so the issue would persist; a native app wrapper would be the fix down the line, but for a first version, typed responses work everywhere.
- **Grading is manual for quizzes, automatic for self-study.** That was on purpose per your spec — self-study grades itself by matching text (accent- and case-insensitive, ignores leading articles like "il/la/the"), while master-built quizzes always go through your review, since audio responses can't be auto-graded and you may want partial credit judgment either way.
- **Alternate accepted answers**: in the Content Library, separate acceptable English translations with a `/`, e.g. `to eat / eating` — the self-study grader accepts any of them.
- This is a 2-person trust model, same as the finance app: once someone's account is created as "Maestro," the app itself doesn't second-guess that — Firestore rules trust whatever role is on their `users/{uid}` doc. Fine for the two of you; just don't share the master signup email with anyone else.

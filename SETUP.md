# Zoo's Italian Citizenship — Setup Guide

Same pattern as Zoo's Joint Finances: a static site (no build step) using
Firebase for Auth + Firestore + Storage, edited in VS Code, hosted on
GitHub Pages. Sign-in is Google-only (no passwords), and **anyone can
join** — there's a separate, narrower "admin" tier for elevated powers
(see step 5).

---

## 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Name it something like `zoo-italian-citizenship`. Google Analytics is optional — skip it if you want.
3. Once created, click the **`</>`** (web) icon to register a web app. Name it anything (e.g. "web"). You don't need Firebase Hosting checked — you're deploying via GitHub Pages.
4. Firebase shows you a `firebaseConfig` object. Copy it — you'll paste it into the app in step 3.

## 2. Turn on Auth, Firestore, and Storage

**Authentication**
- **Build → Authentication → Get started**.
- Under **Sign-in method**, enable **Google**. Pick a support email (your own is fine) and save.

**Firestore Database**
- **Build → Firestore Database → Create database**.
- **Important: when it asks for a Database ID, use `(default)`** (the pre-filled option — don't rename it). A custom name means the app's Firestore client needs to be told that exact name explicitly, which is easy to forget and produces a confusing "client is offline" error that looks like a network problem but isn't.
- Start in **production mode** (we'll paste in real rules next). Pick a region close to you (e.g. `us-west1` for LA).

**Storage** (for voice recordings)
- **Build → Storage → Get started**. Production mode, same region.
- Requires the **Blaze (pay-as-you-go)** plan, but for casual use you're very unlikely to be charged anything. Skip it and leave everything set to "Typed" if you'd rather stay on the free plan.

Paste in the security rules: **Firestore Database → Rules** tab → replace with everything in `firestore.rules` → **Publish**; **Storage → Rules** tab → replace with everything in `storage.rules` → **Publish**.

## 3. Open the project in VS Code

1. Unzip the project folder you downloaded from this chat.
2. Open the folder in VS Code.
3. Open `js/firebase-init.js` and paste in the `firebaseConfig` values from step 1.
4. Install the **Live Server** extension and click **Go Live** to preview locally at `http://localhost:5500`.

## 4. Push it to GitHub and enable Pages

1. Create a new repo on GitHub (e.g. `zoo-italian-citizenship`), then from the project folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/zoo-italian-citizenship.git
   git push -u origin main
   ```
2. GitHub → **Settings → Pages** → **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)** → **Save**. You'll get a URL like `https://YOUR_USERNAME.github.io/zoo-italian-citizenship/`.
3. Firebase Console → **Authentication → Settings → Authorized domains** → **Add domain** → paste just `YOUR_USERNAME.github.io`. Without this, Google sign-in fails on the live site (it works fine on `localhost` regardless).

## 5. Grant admin access

Anyone can sign in and use the app as a regular master or student — no approval needed. **Admin** is a separate, optional privilege layer for whoever should have final say: switching freely between Studente/Maestro to test things, editing *any* master's content library, setting pack point bonuses, and setting the global self-study point rates.

- In Firebase Console → **Firestore Database → Data**, create a collection called `adminEmails`.
- Add a document with **Document ID = the person's Google email, all lowercase** (e.g. `nate@gmail.com`). Field contents don't matter.
- Admin status is checked fresh against this collection every time — it's not something a client can spoof by editing their own profile.
- Grant this to yourself, and to Ari if you want her to have the same level of control.

## 6. Set up the AI content-suggestion feature (optional)

The "✨ Suggest for me" button in Content Library calls a small Cloud Function — the only piece of this app that isn't just static files — so your Anthropic API key stays server-side and never sits in browser code.

1. Get an API key at [console.anthropic.com](https://console.anthropic.com) → **API Keys**. This is separate billing from Firebase — normal per-request pricing applies (cheap, but not free).
2. `npm install -g firebase-tools`, then `firebase login`.
3. From the project root, `firebase use --add` → pick your project.
4. `firebase functions:secrets:set ANTHROPIC_API_KEY` (paste the key when prompted — never commit it to a file).
5. `cd functions && npm install && cd .. && firebase deploy --only functions`.
6. Requires the Blaze plan (same as Storage).

Skippable — the rest of the app works without it.

## 7. Try it out

1. Visit your GitHub Pages URL and click **Sign in with Google**.
2. Pick a **username**, then **Studente or Maestro**. Usernames show up on rosters and grading screens instead of email addresses, and must be unique.
3. As a master: add content in **Content Library** (Italian, English, hint, optional recording), group things into **packs**, and check out **✨ Suggest for me**.
4. Go to **Roster** and add a student by username, or use "+ Add my own account as a student" to test both sides at once (admin accounts only, for role-switching — see below).
5. Check the new **Browse** tab (both roles) to see every other master's library and choose to include or hide it.
6. Build a quiz — search content, tap the four compact toggles, or add a whole pack in one click.

---

## How the features map to the app

| Your request | Where it lives |
|---|---|
| Anyone can join, no approval — approved accounts just get more power | Sign-in is open to any Google account; `adminEmails` grants the elevated admin tier described in step 5 |
| Admins can switch between student/master; everyone else picks one role | The role-switch pill / "+ Try as X" only appears for admin accounts |
| Admins can manage the entire content library for every user | Content Library shows an "Owner" badge and lets an admin edit/delete any master's items when signed in as admin |
| Every master has their own content, uneditable by other masters | Content/packs carry a `createdBy` owner; only the owner (or an admin) can edit or delete |
| Masters can view others' content and hide it from their own view | **Browse** tab → **Hide** (and **Unhide** from the hidden list) |
| A tab to see everyone's content/packs and opt in | **Browse** tab (both master and student nav) → **Include** pulls another master's library into your own usable pool |
| Students choose which packs/masters to study from | Student **Practice** and **Self-Study** tabs get a **Source** filter (when more than one is available) alongside category and pack filters |
| Admins assign point values to packs for a "perfect" self-study bonus | Content Library → Manage packs → admin-only "Perfect-round bonus" field per pack |
| Admins set global self-study point rates, including single- vs. multi-master rounds | **Settings** tab (admin-editable; visible read-only to regular masters) — separate rates for single-source and multi-source rounds |
| Vocab/phrases/sentences/conjugations w/ hint + voice recording | **Content Library** |
| Quiz building: search content, compact controls, add whole packs | **Quizzes → Build a quiz** |
| Manual grading + points, rewards, weekly/monthly/yearly progress | **Quizzes** (grade), **Rewards**, student **Dashboard** |

## Notes & things worth knowing

- **Sharing is master-level, not pack-level**: including another master's library pulls in *all* their packs/content, not one pack at a time — kept this way to keep the mental model (and the Browse UI) simple. If that turns out to be too coarse in practice, pack-level inclusion is a reasonable follow-up.
- **Audio fix**: recordings were previously always labeled `audio/webm` regardless of what the browser actually recorded — fine on Chrome, broken on Safari (mp4/aac, no webm support), which is why playback showed "error." Fixed to detect and honor the real format. Anything recorded before this fix may need re-recording.
- **Quiz prompts reuse the content library's own recording** — no separate recording step at quiz-build time. If an item has no recording, either add one in Content Library or use Typed.
- **Data model**: no `users` collection — everything lives under `profiles/{profileId}` (`{googleUid}_student` / `{googleUid}_master`). Usernames must be unique app-wide.
- **Admin status isn't retroactive on existing profiles in a meaningful way** — it's checked live against `adminEmails` every time the app loads or a security rule evaluates, so adding/removing someone from that collection takes effect immediately, no profile edits needed.
- **Alternate accepted answers**: separate acceptable English translations with `/`, e.g. `to eat / eating`.

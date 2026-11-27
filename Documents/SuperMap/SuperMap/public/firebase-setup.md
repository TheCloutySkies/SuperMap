# Firebase setup — exact steps

Project: **good-palantir** · Owner account: **lonnie034@gmail.com** · Console: https://console.firebase.google.com/project/good-palantir/overview

Everything below is done once, in this order. Steps 1–3 happen in the Firebase console, 4–5 on this Mac, 6–7 in GitHub and Vercel.

---

## 1. Turn on the three sign-in methods

Console → **Authentication** → **Get started** (first time only) → **Sign-in method** tab.

| Provider | What to do | Value |
| --- | --- | --- |
| **Email/Password** | Enable → Save | leave "Email link (passwordless)" **off** |
| **Google** | Enable → set *Project public-facing name* `Good Palantir`, *Project support email* `lonnie034@gmail.com` → Save | the OAuth client is created for you |
| **Anonymous** | Enable → Save | needed for "continue without an account" |

Then **Authentication** → **Settings** tab → **Authorized domains** → **Add domain**, and add your live site's host:

- `good-palantir.vercel.app` (or your custom domain, if you have one)

`localhost` and `good-palantir.firebaseapp.com` are already there. Without this, Google sign-in on Vercel fails with `auth/unauthorized-domain`.

> The `"auth"` block in `firebase.json` is a written record only — the CLI ignores it. The console is the only place these providers are switched on.

## 2. Turn on Storage

Console → **Build** → **Storage** → **Get started**.

- Rules: **Start in production mode** (the real rules ship from `storage.rules` in step 5).
- Location: **pick the same region your Firestore uses** (Firestore → Database → the region shown at the top). This cannot be changed later — a bucket in the wrong region cannot be moved, only deleted and made again.

When it finishes, the **Files** tab shows the bucket name at the top. It is one of:

- `good-palantir.firebasestorage.app` — projects created after 30 Oct 2024 (most likely)
- `good-palantir.appspot.com` — older projects

Write it down exactly. That string is `VITE_FIREBASE_STORAGE_BUCKET` in step 6 and nowhere else is it written with `gs://`.

## 3. Copy the web app config

Console → **Project settings** (gear, top left) → **General** → *Your apps* → the **Web** app (`</>`) → *SDK setup and configuration* → **Config**.

You get six values. They map one-to-one to the six env variables:

| Config key | Env variable |
| --- | --- |
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` (`good-palantir.firebaseapp.com`) |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` (`good-palantir`) |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` (the bucket name from step 2) |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` (`1:…:web:…`) |

If there is no Web app yet: **Add app** → Web → nickname `SuperMap` → **Register app**, then copy the config.

## 4. Log the CLI in (on this Mac)

From `Documents/SuperMap/SuperMap` (the folder holding `firebase.json`):

```bash
cd "/Users/cloutyskies/CloutyKey/SuperMap/Documents/SuperMap/SuperMap"
npx firebase-tools@latest login          # opens the browser, sign in as lonnie034@gmail.com
npx firebase-tools@latest use good-palantir
```

`.firebaserc` already points at `good-palantir`, so `use` is only a confirmation.

## 5. Deploy the rules and indexes

Storage rules only deploy once the bucket from step 2 exists.

```bash
cd "/Users/cloutyskies/CloutyKey/SuperMap/Documents/SuperMap/SuperMap"
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes,storage
```

What that publishes:

- `firestore.rules` — chat messages may now carry `media` or `item` with no `body`, a photo's timer is capped at 7 days, `email_verified` is required for the owner, and the `typing`, `secure_drops`, `admin_actions` and `audit` rules go live.
- `firestore.indexes.json` — the `conversations` index (`memberUids` array-contains + `updatedAtMs` desc). Building takes a few minutes; **Firestore → Indexes** shows *Building*, then *Enabled*.
- `storage.rules` — `chat_media/{conversationId}/{file}` readable and deletable only by the two members stamped in the object's metadata, images only, 10 MB; `secure_drops/{id}` open-read ciphertext, signed-in create, 100 MB ceiling.

Expected output ends with `Deploy complete!`. A first Storage deploy may print `Cloud Storage has not been set up` — finish step 2 and run it again.

## 6. Put the six values in Vercel

Vercel → your frontend project → **Settings** → **Environment Variables** → add each of the six `VITE_FIREBASE_*` names from step 3, with the exact value copied from the config, ticked for **Production** and **Preview**.

Then **Deployments** → the latest → **⋯** → **Redeploy** (an env change is only read by a new build; the running site keeps the old values).

`VITE_*` values are compiled into the browser bundle — that is fine for the six above (they are public identifiers, not secrets) and `VITE_FIREBASE_STORAGE_BUCKET` must be there or the Photo button stays disabled by design.

## 7. Service account for the GitHub Actions workers

Console → **Project settings** → **Service accounts** → **Generate new private key** → **Generate key**. A `.json` file downloads once — it is a secret.

GitHub → `TheCloutySkies/SuperMap` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | the whole downloaded JSON, on one line (open the file, copy everything) |
| `FIREBASE_PROJECT_ID` | `good-palantir` |

Never put that JSON in Vercel, in a `VITE_*` variable, or in the repository. If the key is ever exposed, delete it in the console (**Service accounts** → the key → delete) and generate a new one.

## 8. Optional backstop: Firestore TTL

Console → **Firestore Database** → **TTL** tab → **Create policy**, twice:

| Collection group | Timestamp field |
| --- | --- |
| `secure_drops` | `expiresAt` |
| `messages` | `expiresAt` |

TTL deletes **documents**, never Storage objects — the GitHub sweeper is what removes the photos and drops themselves.

## 9. Check it works

1. **Owner gate** — sign in on the site with Google as `lonnie034@gmail.com`, open the account dock → **Settings**: *Owner tools* (`ModerationPanel`) is visible. Sign in with another account: it is not.
2. **Storage connected** — in a chat, the **Photo** button is enabled (not greyed with "Photos need the live account database").
3. **A photo travels** — two browsers, two accounts, same chat: attach an image → both show it; **Storage → Files** shows `chat_media/<conversationId>/<messageId>`.
4. **Rules say no** — a third account signed in to the app, in the browser console:
   ```js
   const { getStorage, ref, getBytes } = await import('/node_modules/.vite/deps/firebase_storage.js')
   await getBytes(ref(getStorage(), 'chat_media/<conversationId>/<messageId>'))
   ```
   It rejects with `storage/unauthorized`. The same path with one of the two members does not.
5. **Countdown** — send a message with **This message → 30 seconds**: both panes count `0:30 → 0:00` and the row disappears on both, and the dock badge drops by one.

## If something fails

| Message | Cause | Fix |
| --- | --- | --- |
| `auth/unauthorized-domain` | the site's host is not authorised | step 1 → Authorized domains → add the host |
| `auth/operation-not-allowed` | provider off | step 1 → enable that provider |
| Photo button disabled | no `VITE_FIREBASE_STORAGE_BUCKET` at build time | step 6, then redeploy |
| `storage/unauthorized` on upload | the object has no `memberA`/`memberB` metadata, or the wrong bucket | check `chatMedia.js` uploads with both uids; check the bucket name |
| `Cloud Storage has not been set up` on deploy | step 2 not finished | enable Storage, deploy again |
| `Missing or insufficient permissions` on messages | old Firestore rules still live | step 5 (`--only firestore:rules`) |
| Owner tools missing for the owner | the account's email is not verified | verify that Google account's email; rules need `email_verified == true` |
| Index error on opening a chat | the conversation index is still building | wait for **Firestore → Indexes** to say *Enabled* |

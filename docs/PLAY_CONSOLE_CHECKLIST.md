# Google Play Console — step-by-step checklist (for beginners)

Follow the parts in order. Tick each box as you go. **Nothing here puts the app in front of the public** — that only happens if
you press *Promote to production* yourself, much later. Google's screens are sometimes reworded; if a button has a slightly
different name, look for the closest one.

> **Safety rules:** never send anyone (including me) your card details, your Google password, your upload-key file, or any password.
> The only things you will ever need to copy into the project are *public*: the licence key from Play Console and the product ID.

---

## Part A — What you need

- [ ] A **Google account** you will use for the developer account (a dedicated one is best).
- [ ] The one-time **developer registration fee** and ID verification (Google asks for this; it can take a few days).
- [ ] A **computer** (Windows, Mac or Linux) — see Part F for the two ways to build; one needs no installation.
- [ ] An **Android phone** with the Google Play Store, signed in to a Google account you will use as a *tester*.
- [ ] A **web page for your privacy policy** (Part J explains the free way).

## Part B — Decide the app's permanent ID (do this before Part C)

The app's **package name** is its permanent identity on Google Play. It can **never** be changed after the first upload.
The project uses `app.freelanche.tracker`.

- [ ] Happy with `app.freelanche.tracker`? Then do nothing.
- [ ] Want a different one (for example `com.yourname.freelanche`)? Tell me **before** you do Part C and I will change it everywhere safely.

## Part C — Create the app

1. [ ] Open <https://play.google.com/console> → **Create app**.
2. [ ] App name: **Freelanche** · Default language: **English (United States)** · **App** (not Game) · **Paid** is fine (subscriptions are inside the app) → tick the declarations → **Create app**.
3. [ ] Left menu → **Dashboard**. Google shows a list of "set up your app" tasks. You will finish them in Part J.

## Part D — Get the licence key (a public code the app needs)

The app uses it to check that purchases really come from Google (it blocks fake "unlocker" apps). Release builds will **refuse to build** without it.

1. [ ] Left menu → **Monetize with Play** → **Monetization setup** (wording may vary slightly).
2. [ ] Find **Licensing** → **Licence key** (a long text like `MIIBIjANBgkq…`). Click copy.
3. [ ] Keep it for Part F. It is **public**, not a secret — but copy it exactly, without extra spaces.
4. [ ] Can't find it? Google moves menu items around. Tell me exactly which menu entries you *do* see and I'll point you to the right one — do not guess or copy a different long code (the build checks the format, but only Google's own key works for real purchases).

## Part E — Create your upload key (your private signature)

Each file you upload must be signed. You create the signing key **on your own computer**; it is never sent to anyone.
You will end up with **one file** (`freelanche-upload.jks`) and **one password**.

1. [ ] Check that Java is installed: open a terminal (Windows: *PowerShell*) and type `keytool -help`. If you get "command not found", install **Java 17 or newer** from <https://adoptium.net> and open a new terminal.
2. [ ] Create the key. Copy this whole line, press Enter:

   - Mac / Linux: `keytool -genkeypair -v -keystore ~/freelanche-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000`
   - Windows PowerShell: `keytool -genkeypair -v -keystore "$HOME\freelanche-upload.jks" -alias upload -keyalg RSA -keysize 4096 -validity 10000`

3. [ ] Answer the questions on screen:
   - **Password** (twice): choose one with 12+ characters. It is **not shown** as you type — that is normal. **Write it down in a password manager now.**
   - Name and organisation questions: your name is enough; you may press Enter to skip the others.
   - "Is … correct?" → type `yes` and press Enter.
   - If it asks for a *key password* "(RETURN if same as keystore password)": **just press Enter.** Do not choose a different one — the key file format used today cannot keep two different passwords, and a second one would make the build fail.
4. [ ] **Back up** `freelanche-upload.jks` (USB stick or private cloud) next to the password. If you lose either, you must ask Google to reset the upload key (possible, but slow).
5. [ ] The alias (the key's name inside the file) is `upload` — you typed it in the command above. Remember it.

*(Never email, upload, screenshot or paste the `.jks` file or the password anywhere — not into GitHub issues, not into chat, not to me. The project already tells git to ignore them.)*

*Prefer a guided script? In the project folder run `npm run android:key`. It asks for the same things, creates the same file, and also writes `android/keystore.properties` for building on your own computer.*

## Part F — Build the `.aab` file (the file you upload)

### Which secrets does GitHub need? (all five, no exceptions)

| Secret name | What to put in it | Why it is needed |
| --- | --- | --- |
| `UPLOAD_KEYSTORE_BASE64` | Your `.jks` file turned into one line of text (step F1) | Signs the bundle. Google rejects unsigned files. |
| `UPLOAD_STORE_PASSWORD` | The password from Part E | Opens the key file. |
| `UPLOAD_KEY_ALIAS` | `upload` | Says which key inside the file to use. |
| `UPLOAD_KEY_PASSWORD` | **The same password again** | Uses the key. (For a standard key file it is always identical to the one above.) |
| `PLAY_LICENSE_KEY` | The licence key from Part D | Public, but the release build refuses to build without it: the app uses it to reject forged purchases. |

Nothing is optional and there is no "test" version of these: the workflow stops at its first step and tells you which one is missing.
The file it produces is then signed with **your** key, so Google Play will accept it.

*Just want to look at the app on your computer or a phone, without Google Play?* You need **none** of these. `npm run dev` runs the app with a pretend Google Play, and `cd android && ./gradlew assembleDebug` builds a test app for your own phone.
Those test builds cannot be uploaded to Google Play.

### F1. Turn the key file into text (on your computer)

The text goes straight to your clipboard; you don't need to look at it or save it anywhere.

- **Mac:** `base64 -i ~/freelanche-upload.jks | tr -d '\n' | pbcopy`
- **Windows PowerShell:** `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\freelanche-upload.jks")) | Set-Clipboard`
- **Linux:** `base64 -w0 ~/freelanche-upload.jks | xclip -selection clipboard` (no `xclip`? run `base64 -w0 ~/freelanche-upload.jks > key.txt`, open `key.txt`, copy everything, then **delete key.txt**)

### F2. Add the five secrets to GitHub

1. [ ] Open your repository on GitHub → **Settings** → **Secrets and variables** → **Actions** → green **New repository secret** button.
2. [ ] **Name:** `UPLOAD_KEYSTORE_BASE64` · **Secret:** paste (Ctrl+V / Cmd+V) → **Add secret**.
3. [ ] Repeat for the other four, with the names exactly as in the table (capital letters, underscores). Type or paste the value **without pressing Enter or Space afterwards** — a hidden space or line break is the most common mistake, and the workflow will tell you if it finds one.
4. [ ] GitHub shows the names but never the values again. To change one later, open it and choose **Update**.

### F3. Run the build

1. [ ] GitHub → **Actions** → **Android bundle (manual)** → **Run workflow**.
2. [ ] Leave **version_code** empty the first time. (Google Play needs a *higher* number for every upload; if you ever must upload a second build of the same app version, type a bigger whole number there, for example `10201`.)
3. [ ] Click the green **Run workflow** button and wait for the green tick (about 5–10 minutes). The first steps check your secrets and your key in seconds, so a mistake shows up quickly with a plain message (see the table at the bottom of this page).
4. [ ] Open the finished run → scroll to **Artifacts** → download **freelanche-release** → unzip → **`app-release.aab`** is your file. (The page above the artifacts also shows its size, a checksum and the key fingerprint.)

This workflow only builds the file. It does **not** upload anything to Google Play and does not publish anything.

**Want to look at the project in Android Studio (not needed for Google Play)?** Don't open the plain source download — it lacks files Capacitor generates, and Gradle's error mentions `cordova.variables.gradle`. Instead download the ready-made project: GitHub → **Actions** → the newest green **CI** run → **Artifacts** → `freelanche-android-studio-project`, unzip it to a short folder like `C:\freelanche` and, in Android Studio, **Open** the folder named `android`. `READ-ME-FIRST.txt` inside repeats these steps. No Node.js, PowerShell or Gradle editing is needed.

**Or — on your own computer instead:** install **Android Studio**, run `npm run android:key` once (it also asks you to paste the licence key into `android/keystore.properties`), then `npm ci && npm run android:bundle`. The file appears at `android/app/build/outputs/bundle/release/app-release.aab`.

- [ ] I have an `app-release.aab` file.

## Part G — Upload it to *Internal testing* (private, safe)

1. [ ] Left menu → **Testing → Internal testing** → **Create new release**.
2. [ ] Accept **Play App Signing** if asked.
3. [ ] **Upload** `app-release.aab`. Release name can stay as suggested. Add short release notes ("First test build").
4. [ ] **Next** → fix any red errors → **Save** → **Start rollout to Internal testing**.
5. [ ] **Testers** tab → **Create email list** → add the Gmail address(es) of your testers (include your own test account) → save → tick the list.
6. [ ] Copy the **opt-in link** shown on that tab. You will open it on the phone in Part I.

## Part H — Create the subscription (€2.99 per month, 7-day free trial)

This must be done **after** Part G (Google needs an uploaded build that uses billing before it lets you create products).

### H1. The subscription and its product ID
1. [ ] Left menu → **Monetize with Play → Products → Subscriptions** → **Create subscription**.
2. [ ] **Product ID:** `freelanche_premium` ← type exactly this (small letters, underscore). **It cannot be changed later.**
3. [ ] **Name:** Freelanche. Add a short description and benefits ("Everything in Freelanche"). **Save**.

### H2. The base plan (the €2.99 monthly price)
1. [ ] In the subscription, **Add base plan**.
2. [ ] **Base plan ID:** `monthly` ← exactly this.
3. [ ] **Type:** Auto-renewing · **Billing period:** Monthly.
4. [ ] **Grace period:** 7 days · **Account hold:** 30 days (this is what keeps someone's access while Google retries a failed card).
5. [ ] **Resubscribe:** allowed.
6. [ ] **Price:** click to set prices → pick **Euro (EUR) → 2.99** for your main country → let Google fill the other countries automatically → check the list looks sensible → **Save**.
7. [ ] **Activate** the base plan.

### H3. The 7-day free trial (an "offer")
1. [ ] In the base plan, **Add offer**.
2. [ ] **Offer ID:** `trial-7d` · **Eligibility:** *New customer acquisition* → *Never had this subscription*.
3. [ ] **Phases → Add phase → Free trial → 7 days.**
4. [ ] **Save** and **Activate** the offer.

- [ ] The subscription, the base plan **and** the offer all say **Active**.

### How the app finds the subscription (the product ID connection)
The app asks Google Play for the product named `freelanche_premium` and uses the base plan named `monthly`. Those two names are written in the project in
`src/billing/types.ts` (`SUBSCRIPTION_PRODUCT_ID`) and `android/app/src/main/java/app/freelanche/tracker/FreelancheBillingPlugin.java` (`BASE_PLAN_ID`).
If yours are spelled differently, the paywall says "This subscription isn't available right now". The **price is not written in the app**: the app shows
whatever Google reports for the person's country, so €2.99 here is the only place to set it.

## Part I — Test with real (free) test purchases

1. [ ] Play Console → **Settings** (gear, left menu, "All apps" level) → **License testing** → add your tester Gmail → save. Testers are **never charged**.
2. [ ] On the Android phone signed in to that Gmail, open the **opt-in link** (Part G6) → **Become a tester** → **Download it on Google Play**. (If the app says "not available", wait up to a few hours and retry.)
3. [ ] Go through the test script in `docs/TESTING.md` → "Real Google Play test". Write down what happens at each step.
4. [ ] If anything fails, see "When something goes wrong" below, then tell me exactly what you saw.

## Part J — Forms Google requires before any public release

Play Console → **Dashboard** lists them; typical answers for this app (details in `docs/PLAY_DATA_SAFETY.md`):

- [ ] **Privacy policy:** fill the three `[placeholders]` in `docs/PRIVACY_POLICY.md`, publish it at a public web address (free way: GitHub → repository **Settings → Pages**, or paste it into a public Google Doc/Notion page set to "anyone can view"), paste the address.
- [ ] **App access:** "All functionality requires a subscription" — give Google a tester login **only in this form**.
- [ ] **Ads:** No ads. · **Target audience:** 18+. · **Content rating:** answer the questionnaire honestly (no violence, no user-generated content).
- [ ] **Data safety:** copy the answers from `docs/PLAY_DATA_SAFETY.md`.
- [ ] **Financial features:** the app only records the user's own income and offers no loans, payments or investments.
- [ ] **Store listing:** texts in `docs/STORE_LISTING.md`; icon `public/icons/icon-512.png`; a 1024×500 feature image (you make one); at least 2 phone screenshots.

## Part K — Going public (only when *you* decide)

New accounts usually have to run a **closed test** with a minimum number of testers for a minimum number of days first (Play Console shows the current rule).
After that: **Production → Create release → choose a staged rollout (for example 10%)**. **Do not do this until you have completed Part I successfully
on a real phone.** Tell me before you do and I'll go through the final checklist with you.

---

## When something goes wrong

| What you see | Most likely cause |
| --- | --- |
| "This subscription isn't available right now" | Product ID or base plan ID spelled differently; subscription/base plan/offer not **Active**; the build you installed is older than the subscription; wait a few hours. |
| "Item not found" / app not found when opening the opt-in link | Not added to the tester list; wrong Google account on the phone; release not rolled out yet. |
| Android Studio sync fails mentioning `cordova.variables.gradle` or "plain source-code download" | You opened the plain source download. Use the ready-made project instead (see Part F: `freelanche-android-studio-project` in the newest green CI run). |
| Build fails with "Missing the Google Play licence key" | `PLAY_LICENSE_KEY` (or `playLicenseKey` on your own computer) is missing or incomplete. Copy it again from Part D. |
| GitHub: "Missing repository secrets: …" | The listed secret names don't exist yet or are spelled differently. Names are case-sensitive; add them under Settings → Secrets and variables → Actions. |
| GitHub: "UPLOAD_KEYSTORE_BASE64 is not valid base64 text" / "The key file could not be opened" | The text was cut off or changed when pasted, or `UPLOAD_STORE_PASSWORD` is wrong. Redo F1 and re-create that one secret. |
| GitHub: "no key with the name in UPLOAD_KEY_ALIAS" | The alias must be exactly what you typed after `-alias` in Part E (`upload`). The message lists the names found in your file. |
| GitHub: "The key could not be used. UPLOAD_KEY_PASSWORD is probably wrong" | `UPLOAD_KEY_PASSWORD` must be exactly the same text as `UPLOAD_STORE_PASSWORD`. |
| GitHub: "… starts or ends with a space or a line break" | Re-create that secret and paste it without pressing Enter or Space afterwards. |
| GitHub: "PLAY_LICENSE_KEY is not a valid Google Play licence key" | Copy it again from Play Console (Part D): one long line starting with `MIIB`. |
| Play Console: "Version code … has already been used" | Run the workflow again with a bigger number in **version_code**. |
| Play Console: "signed with the wrong key" (later uploads) | Always use the same `.jks` file. Never create a second key; if the first is lost, use Play Console → App signing → request an upload key reset. |
| Payment sheet never appears | Phone has no Google Play Store, or the Play Store is out of date. |
| The trial isn't offered | That Google account already had the trial (it is once per account). Use another tester account. |
| Locked even though you subscribed | Wait a minute and tap **Restore purchases**; check you are signed in to the same Google account. |
| Everything is in English | Pick your language on the first screen; it can be changed later in Settings. |

## Words used above

- **AAB** — Android App Bundle, the file Google Play wants. · **Upload key** — the private signature you add to each file. · **Play App Signing** — Google keeps the key real users' phones check.
- **Licence key** — a public code that lets the app confirm purchases came from Google. · **Product ID** — the name of the subscription in Play Console.
- **Internal testing** — a private test channel for people you list. · **Licence tester** — a Google account that can test purchases without paying.

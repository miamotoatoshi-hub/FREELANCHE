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
- [ ] A **computer** (Windows, Mac or Linux) — see Part G for the two ways to build; one needs no installation.
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

## Part E — Create your upload key (your private signature)

Each file you upload must be signed. You create the signing key **on your computer**; it is never shared.

1. [ ] Install **Java 17 or newer** if `keytool` is missing (<https://adoptium.net>).
2. [ ] In the project folder run: `npm run android:key`
3. [ ] Type a name, then choose a password (12+ characters, **not shown as you type**). The script creates `~/freelanche-upload.jks` and `android/keystore.properties`.
4. [ ] **Back up** `freelanche-upload.jks` (USB stick or private cloud) and save the password in a password manager. If you lose both, you must ask Google to reset the key.
5. [ ] Open `android/keystore.properties` in a text editor and paste the licence key after `playLicenseKey=` (Part D). Save.

*(Never email, upload, screenshot or paste that file or the passwords anywhere. The project already tells git to ignore them.)*

## Part F — Build the `.aab` file (the file you upload)

**Easiest — no installation: let GitHub build it**
1. [ ] On your computer, turn the key file into text: Mac/Linux `base64 -w0 ~/freelanche-upload.jks > key.txt` (Mac: `base64 -i ~/freelanche-upload.jks -o key.txt`); Windows PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\freelanche-upload.jks")) | Set-Content key.txt`.
2. [ ] GitHub → your repository → **Settings → Secrets and variables → Actions → New repository secret**. Create **five** secrets (names exact):
   `UPLOAD_KEYSTORE_BASE64` (the contents of key.txt), `UPLOAD_STORE_PASSWORD`, `UPLOAD_KEY_ALIAS` (`upload`), `UPLOAD_KEY_PASSWORD`, `PLAY_LICENSE_KEY` (from Part D).
   GitHub keeps them hidden; they cannot be read back. Then **delete key.txt**.
3. [ ] GitHub → **Actions → "Android bundle (manual)" → Run workflow**. Wait for the green tick (about 5–10 minutes).
4. [ ] Open the finished run → **Artifacts** → download **freelanche-release** → unzip → `app-release.aab` is your file.

**Or — on your own computer:** install **Android Studio**, open the `android` folder, then in a terminal: `npm ci && npm run android:bundle`. The file appears at `android/app/build/outputs/bundle/release/app-release.aab`.

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
| Build fails with "Missing the Google Play licence key" | Part D/E step 5: the key is missing or has spaces. |
| Payment sheet never appears | Phone has no Google Play Store, or the Play Store is out of date. |
| The trial isn't offered | That Google account already had the trial (it is once per account). Use another tester account. |
| Locked even though you subscribed | Wait a minute and tap **Restore purchases**; check you are signed in to the same Google account. |
| Everything is in English | Pick your language on the first screen; it can be changed later in Settings. |

## Words used above

- **AAB** — Android App Bundle, the file Google Play wants. · **Upload key** — the private signature you add to each file. · **Play App Signing** — Google keeps the key real users' phones check.
- **Licence key** — a public code that lets the app confirm purchases came from Google. · **Product ID** — the name of the subscription in Play Console.
- **Internal testing** — a private test channel for people you list. · **Licence tester** — a Google account that can test purchases without paying.

# Play Console → App content → Data safety: answers for Freelanche

Google's form asks what data an app *collects* (sends off the device) or *shares*. Freelanche stores everything on the
device and makes no network requests of its own, so the honest answers are mostly "no". **Re-check every answer whenever the
app changes** (sign-in, cloud backup, analytics, crash reporting, a verification server and so on would all change them).

| Question | Answer | Why |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | **No** | Income entries, name, currency and goal never leave the device. |
| Purchase history / financial info | Not collected by the developer | Payments and purchase records are held by Google Play; the app only asks the Play Billing Library on the phone whether a subscription is active. No purchase token or receipt is sent anywhere. |
| Is all user data encrypted in transit? | Not applicable (nothing is transmitted) | Cleartext traffic is disabled in the app regardless. |
| Do you provide a way for users to request that their data be deleted? | Not applicable — and the app offers **Settings → Delete all data**, plus uninstall | The developer holds no user data. |
| Data collected by third-party SDKs | None | The only SDKs are the AndroidX/Capacitor WebView shell and Google Play Billing. No analytics, ads or crash SDKs. |
| Ads | **No ads** | |
| Target audience | 18+ | Not for children. |
| Privacy policy | Required — host `docs/PRIVACY_POLICY.md` and give the URL | |

Account-related declarations: the app has **no** sign-in of its own (the Google account used by Google Play Billing is not an
account in the app), so *Account creation* is **not** applicable and no account-deletion URL is needed.

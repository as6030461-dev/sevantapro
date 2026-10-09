# Firebase setup for Seventa

Customers and workers use the shared `login.html` page to create accounts, sign in, and request password resets with Firebase Authentication email/password. Firebase stores passwords; the site never writes them to Firestore. Cloud Functions authorize Admin worker reviews. No numeric OTP or email-sender service is used.

## Firebase project

1. Create a Firebase project and register a Web app.
2. Enable **Authentication > Sign-in method > Email/Password**. In **Authentication > Settings > Password policy**, require at least 8 characters, lowercase, uppercase, a number, and a non-alphanumeric character.
3. Create the default **Cloud Firestore** database.
4. Copy the Web app config into `firebase-config.js`. These web config values are public identifiers, not service-account credentials.
5. Add `localhost` and the deployed site domain under **Authentication > Settings > Authorized domains**.
6. Link a billing-enabled Firebase plan for Cloud Functions, set a budget alert, and install Node.js 22 or newer locally.

## Test Admin review locally

The Emulator Suite runs in VS Code without `firebase login` and does not touch production data. Install Java 21 or newer and Node.js 22, then run this from the project folder:

```powershell
firebase emulators:start --only auth,firestore,functions
```

Keep that terminal running. The Emulator UI is at `http://127.0.0.1:4000`; use the existing local site at `http://127.0.0.1:8000`.

### Seed demo workers

With the emulators running, open another terminal in the project folder and run:

```powershell
$env:CITY = 'Jaipur'
$env:PER_TRADE = '5'
npm --prefix functions run seed:demo-workers
```

This creates 5 clearly labeled sample profiles for each of the 10 services (50 total) in Jaipur in the local Firestore Emulator's `workerDirectory`. Change `CITY` to one of the cities listed in `functions/seed-demo-workers.js` to seed another city; `PER_TRADE` accepts a whole number from 1 to 20. The script always connects to `127.0.0.1:8080`; it cannot write to the production Firestore database. It replaces only its own generated `demo-*` worker profiles on each run, so old demo locations or counts do not remain. Demo profiles are marked as demos in search results and cannot be called or booked.

To test the Jaipur listings, open `http://127.0.0.1:8000/search.html?emulator=1&city=Jaipur`. Search for a work type or leave it on **All services** to see all 50 profiles. The city filter is applied to the selected city; location-radius search uses the sample coordinates around Jaipur.

When the connected Firestore directory has no approved workers, search also shows 10 built-in Jaipur demo profiles so the page can be previewed without seeding the emulator. They are clearly labeled, are not stored in Firestore, and cannot be called or booked. Firebase configuration or connection errors remain visible and do not switch to demo data.

1. In Emulator UI > Authentication, create a test Admin email/password user and copy its emulator UID.
2. In Emulator UI > Firestore, create `admins/{UID}` with `enabled` as a Boolean `true`.
3. Create a test `workers/demo-worker` document with fields such as `fullName`, `phone`, `email`, `trade`, `city`, `experience`, `rate`, `rateUnit`, `details`, and `status: "pending"`.
4. Open `http://127.0.0.1:8000/admin.html?emulator=1` in the same browser tab, sign in with that test Admin, and test Approve/Reject. The matching `workerDirectory` document should be created/deleted in the emulator.

To test worker signup and location capture, open `http://127.0.0.1:8000/login.html?role=worker&emulator=1#apply`. Emulator mode is remembered only for that browser tab; close the tab to return to normal Firebase, or open a page with `?emulator=0` to clear the flag. Do not enter production users or passwords while emulator mode is active.

## Deploy

Install the Firebase CLI, sign in, and select the project that matches `firebase-config.js`:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
npm --prefix functions install
firebase deploy --only functions,firestore:rules,hosting
```

Admin permission can be granted in one of three trusted ways: set Firebase Auth custom claim `admin: true` or `role: "admin"`; create `admins/{UID}` in Firestore with Boolean `enabled: true`; or set `accounts/{UID}.role` to `admin` in the Firebase Console/Admin SDK. Use the exact Firebase Authentication UID, not the email address. Only a project owner/Admin SDK should grant these permissions. After changing custom claims, sign out and sign in again so the token refreshes. Admin approval is performed by a Cloud Function and publishes only approved worker fields.
The `workerDirectory` collection is publicly readable for customer searches; client writes are denied, and the review function adds entries only after approval and removes them when a worker is blocked.

Serve the site through Firebase Hosting or another HTTP server. Do not open pages with `file://`; browser modules and Firebase require HTTP(S). The customer and worker forms show a setup message until `firebase-config.js`, deployed functions, and Firestore rules are ready.

If the old numeric-OTP functions were already deployed, remove them after deploying the new code:

```powershell
firebase functions:delete requestEmailOtp verifyEmailOtp --region us-central1
```

Delete `OTP_PEPPER`, `OTP_FROM_EMAIL`, and `SENDGRID_API_KEY` under **Firebase Console > Functions > Secrets** only if no other function in this Firebase project uses them.

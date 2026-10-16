# Swipe Pay (prototype)

A mobile-first digital wallet with NFC and QR tap-to-pay, built under **Swipe.ltd**, a product of Spark Point Technology.

> **Demo funds only.** Every account starts with a simulated GH₵1,000.00 balance. Balances and transfers are not real money, can't be withdrawn to Mobile Money, and have no cash value.

## What works

- **Accounts:** sign up with a full name, a unique `@username`, a password and a 6-digit Swipe PIN. Sign in from any number of devices or browsers. No account verification yet.
- **Wallet:** a GH₵1,000 demo balance on sign-up, with a show/hide toggle. The balance refreshes live, so incoming payments appear without reloading.
- **Send Money:** search by username or name, or pick from recent recipients. Enter the amount on the keypad, review it, then authorise with your PIN.
- **Receive Money:** a personal QR code and payment link (`/pay/@username`), with share and copy.
- **Tap to Pay (NFC):** under Profile → Devices, add a device to get a unique link (`/pay/@username?d=CODE`). You can write it to any NTAG tag with Web NFC (Chrome on Android) or an app such as NFC Tools. Then tap the tag to test it and activate it.
- **Scan to Pay:** a camera QR scanner (BarcodeDetector, with a jsQR fallback). You can also paste a link or username.
- **Pay links:** a pay link opens straight to amount entry. Visitors who aren't signed in are asked to sign in, then brought back with their amount kept.
- **Activity, receipts and notifications:** a full ledger, receipts with reference numbers (`SWP-…`), and a notification bell for incoming payments.
- **Add Money and Withdraw:** placeholder screens until Mobile Money rails and regulatory approvals are in place.

## Safety in the money path

- Amounts are stored as integer pesewas.
- Each transfer runs in one Postgres transaction. Wallet rows are locked in a consistent order, the debit is conditional (`balance >= amount`), and a `CHECK (balance >= 0)` constraint backs it up.
- The PIN is verified on the server. Five wrong attempts lock it for 15 minutes. Repeated failed logins also lock the account temporarily.
- An idempotency key on every payment prevents double charges from retries.
- Passwords and PINs are hashed with scrypt.
- Sessions use HttpOnly SameSite cookies, and only hashed tokens are stored. State-changing requests require a custom header and a same-origin check.
- A pay link only identifies the recipient. It never authorises a payment.

## Stack

- **Frontend:** React 19, Vite and React Router, in `src/`.
- **API:** one Netlify Function (`netlify/functions/api.mts`) routing `/api/*` to `server/`.
- **Database:** Netlify Database (managed Postgres). The schema lives in `netlify/database/migrations/` and is applied automatically on deploy.

## Develop

```bash
npm install
npm test                 # API integration tests (in-process Postgres emulator)
TEST_DATABASE_URL=postgres://user:pass@localhost/empty_db npm test   # same tests on real Postgres (true concurrency)
npm run build            # type-check + production build

# Run the full app locally against any Postgres:
DATABASE_URL=postgres://user:pass@localhost/swipe_dev npm run serve:local   # http://localhost:8888
BASE_URL=http://localhost:8888 CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

Or use `netlify dev`, which starts a local Netlify Database for you.

## API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/signup` · `/api/auth/login` · `/api/auth/logout` | sets or clears the session cookie |
| GET | `/api/session` · `/api/me` | wallet, balance, unread count |
| GET | `/api/users/search?q=` · `/api/users/recent` · `/api/users/:username` | recipient lookup |
| POST | `/api/transfers` | `{ recipient, amount (pesewas), pin, note?, channel?, deviceCode?, idempotencyKey? }` |
| GET | `/api/transactions` · `/api/transactions/:reference` | activity and receipts |
| GET/POST | `/api/notifications` · `/api/notifications/seen` | incoming payments |
| GET/POST/PATCH | `/api/devices` · `/api/devices/activate` · `/api/devices/:id` | NFC devices |
| GET | `/api/pay/:username?d=` | public pay-link resolution |

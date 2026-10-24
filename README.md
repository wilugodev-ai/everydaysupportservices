# Everyday Support Services

Home-care website and care-management application, developed locally in `C:\everydaysupportservices`.

## Start

Requires Node.js 24.19.0 and pnpm 12.5.1, matching `C:\ablest`.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

- Website: http://127.0.0.1:3300
- Sign in / create account: http://127.0.0.1:3300/login
- My details and appointments: http://127.0.0.1:3300/account
- Administration: http://127.0.0.1:3300/admin
- API health: http://127.0.0.1:4300/v1/health

Both applications bind to this computer only. Ports are separate from Ablest's 3200/4200.

## Browser logo

The site uses a green house-and-heart browser icon, with SVG, multi-size ICO, and Apple touch icon assets in `apps/web/app`. Next.js adds the browser metadata automatically.

## Appearance

Use the Appearance selector in the website header, sign-in and recovery pages, client account, or admin dashboard. Light, Dark, and System match InTouch. The preference is saved in this browser under a project-specific key and synchronized across tabs. System follows operating-system changes. This setting does not change another project or browser.

## First administrator

Start the API, then open `/admin`. The first account requires the one-time token stored in `.data/admin-setup-token.txt`. Enter the token, your email, and a password of 12–128 characters. No default account or password is created. Keep the token private. After setup, use your email and password to sign in.

Passwords are salted and hashed with scrypt. Server-side sessions expire after eight hours and use HttpOnly, SameSite=Strict cookies. Authentication attempts and public booking submissions are rate limited. Administration requires the server-stored admin role. Client account endpoints scope profile and appointment queries to the signed-in user; request-supplied client IDs cannot select another person's records.

## Client accounts and user roles

The main menu includes **Sign in**. Sign-in opens `/account` for clients and `/admin` for administrators. Visitors can create a client account from the sign-in page. Registration always creates the client role, ignoring requested roles and client IDs. Clients can view their contact details, edit their name/phone/address, and view only their linked appointments. Email verification is not configured. Password recovery delivery requires the email configuration below.

Existing owner hashes migrate automatically without changing the password. Pre-migration sessions require a fresh sign-in. Existing workers, client profiles, and bookings are preserved.

If any account password is lost, choose **Forgot your password?** or open `/recover-password`. Enter the registered email to request a six-digit code by email, then enter that code and a new password. Codes expire after 10 minutes, allow at most five guesses, and become invalid after successful use or replacement. Only active registered accounts receive emails. Public responses do not disclose whether an account exists. Successful recovery signs out that account's sessions and preserves profiles, appointments, and roles. Administrators can request delivery from **Users & roles → Send recovery email**.

### Enable actual email delivery

Configure the private `apps/api/.env` file with `RESEND_API_KEY` and `RECOVERY_EMAIL_FROM` using `apps/api/.env.example` as a reference. Use a sender from a verified Resend domain; see the [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email). Restart `pnpm dev` after changing the environment file. No credentials are supplied by default, and the app reports email recovery unavailable until both values are configured. Simulated-provider tests verify behavior; real inbox delivery still needs validation with your configured account. Provider errors invalidate the generated code and emit a generic server log without codes or credentials.

If email is unavailable and no administrator can sign in, a local operator can run `node scripts/recovery-code.mjs account@example.com` to read the private emergency code, then enter it at `/recover-admin`. This separate local operator flow is not linked from normal sign-in. Recovery files live in the ignored `.data/password-recovery` directory; keep them private. The previous shared `.data/admin-recovery-token.txt` is no longer used.

In **Users & roles**, administrators can create accounts, link an existing client after verifying identity, change client/admin roles, and enable or disable accounts. Admin accounts can access all care data and user permissions. Role/status changes revoke the affected account's sessions immediately. At least one active admin must remain. The current admin's own access controls are read-only in the interface; another administrator can change them.

Registration cannot claim existing guest appointments by matching an email. To grant access to old records, use **Users & roles → Add user → Link to existing client**, choose the correct profile, and provide an initial password privately to the account owner. No credentials are emailed automatically.

## Add your care team

In **Workers**, add the worker's name, public profile, credential, expiry date, weekly working days, and working hours. Independently verify the person's credentials before selecting the verified checkbox. This checkbox records your review; it does not contact a licensing authority. All active workers appear in Our care team with an accurate credential status. Only workers with verified, unexpired credentials can be selected for a named-worker booking. There are no fictional certified workers, client records, prices, reviews, or business contact details seeded into the application.

Archive a worker to remove them from the public listing while preserving booking history. Credential and schedule changes do not cancel existing visits automatically. Review affected bookings after making those changes.

## Care requests

Visitors choose a service, a worker or coordinator matching, a date, a visit length of 1–8 hours, and contact details. Dates run from tomorrow through the next 180 days. All visit times are Eastern Time (`America/New_York`). Named-worker availability respects weekly working hours, credential expiry on the visit date, and existing pending/confirmed bookings. The API checks the slot again at submission; overlapping requests are rejected.

A request starts as **pending**. Signed-in clients book using their account email and linked profile; the form prefills saved details. Their visits and status updates appear in My account. Guest requests cannot overwrite existing profiles or submit under an email with an account. Administrators can edit profiles in **Clients**; linked profiles must retain the account email.

In **Bookings**, review requests, assign a worker, and change status to pending, confirmed, completed, or cancelled. Confirmation requires an assigned worker with valid credentials and availability. Cancellation frees the reserved time. Administrators communicate confirmations and updates directly to clients; appointment email/SMS notifications, payments, electronic service agreements, clinical records, worker self-service accounts, and external credential verification are not implemented. The public form explains that requests need review and pricing is agreed before confirmation.

## Validation

```powershell
pnpm check
pnpm test
```

Integration tests start isolated APIs on ports 4398 and 4399 with disposable temporary SQLite databases. They verify legacy owner migration, private appointment access, registration without role escalation, user provisioning, session revocation, last-admin protection, worker listings, availability, booking conflicts, cancellations, client updates, and expired credentials. They never modify `.data`.

## Google Cloud hosting

Live website: https://everyday-web-njolg6chpq-uc.a.run.app

Custom domain `everydaysupportservices.com` is verified with Google and awaiting [Hostinger DNS setup](docs/domain-hostinger.md) and HTTPS certificate provisioning.

Production uses separate website and API services on Cloud Run with a separate PostgreSQL database in the existing Neon cluster. See [Google Cloud deployment](docs/deployment-google-cloud.md) for storage isolation, migration, secrets, scaling, and deployment steps. Local SQLite remains independent.

## Storage and stack

- pnpm workspace; TypeScript 5.9.3
- `apps/web`: Next.js 16.3.5, React 19.3.0, App Router, plain CSS, local SVG artwork
- `apps/api`: NestJS 12.0.4, Node.js SQLite
- `.data/content.sqlite`: private local database; ignored by Git
- PostgreSQL supports hosted storage; Supabase/image dependencies match the original Ablest foundation

Stop the API before backing up the entire `.data` directory. Do not commit the database or setup token. `DATA_DIRECTORY` and `PORT` can isolate an API instance for testing.

Git origin is `https://github.com/wilugodev-ai/everydaysupportservices.git`. The initial project is on GitHub. Cloud deployment uses allowlisted source uploads and excludes local data and credentials.

# Everyday Support Services on Google Cloud

Project: `everyday-care-20261023`. Region: `us-central1`.

Live Google website: https://everyday-web-njolg6chpq-uc.a.run.app

API: https://everyday-api-njolg6chpq-uc.a.run.app

Both services deployed on October 23, 2026. HTTPS checks passed for the homepage, sign-in, account, admin, and recovery pages. API health reports PostgreSQL. Temporary test sessions verified client account isolation, client rejection from admin endpoints, and foreign-origin write rejection; those sessions were removed. Imported password salts/hashes match local records. No real recovery email was sent during deployment checks.

Custom domain: `everydaysupportservices.com` at Hostinger. Google ownership is verified and root/www domain mappings are created. Hostinger DNS is updated and verified through authoritative/Cloudflare/Google lookups. Google HTTPS certificates are still pending. See [exact Hostinger records](domain-hostinger.md). No DNS changes have been made by the deployment tools.

The user approved using the billing account already used by Ablest on October 23, 2026, including possible charges beyond the shared free allowance. Both Cloud Run services use request-based billing, one CPU, 512 MiB memory, zero minimum instances, and a maximum of one service instance. Builds, image/source storage, logs, secrets, and traffic can also incur charges. These limits are not a spending cap.

## Storage and isolation

Local development continues to use `.data/content.sqlite`. Hosted mode uses PostgreSQL selected by the server-only `DATABASE_URL`. Cloud Run startup refuses SQLite because container storage is temporary.

The hosted database is `everydaysupportservices`, in the existing Ablest Neon cluster, with a separate restricted login `everyday_app_20261023`. Capacity is shared with Ablest; customer tables are separate. A permission-metadata check confirmed the Everyday login cannot read Ablest accounts. No Ablest records were imported or changed.

The initial import preserved one worker, one client profile, two accounts, and one appointment. Password hashes and roles were preserved; sessions and pending recovery codes were excluded. A consistent SQLite backup was saved under the ignored `.data/cloud-run` folder. Local and hosted records are independent and do not synchronize automatically.

`scripts/import-local-to-postgres.mjs --confirm-empty-target` imports only into an empty database with the expected name. It refuses a populated target and preserves a local snapshot. Do not repeat the initial import against a live populated database.

## Runtime configuration

- Services: `everyday-api` and `everyday-web`.
- Secrets: `everyday-database-url:1` and `everyday-resend-api-key:1`.
- Mail uses the approved existing Ablest Resend key and `Everyday Support Services <care@mail.ablestsolutions.com>`.
- The runtime service account can access only the two application secrets.
- The website forwards `/api/*` through a server route using runtime `API_URL`.
- `WEB_ORIGIN` restricts browser writes to the deployed website origin.
- Production session cookies use HttpOnly, SameSite=Strict, and Secure.
- PostgreSQL transactions and advisory locks protect booking conflicts, last-admin changes, and recovery-code single use across concurrent requests.
- Local emergency recovery files are not persistent in Cloud Run. Hosted password recovery uses email codes stored as hashes in PostgreSQL; delivery must be checked by the account owner.

Application source uploads are allowlisted by `.gcloudignore` and `.dockerignore`; credentials, local data, recovery files, dependencies, and Git history are excluded.

## Deploy

```powershell
.\deploy\cloud-run\deploy.ps1 -PrepareOnly
.\deploy\cloud-run\deploy.ps1 -ProjectId everyday-care-20261023 -DatabaseSecret everyday-database-url:1 -MailSecret everyday-resend-api-key:1
```

The script uses the existing Google CLI under `C:/intouch/.data/google-cloud/google-cloud-sdk/bin/gcloud.cmd`. It configures application-specific build/runtime identities, builds both images, deploys both services, sets the API's allowed origin to the website URL, and verifies basic health. Results are stored in `.data/cloud-run/deployment-result.json`. It does not change DNS, other applications, or the local SQLite database.

For code validation:

```powershell
pnpm check
pnpm test
```

The optional PostgreSQL integration suite runs only when `TEST_POSTGRES_URL` is supplied. It creates a disposable schema, tests concurrent booking requests, role safeguards, and password recovery, then removes that schema. Do not point tests at another application's database.

## Sources

- [Cloud Run container contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud Run pricing and shared free allowance](https://cloud.google.com/run/pricing)

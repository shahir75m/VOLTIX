# VORTIX

VORTIX is a full-stack shopping application with a React frontend and an Express/MongoDB API.

## Requirements

- Node.js and npm
- MongoDB Atlas or a local MongoDB replica set. The API uses database transactions; a standalone local MongoDB server is not sufficient.

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and set the values for your local environment. At minimum, configure `MONGO_URI`, `JWT_SECRET`, and `OTP_HASH_SECRET`.
2. Copy `frontend/.env.example` to `frontend/.env`. Set `VITE_API_URL` if the API is not running at `http://localhost:5000`. Set `VITE_GOOGLE_CLIENT_ID` only if Google sign-in is configured.
3. Install and start the API:

   ```sh
   cd backend
   npm ci
   npm run dev
   ```

4. In a separate terminal, install and start the frontend:

   ```sh
   cd frontend
   npm ci
   npm run dev
   ```

The frontend is served at `http://localhost:5173` by default. Configure `FRONTEND_URL` in the backend environment to match the frontend origin. See `backend/.env.example` for additional optional and production settings.

## Checks

Run these commands from their respective directories:

```sh
# backend
npm test

# frontend
npm test
npm run lint
npm run build
```

There is also a reusable API + security suite (`51` checks: auth, IDOR, price tampering,
idempotency, stock) at the repo root:

```sh
node qa/api-tests.mjs
```

See `TEST_REPORT.md` for the latest results and `BUGS.md` for open findings.

## Deployment (testing setup)

- **Frontend:** `VITE_API_URL` must be the bare API origin (for example
  `https://voltix-store.duckdns.org`). Do not append `/api`; every request already includes it.
- **nginx:** `deploy/nginx-voltix.conf` proxies `/api/` and `/share/`, adds security headers and
  asset caching. Apply it with `deploy/DEPLOY_FIXES.md`.
- **Backend:** set `TRUST_PROXY=1` when the API sits behind nginx, otherwise every customer shares
  one rate-limit bucket. The server logs a warning when this is missing in production.
- **Admin account:** `ADMIN_EMAIL` / `ADMIN_PASSWORD` are only used when the account is created.
  To make a new `.env` password active use `node scripts/createAdmin.js --reset-password`.

### Render / Vercel alternative

- **Frontend:** Create a Vercel project from this repository and set its root directory to `frontend`. Add `VITE_API_URL` using the deployed backend URL. Add `VITE_GOOGLE_CLIENT_ID` only if Google sign-in is enabled.
- **Backend:** The root `render.yaml` defines a Render web service using the free plan. It can sleep when idle, so it is for testing only; the order-expiry interval is not guaranteed to run while the service is asleep. Use an always-on plan or move that job to a scheduler before relying on it in production.
- Set the backend environment variables requested by the Render Blueprint. After Vercel gives you the frontend URL, use it as `FRONTEND_URL` in Render. Create the initial admin account from the backend service shell with `node scripts/createAdmin.js`.

## Environment variables and credentials

Never commit `.env` files or put private credentials in frontend variables. Frontend variables such as `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID` are included in browser code. Use the `.env.example` files as templates and configure production secrets in your hosting provider.

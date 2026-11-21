# VORTIX — Bug list (QA run)

Date: 18 Nov 2026
Environment: local (`localhost:5173` + `localhost:5000`) and live (`https://voltix-store.duckdns.org`)
Database: the shared MongoDB Atlas database from `backend/.env`

Severity: **Blocker** = money/orders cannot work · **High** = wrong result or broken feature ·
**Medium** = broken for some users/config · **Low** = cosmetic/maintenance.

## Fix status (18 Nov 2026)

| Bug | Fixed in repo | Still needed on the server |
|---|---|---|
| BUG-01 double `/api` | `frontend/src/config/api.js` strips a trailing `/api`; `frontend/.env` uses the bare origin; nginx config accepts both prefixes | copy `deploy/nginx-voltix.conf`, rebuild + upload `dist/` |
| BUG-02 share preview | `deploy/nginx-voltix.conf` proxies `/share/` | copy the config |
| BUG-03 admin credentials | `scripts/createAdmin.js --reset-password`, clearer message | run it once |
| BUG-04 local dev CORS | `frontend/.env.local` → `localhost:5000` | — |
| BUG-05 TRUST_PROXY | `config/proxy.js` now warns in production | add `TRUST_PROXY=1` |
| BUG-06 Google origin | documented in `frontend/.env.example` | add the origin in Google Cloud |
| BUG-07 security headers | `deploy/nginx-voltix.conf` | copy the config |
| BUG-08 asset caching | `deploy/nginx-voltix.conf` | copy the config |
| BUG-09 Mongoose warns | all `new: true` → `returnDocument: "after"` (20 places, 13 files) | restart the API |

Verification: backend 66/66, frontend 14/14, `qa/api-tests.mjs` 51/51 after the changes.
Step-by-step: `deploy/DEPLOY_FIXES.md`.

---

## BUG-01 · High · Live: documented API/webhook URLs are wrong (`/api` is stripped twice)

**What happens**

`frontend/.env` was built with `VITE_API_URL=https://voltix-store.duckdns.org/api`. The frontend then calls
`${API_BASE_URL}/api/products`, which becomes `https://voltix-store.duckdns.org/api/api/products`.

Nginx has `location /api/ { proxy_pass http://127.0.0.1:5000/; }`, so nginx removes the first `/api`
before forwarding. The backend also mounts its routes under `/api`. The result:

| URL | Result |
|---|---|
| `/api/api/products` | **200** (works by accident) |
| `/api/products` (the documented path) | **404** `Route not found` |
| `/api/payments/webhook` (the URL in `MANUAL_STEPS.md`) | **404** |
| `/api/api/payments/webhook` | **503** (correct: webhook switched off) |

**Impact**

- The storefront works only because two wrongs cancel out. Any change to either side breaks the whole site.
- If the Razorpay webhook was registered as `https://.../api/payments/webhook`, Razorpay gets 404 and
  `payment.captured` / `order.paid` are never processed. Paid orders then depend only on the 10-minute
  expiry job, and customers who pay and close the tab stay Pending until it runs.
- The Share page (`/share/p/:id`) is not affected by this rule, see BUG-02.

**Fix (either one)**

1. Preferred: remove the trailing slash so nginx forwards the full path:
   ```nginx
   location /api/ { proxy_pass http://127.0.0.1:5000; }
   ```
   Then set the build variable to the bare origin and rebuild the frontend:
   ```
   VITE_API_URL=https://voltix-store.duckdns.org
   ```
   Now `/api/products` and `/api/payments/webhook` work as documented.

2. Quick fix without a rebuild: change the Razorpay webhook URL in the Razorpay dashboard to
   `https://voltix-store.duckdns.org/api/api/payments/webhook`. This keeps the double `/api` trap.

---

## BUG-02 · Medium · Live: WhatsApp/Telegram share preview shows the generic homepage

**What happens**

`GET https://voltix-store.duckdns.org/share/p/<productId>` returns the SPA `index.html` (200, `Content-Length: 1516`)
instead of the server-rendered preview page from `backend/services/shareService.js`.

**Why** — nginx only proxies `/api/`, so `/share/` falls into the SPA fallback (`try_files ... /index.html`).

**Impact** — the Share button opens the right product, but the link preview shows the generic
"Voltix | Phones, Laptops..." title and no product image.

**Fix** — add before the SPA fallback:
```nginx
location /share/ { proxy_pass http://127.0.0.1:5000; }
```

**Verify** — `curl -I https://.../share/p/<id>` should return `Content-Type: text/html` with the product name
in `<title>` and `og:image`, not the generic homepage HTML.

---

## BUG-03 · Medium · `backend/.env` admin credentials do not match the admin account

**What happens**

- Admin accounts in the database: `shahirzaman75@gmail.com` (role `admin`).
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `backend/.env` do not log in (`POST /api/admin/login` → 401).
- The README tells the operator to create the admin with `node scripts/createAdmin.js` and log in with these values.

**Impact** — anyone following the README is locked out of the admin panel.

**Fix** — either update `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env` to the real admin values, or re-run
`node scripts/createAdmin.js` and store the same values in `.env`. Keep `.env` out of git.

---

## BUG-04 · Medium · Local development is broken until `frontend/.env` is overridden

**What happens** — `frontend/.env` points `VITE_API_URL` at the live domain. Running `npm run dev` on a laptop
therefore calls the production API, which answers CORS errors for `http://localhost:5173`:

```
Access to fetch at 'https://voltix-store.duckdns.org/api/users/me' from origin 'http://localhost:5173'
has been blocked by CORS policy
```

**Workaround applied in this run** — created `frontend/.env.local` (git-ignored):
```
VITE_API_URL=http://localhost:5000
```

**Better fix** — keep `.env` for localhost and set the live URL only in the Vercel/AWS build environment.

---

## BUG-05 · Medium · Verify `TRUST_PROXY=1` on AWS, otherwise login limits are global

Login/registration/OTP limiters are per IP: **5 logins per 15 minutes**.
Behind nginx every request appears to come from `127.0.0.1` unless Express trusts the proxy
(`TRUST_PROXY=1`, handled in `config/proxy.js`).

**Impact if missing** — the whole store shares one budget of 5 logins per 15 minutes; the 6th customer
(even from a different phone) gets `429 Too many requests`. This was reproduced locally: a few logins
in the QA run locked out the test account for 13 minutes.

**Fix** — confirm `TRUST_PROXY=1` in the production `.env` and confirm nginx sends `X-Forwarded-For`.
**Verify** — log in from two different networks within a minute; both should succeed.

---

## BUG-06 · Low · Google sign-in fails on localhost

```
[GSI_LOGGER]: The given origin is not allowed for the given client ID.
```

`VITE_GOOGLE_CLIENT_ID` has no `http://localhost:5173` in *Authorized JavaScript origins*
(Google Cloud Console → Credentials → OAuth client). Email/password login is unaffected.

---

## BUG-07 · Low · Static site has no security headers

Nginx serves HTML/JS with no `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`
or `Referrer-Policy`. The Express API sets them, the static site does not.

**Impact** — the storefront can be framed by another site (clickjacking), and browsers may MIME-sniff assets.

**Fix** — add to the `server` block:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

---

## BUG-08 · Low · Hashed assets are not cached

`/assets/index-CEpKl5Xr.js` returns no `Cache-Control`/`Expires`. Every visit revalidates every chunk,
which slows repeat visits on mobile networks. Hashed filenames make long caching safe:
```nginx
location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
```

---

## BUG-09 · Low · Frontend lint warnings and Mongoose deprecation warnings

- `npm run lint` → 9 warnings (`react(set-state-in-effect)` in `StoreLayout.jsx`, `RecentlyViewed.jsx`,
  `UserCart.jsx`, `AdminOrderDetail.jsx`, `AdminOffers.jsx`, `AdminReturns.jsx`, plus an
  `exhaustive-deps` warning in `StoreLayout.jsx`). No errors; `npm run build` succeeds.
- Backend logs: `mongoose: the 'new' option for findOneAndUpdate() is deprecated. Use returnDocument: 'after'`.
  Cosmetic today, but it will break on a future Mongoose major version.

---

## Not a bug (checked and correct)

- Prices/totals sent from the browser are ignored; the server always re-reads the cart.
- A second cancel attempt cannot restore stock twice.
- A foreign customer cannot read, cancel or download another customer's order or invoice.
- `?sort=DROP TABLE`, `minPrice=-1`, negative/decimal/absurd quantities are rejected with 4xx.
- Duplicate checkout with the same `idempotencyKey` returns the same order.
- Session cookies are `HttpOnly` with `SameSite`; `/me` never returns password or OTP fields.
- Product images, pincode lookup, coupons and invoices work.
- HTTP → HTTPS redirect works (301).

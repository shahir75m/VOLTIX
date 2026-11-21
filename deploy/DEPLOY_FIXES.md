# VORTIX — deployment fixes (AWS server)

These are the fixes for the findings in `BUGS.md`. The nginx change also keeps the old
`/api/api/...` URLs working, so **the order does not matter**: you can reboot nginx first,
rebuild the frontend first, or do both at once.

---

## 1. nginx (fixes BUG-01, BUG-02, BUG-07, BUG-08)

Back up the current file first:

```sh
sudo cp /etc/nginx/sites-available/<your-site> ~/voltix-nginx.backup
```

Copy `deploy/nginx-voltix.conf` to the server and adjust three values:

1. `server_name` (already `voltix-store.duckdns.org`)
2. the two `ssl_certificate` paths (copy them from the old file)
3. `root /var/www/voltix;` → the directory that holds `index.html`

Then:

```sh
sudo nginx -t && sudo systemctl reload nginx
```

What it changes:

| Finding | Effect |
|---|---|
| BUG-01 | `/api/products` and `/api/payments/webhook` reach Express unchanged; old `/api/api/...` still works |
| BUG-02 | `/share/p/<id>` is proxied to the API so WhatsApp/Telegram get the product title + image |
| BUG-07 | HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` on HTML/JS |
| BUG-08 | `/assets/*` cached for a year (hashed filenames) |
| — | `client_max_body_size 15m` so product image uploads are not rejected with 413 |

---

## 2. Frontend (fixes BUG-01 at the source)

`frontend/.env` now contains the bare origin:

```
VITE_API_URL=https://voltix-store.duckdns.org
```

`src/config/api.js` also strips a trailing `/api` from the variable, so this mistake cannot
silently come back.

```sh
cd frontend
npm ci
npm run build          # writes dist/
# upload dist/ to the server's root directory (/var/www/voltix)
```

On the server, keep `dist/` as the only content of that directory (remove old `assets/` files,
their names are content-hashed):

```sh
sudo rsync -a --delete ./dist/ /var/www/voltix/
```

Local development is unaffected: `frontend/.env.local` points at `http://localhost:5000`.

---

## 3. Backend `.env` on the server

```ini
NODE_ENV=production
FRONTEND_URL=https://voltix-store.duckdns.org
TRUST_PROXY=1                 # REQUIRED behind nginx (BUG-05)
COOKIE_SAME_SITE=none         # only if the API and frontend are on different domains
```

Restart the API (`pm2 restart <name>` or `sudo systemctl restart voltix-api`) and check the log:
with `TRUST_PROXY` missing on production the server now prints a warning instead of failing silently.

---

## 4. Admin login (fixes BUG-03)

`ADMIN_PASSWORD` is only used when the admin account is **created**; changing `.env` later does
nothing. Pick one:

```sh
cd backend

# A) you know the current admin password -> just put that email in .env
#    ADMIN_EMAIL=the-email-that-exists

# B) make the .env password the real one (also re-enables the account as admin)
node scripts/createAdmin.js --reset-password
```

If the email in `.env` does not exist yet, plain `node scripts/createAdmin.js` creates it.

---

## 5. Razorpay webhook (part of BUG-01)

In Razorpay Dashboard → Settings → Webhooks:

```
https://voltix-store.duckdns.org/api/payments/webhook
```

Events: `payment.captured`, `order.paid`. Copy the secret into the backend `.env` as
`RAZORPAY_WEBHOOK_SECRET` and restart. Before this fix that URL returned 404, so webhooks
were silently lost.

---

## 6. Google sign-in (fixes BUG-06)

Google Cloud Console → APIs & Services → Credentials → your OAuth client → **Authorized JavaScript origins**:

```
http://localhost:5173
https://voltix-store.duckdns.org
```

Save and wait a few minutes; the error was `The given origin is not allowed for the given client ID`.

---

## 7. Verify after deploying

```sh
# 1. API is reachable on the documented path (was 404)
curl -s -o /dev/null -w "%{http_code}\n" https://voltix-store.duckdns.org/api/products          # 200

# 2. Old URL still works too (rollback safety)
curl -s -o /dev/null -w "%{http_code}\n" https://voltix-store.duckdns.org/api/api/products      # 200

# 3. Webhook route exists -> 503 "switched off" when no secret, 400 with a bad signature
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://voltix-store.duckdns.org/api/payments/webhook \
  -H "Content-Type: application/json" -d '{}'                                                   # 503 or 400, NOT 404

# 4. Share preview is server-rendered (title contains the product name)
curl -s https://voltix-store.duckdns.org/share/p/<productId> | grep -i "<title>"

# 5. Security headers on the static site
curl -sI https://voltix-store.duckdns.org/ | grep -Ei "strict-transport|x-frame|x-content-type"

# 6. Assets are cached
curl -sI https://voltix-store.duckdns.org/assets/index-*.js | grep -i cache-control
```

Then in the browser: open the site, log in, add to cart, place a COD order, cancel it, and check
**Admin → Orders** shows it. Full checklist: `TEST_REPORT.md`.

---

## 8. Rollback

```sh
sudo cp ~/voltix-nginx.backup /etc/nginx/sites-available/<your-site>
sudo nginx -t && sudo systemctl reload nginx
```

The old frontend bundle keeps working: the new nginx accepts `/api/api/...` as well.

---

## 9. Not fixed (needs a decision, not code)

| Finding | Why |
|---|---|
| BUG-05 rate-limit policy | `TRUST_PROXY=1` is fixed here, but **5 logins per 15 minutes** is still tight for a campus/shared WiFi. Consider raising it in `backend/routes/userAuthRoutes.js` if students share one network. |
| BUG-09 lint warnings | 9 `react(set-state-in-effect)` warnings in data-loading effects. They are real style smells but rewriting them risks the loaders; they do not affect behaviour. |
| Real payment / email / mobile layout | needs a human: test card, inbox, and a phone. See `TEST_REPORT.md` §3. |

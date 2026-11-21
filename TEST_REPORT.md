# VORTIX — Test report

Date: 18 Nov 2026
Tester: automated QA run (agent)
Scope: local build (`localhost:5173` / `localhost:5000`) **and** the deployed site `https://voltix-store.duckdns.org`

---

## 1. Summary

| Area | Result |
|---|---|
| Backend automated tests (`npm test`) | **66 / 66 pass** |
| Frontend automated tests (`npm test`) | **14 / 14 pass** |
| Frontend lint (`npm run lint`) | 9 warnings, 0 errors |
| Frontend build (`npm run build`) | **pass** (main bundle 237.93 kB) |
| API + security suite (`node qa/api-tests.mjs`) | **51 / 51 pass** |
| Browser flows (customer + admin) | pass (details below) |
| Live deployment checks | works, **3 config bugs** (see `BUGS.md`) |
| Bugs found | 2 High/Medium-blocking config issues on the live server, 6 low |

No data-corruption, authorization or pricing bug was found in the application code.

---

## 2. What was run

### 2.1 Automated suite (repo)

```sh
cd backend  && npm test          # 66 pass
cd frontend && npm test          # 14 pass
cd frontend && npm run lint && npm run build
```

### 2.2 API + security suite (new, reusable)

```sh
# once, creates qa.customer1 / qa.customer2 / qa.admin in the current database
cd backend && node scripts/qaSeedUsers.js

# from the repo root
node qa/api-tests.mjs
# against another host:
QA_BASE=https://voltix-store.duckdns.org QA_ADMIN_EMAIL=... QA_ADMIN_PASSWORD=... node qa/api-tests.mjs
```

> The suite creates cart lines and COD orders, and cancels them again. Point it at a test database.
> Restart the API (or wait 15 minutes) between runs: `/api/users/login` allows 5 attempts per 15 min per IP.

Coverage (51 checks):

| Group | Checks | What was proven |
|---|---|---|
| Auth | 7 | login works, wrong password 401, cookie `HttpOnly` + `SameSite`, `/me` leaks no password/OTP |
| Authorization | 7 | anonymous 401 on cart/orders/wishlist/admin; customer token cannot open admin APIs; foreign `Origin` blocked (403) |
| IDOR | 4 | customer 2 cannot read, cancel, or download customer 1's order/invoice; the order survives the attempt |
| Pricing / stock | 4 | browser-sent `totalPrice: 1` and `price: 1` are ignored; COD deducts stock **once**; cancel restores it |
| Idempotency | 1 | double submit with the same key returns one order, `duplicate: true` |
| Validation | 10 | negative / decimal / 999999 quantity, unknown product, bad sort, negative price, malformed id, malformed JSON, unknown route, unknown coupon, SQL-ish coupon string |
| Profile | 1 | `role: "admin"` in the profile body cannot escalate privileges |
| Functional | 14 | products, categories, detail, cart, COD order, my orders, cancel, invoice PDF, admin login/dashboard/orders/products |
| Admin | 4 | admin login and all admin list endpoints |

### 2.3 Browser flows (real UI, local build)

| # | Flow | Result |
|---|---|---|
| 1 | Login `qa.customer1@example.com` | pass, redirect to store, cart badge appears |
| 2 | Product page `/products/<id>` | pass: ₹1,333 / MRP ₹1,444 / -8 %, coupon offer, stock, variants-free add to cart, pincode check |
| 3 | Add to cart | pass, header badge `· 1` |
| 4 | Cart | ₹1,333 subtotal, delivery "Calculated at checkout", coupon box, remove/qty controls |
| 5 | Checkout address | pass: pincode 682001 auto-filled **District: Ernakulam** from the pincode service |
| 6 | COD order | pass: order #1031, success page, cart cleared, DB `status: Confirmed`, `stockDeducted: true` |
| 7 | Order detail | pass: timeline, invoice button, return disabled with a correct reason ("open once delivered") |
| 8 | Cancel order | pass: confirmation modal → status `Cancelled`, DB history `Confirmed → Cancelled`, stock back to 12 |
| 9 | Admin login `qa.admin@example.com` | pass |
| 10 | Admin dashboard | pass: revenue ₹2,45,810, 8 paid orders, 18 orders / 7 days, chart, recent orders |
| 11 | Admin orders | pass: 31 total, status tabs, filters, search, payment and sort controls |
| 12 | Admin products / users / coupons / returns / reviews / offers / security | pass: 41 users, coupons `YY4` + `PPP`, 2 approved returns, no console errors |
| 13 | Razorpay checkout | order created (`rzp_test…` key, ₹1,333 = 133300 paise) and the checkout iframe opened (`api.razorpay.com/v1/checkout/public`, 576×666) |

Console: no errors on the customer pages or the admin pages after the `frontend/.env.local` fix.

### 2.4 Live deployment checks (`https://voltix-store.duckdns.org`)

| Check | Result |
|---|---|
| Home / products / categories (`/api/api/*`) | 200, real data (15 products) |
| `http://` → `https://` | 301 ✅ |
| Login + session cookie on the live origin | ✅ |
| Razorpay order on live | ✅ `order_U1aa9YeBxwNtPk`, amount 133300, `mock: false`, key `rzp_test…` |
| `payment-failed` on live | ✅ recorded, order stays Pending |
| Cancel live order | ✅ #1032 and #1033 cancelled during cleanup |
| `robots.txt` | ✅ real file (`Disallow: /admin`, `/cart`) |
| Documented `/api/products` | ❌ 404 — see BUG-01 |
| Documented `/api/payments/webhook` | ❌ 404 — see BUG-01 |
| `/share/p/<id>` preview page | ❌ returns generic index.html — see BUG-02 |
| Security headers on static site | ❌ missing — see BUG-07 |
| Cache headers on `/assets/*` | ❌ missing — see BUG-08 |

---

## 3. Not covered by this run (needs a human)

| Item | Why | How to check |
|---|---|---|
| Completing a Razorpay payment | card/UPI/3DS step happens inside Razorpay's cross-origin iframe | open the modal, pay with a test card (`4111 1111 1111 1111`, any future expiry/CVV), confirm the order flips to Confirmed/Paid |
| Real email delivery | no inbox access | register a real address; check Mailjet sender verification |
| Order-expiry job (30 min) | needs a paid-but-abandoned order and time | create a Razorpay order and do not pay; after 30 min + up to 10 min the job should cancel it and release the coupon |
| Return → refund → wallet | needs an order the **admin** marked `Delivered`, then approval | Admin → Orders → Delivered → customer requests return with photos → Admin → Returns approve as Store credit → check `/wallet` |
| Mobile layout | no device emulation available in this environment | Chrome DevTools → iPhone 13/Android → home, product, cart, checkout |
| Google sign-in | localhost origin rejected by Google; live origin not tested | add `http://localhost:5173` to the OAuth client, then test on the live domain |

---

## 4. Fixtures created by this run (in the shared Atlas database)

| Item | Value |
|---|---|
| Customers | `qa.customer1@example.com`, `qa.customer2@example.com` — password `QaUser@12345` |
| Admin | `qa.admin@example.com` — password `QaAdmin@12345` |
| Address | "QA Customer One", 1 QA Test Street, Kochi 682001 |
| Orders | #1029, #1030, #1031 (local), #1032, #1033 (live) — all cancelled |

Delete with:
```js
db.users.deleteMany({ email: /^qa\./ })
db.orders.deleteMany({ "shippingAddress.fullName": { $in: ["QA Customer One", "QA Live", "QA Modal"] } })
db.addresses.deleteMany({ fullName: "QA Customer One" })
```

`frontend/.env.local` (git-ignored) was added to keep local development pointed at `localhost:5000`.

# VORTIX fixes

## Updated
- Added customer wallet balance and transaction history under My account -> Wallet.
- Added wallet checkout payments. Wallet balance is debited together with order creation, inventory deduction and cart cleanup in a MongoDB transaction.
- Approved return requests selected as Store credit now credit the customer's wallet. Wallet-paid cancellations/returns are credited back to the wallet.
- Disabled the old demo/mock UPI payment path. Razorpay online checkout is enabled only when both Razorpay credentials are configured; the server verifies the signature and captured amount with Razorpay.
- Fixed product creation when variant images are assigned (the image-token mutation was being applied twice).
- Removed predefined variant-option chips and remembered dropdown values. Admins enter option names and values manually; the action now says "Add combination".
- Added a startup migration for Category and Brand unique indexes so soft-deleted names can be reused and old full unique indexes do not block taxonomy creation.
- Normalized category/brand name keys across case, Unicode form and repeated whitespace.
- Added blank `.env.example` templates. Real `.env` files and `node_modules` are intentionally excluded from this archive.

## Setup
1. Copy `backend/.env.example` to `backend/.env` and fill in the credentials for your environment.
2. Copy `frontend/.env.example` to `frontend/.env` and set the API URL / Google client ID as needed.
3. Ensure MongoDB runs as a replica set or use MongoDB Atlas; this application uses transactions.
4. Run `npm install` in both `backend` and `frontend`.
5. Start backend and frontend using their package scripts.
6. To enable UPI/cards, add BOTH `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to `backend/.env`, using Test Mode keys first. Until then online payments remain disabled; COD and wallet payments remain available.

## Verification
- Backend test suite: 46 tests passed.
- Frontend test suite: 10 tests passed.
- Frontend production build could not be executed in the supplied runtime because its extracted `node_modules` lacked Vite/Rolldown native optional bindings. Reinstall dependencies with `npm install` before building locally.
- Live MongoDB, Cloudinary and Razorpay integration were not testable without the owner's runtime credentials/services.

## Round 4
- Unpaid online orders are reconciled with Razorpay and then expired (coupon use released). Optional Razorpay webhook.
- Admin "Retry refund" for failed refunds. Courier / tracking ID on orders, shown to customers.
- `trust proxy` setting, removed debug logging from admin OTP routes, dependencies updated (backend `npm audit --omit=dev`: 0 issues), removed duplicate `bcryptjs`.
- Frontend: lazy-loaded pages, error boundary, real 404 page, page titles, SEO meta + robots.txt, WhatsApp-friendly share links, recently viewed products, product page skeleton, accessible return dialog, two lint errors fixed (`useInCart` hook misuse).
- Tests: backend 59 pass, frontend 14 pass. Lint: 0 errors.

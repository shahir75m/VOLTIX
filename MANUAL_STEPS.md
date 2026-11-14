# VOLTIX – Checkout, Payments, Orders & Inventory: what to do manually

1. **MongoDB must support transactions** (Atlas, or a local replica set). A standalone local `mongod`
   fails with "Transaction numbers are only allowed on a replica set". Local: start `mongod --replSet rs0`,
   run `rs.initiate()`, use `mongodb://localhost:27017/voltix?replicaSet=rs0`.
2. **Razorpay (UPI / cards / netbanking).** Online payment is disabled until BOTH `RAZORPAY_KEY_ID` and
   `RAZORPAY_KEY_SECRET` are set in `backend/.env`. There is no demo payment path: the app will never mark
   an order paid because a customer typed a UPI ID or clicked a confirmation button. In Razorpay Dashboard,
   use Test Mode -> Account & Settings -> API Keys -> Generate Test Key, add both keys, then restart backend.
   Configure Razorpay webhooks for payment captured/failed events before production launch. For real money,
   complete Razorpay KYC and replace test keys with Live keys.
3. `npm install` in backend and frontend (not needed for new packages; none were added).
4. Restart the backend once: new indexes are built on start. The taxonomy index migration removes obsolete
   full unique indexes that can incorrectly block re-creating a soft-deleted category or brand.
5. Existing old orders: they have no `stockDeducted` flag. Old Confirmed orders that already reduced stock
   will NOT restore stock if cancelled. Delete test orders or run in mongosh:
   `db.orders.updateMany({status:{$in:["Confirmed","Shipped","Out for Delivery","Delivered"]}},{$set:{stockDeducted:true}})`
6. Test manually: COD order, Razorpay success (test card 4111 1111 1111 1111), close the window -> retry,
   double-click Place order, cancel, return request -> admin approve/reject, stock numbers after each.
7. **Verification emails** (admin login, registration, password reset, email changes): set
   `MAILJET_API_KEY`, `MAILJET_SECRET_KEY` and `EMAIL_FROM` in the backend environment. Verify the
   sender email address in Mailjet first. Render Free blocks outbound SMTP on ports 25, 465 and 587.
   SMTP_* is only for admin order-status emails on local or paid hosting; it will not work on Render Free.
8. **Coupons are now created by the admin** (Admin -> Coupons). The old fixed codes (VOLTIX10, GADGET500,
   FESTIVE15) are gone: create the ones you want, e.g. WELCOME10 (10%, min 999, first order only).
9. **Offers & banners** (Admin -> Offers): needs the same Cloudinary keys the product images already use.
   Tick "Home page banner slider" for the big home banner (image required, best 1600x600), "Offers page"
   for the card on the Offers page. Display order: smaller number first. Offers are promotional only;
   the real discount comes from Coupons or the product MRP.
10. Returns now work item by item (customer ticks items, refund = those items, partial refund through
    Razorpay), with up to 3 photos (Cloudinary folder `voltix/returns`). A return is only possible after
    the admin marks the order **Delivered**, within 7 days (`RETURN_WINDOW_DAYS` in `config/shop.js`).
11. Product form: "Generate all combinations" builds every variant from comma separated values.
12. Wallet: approved returns requested as Store credit are added to the customer's wallet. Customers can
    view their balance/history under My account -> Wallet and spend wallet balance at checkout. Wallet debits,
    credits and order/stock changes are committed in database transactions.

13. **Restart the backend after every update** (new routes: offers, coupons, reviews, return photos). An old
    running backend answers "Route not found" or cannot read the new return form.
14. Reviews: a customer can review a product only after an order containing it is **Delivered** (admin sets
    that in Order detail). Admin -> Reviews can hide or delete reviews; the rating on product cards updates itself.
15. Buy now (product page) = adds the selected variant to the cart and opens checkout; items already in the
    cart are included in that checkout.
16. Product page now has: key features (bullets), key-spec icon strip, grouped specifications, product video,
    pincode delivery estimate, return/payment lines, frequently bought together (automatic, from real orders)
    and review photos. Fill the new product form fields: "Key features" (one per line), "Product video link",
    warranty and box contents. Specification names decide the group (Display, Battery, Camera ... are detected
    from the name, e.g. "Battery capacity"). Delivery days: `config/shop.js` (STORE_STATE, DELIVERY_DAYS_*).
17. Variants: option names and values are entered manually. There are no preset option chips or remembered
    dropdown values; use Add to define the option and type each combination yourself. The colour picker remains
    available for colour variants. Each sellable combination is one row with its own price, stock and image.

## Round 3 (UI)
- Emojis and text symbols (hearts, stars, ticks, arrows, crosses, spec icons) are now SVG icons from `frontend/src/components/Icon.jsx`. To add one more icon, add its path to the `PATHS` list in that file.
- The category strip below the navbar is removed on every page (shop, login, register, OTP). Categories are still available in the Products page filters.
- Product page redesigned like the big shopping sites: thumbnails on the left of a zoomable picture, brand, rating, wishlist and share icons, price with discount, "Available offers" (live coupons from Admin -> Coupons), variants, quantity, Add to cart / Buy now, pincode delivery check, trust icons (delivery, returns, secure payment, warranty), "About this item" bullets, sticky tabs (Overview / Specifications / Reviews), then bought together and related products. On phones the buttons stay fixed at the bottom.
- Fixed the taxonomy index test (its fake collection did not support `find`). Backend 46 and frontend 10 tests pass.

## Round 4 (security, payments, robustness)
Your own `.env` files were NOT changed. Everything below is optional unless marked REQUIRED.

18. **REQUIRED once: restart the backend** and run `npm install` in `backend` (dependencies were updated, `bcryptjs` removed).
19. **Razorpay webhook (recommended before real customers).** A customer who pays and then closes the tab used to leave a
    paid order stuck as Pending. Now two things protect that: (a) the webhook, (b) a background job every 10 minutes that asks
    Razorpay about each unpaid order older than 30 minutes, confirms it if the money arrived, otherwise cancels it and gives the
    coupon use back. (b) works without any setup. For (a): Razorpay Dashboard -> Settings -> Webhooks -> Add
    `https://YOUR-API-DOMAIN/api/payments/webhook`, events `payment.captured` and `order.paid`, choose a secret, then add
    `RAZORPAY_WEBHOOK_SECRET=that_secret` to `backend/.env` and restart. Without it the webhook answers 503 (switched off).
20. **Production only:** add `TRUST_PROXY=1` to `backend/.env` when the API sits behind Render / Railway / Nginx, otherwise all
    customers share one rate limit. Optional: `ORDER_EXPIRY_MINUTES` (default 30, minimum 5).
21. **Share button:** links now go to `API_URL/share/p/PRODUCT_ID`, a tiny page with a picture and title for WhatsApp/Telegram that
    then opens the product. In production set `VITE_API_URL` in `frontend/.env` to your public API address.
22. **Order tracking:** Admin -> Order -> choose Shipped / Out for Delivery -> Courier, Tracking ID, link. The customer sees it on the order page.
23. **Failed refunds:** Admin -> Order shows a "Retry refund" button when Razorpay rejected an automatic refund.
24. Added `backend/.env.example` and `frontend/.env.example` and a root `.gitignore` so real `.env` files never reach git.
    If you ever put this project on GitHub, rotate the keys in your `.env` first.
25. Frontend: `npm install` then `npm run build` as usual. The build is now split per page (first load went from 571 KB to 238 KB).

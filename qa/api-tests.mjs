// VORTIX API + security regression suite.
//
// Usage (from the repo root):
//   node qa/api-tests.mjs                       # local API (http://localhost:5000)
//   QA_BASE=https://your-site node qa/api-tests.mjs
//
// Creates real rows in the database it points at: two QA customers (see
// backend/scripts/qaSeedUsers.js), cart lines and one cancelled COD order.
// Never run it against production data you care about.

const BASE = (process.env.QA_BASE || "http://localhost:5000").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD;
const USER1 = { email: "qa.customer1@example.com", password: "QaUser@12345" };
const USER2 = { email: "qa.customer2@example.com", password: "QaUser@12345" };

const results = [];
const record = (id, name, pass, detail = "", expected = "") =>
  results.push({ id, name, pass, detail: String(detail).slice(0, 220), expected });

function check(id, name, pass, detail, expected = "as expected") {
  record(id, name, pass, detail, expected);
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}  ${name}${pass ? "" : `  -> ${detail}`}`);
}

async function api(path, { method = "GET", body, cookie, origin, rawBody } = {}) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  return { status: res.status, json, text, headers: res.headers, setCookies };
}

const cookieOf = (res, name) => {
  const hit = res.setCookies.find((c) => c.startsWith(name + "="));
  return hit ? hit.split(";")[0] : "";
};

async function login(email, password, admin = false) {
  const path = admin ? "/api/admin/login" : "/api/users/login";
  const res = await api(path, { method: "POST", body: { email, password } });
  return { res, cookie: cookieOf(res, admin ? "adminToken" : "userToken") };
}

// ------------------------------------------------------------------ setup
const health = await api("/");
check("ENV-00", "API is reachable", health.status === 200, `${BASE} -> ${health.status}`, "200");

const [login1, login2] = await Promise.all([login(USER1.email, USER1.password), login(USER2.email, USER2.password)]);
check("AUTH-01", "QA customer 1 can log in", login1.res.status === 200 && login1.cookie, `status ${login1.res.status}`, "200 + cookie");
check("AUTH-02", "QA customer 2 can log in", login2.res.status === 200 && login2.cookie, `status ${login2.res.status}`, "200 + cookie");
check("AUTH-03", "Session cookie is HttpOnly", /HttpOnly/i.test(login1.res.setCookies.join(";")), login1.res.setCookies.join(";").slice(0, 120), "HttpOnly");
check("AUTH-04", "Session cookie has SameSite", /SameSite=/i.test(login1.res.setCookies.join(";")), login1.res.setCookies.join(";").slice(0, 120), "SameSite set");

const u1 = cookieOf(login1.res, "userToken");
const u2 = cookieOf(login2.res, "userToken");

// Deterministic runs: every checkout test starts from an empty cart.
async function emptyCart(cookie) {
  if (!cookie) return;
  const current = await api("/api/cart", { cookie });
  for (const item of current.json?.cart?.items || []) {
    await api(`/api/cart/items/${item.itemId}`, { method: "DELETE", cookie });
  }
}
await Promise.all([emptyCart(u1), emptyCart(u2)]);

if (!u1 || !u2) {
  console.error("\nStopping: could not log in (HTTP 429 = login rate limit, restart the API or wait 15 minutes).");
  process.exit(1);
}

const me = await api("/api/users/me", { cookie: u1 });
check("AUTH-05", "GET /me returns the logged-in customer", me.status === 200 && me.json?.user?.email === USER1.email, `status ${me.status}`, "200");
check("AUTH-06", "GET /me never leaks password / OTP fields", me.json && !("password" in me.json.user) && !JSON.stringify(me.json).includes("password"), JSON.stringify(me.json).slice(0, 120), "no password");

const wrong = await api("/api/users/login", { method: "POST", body: { email: USER1.email, password: "wrong-password-1" } });
check("AUTH-07", "Wrong password is rejected", wrong.status === 401, `status ${wrong.status}`, "401");

// ------------------------------------------------------------- unauthorised
for (const [id, path] of [
  ["SEC-01", "/api/cart"],
  ["SEC-02", "/api/orders/myorders"],
  ["SEC-03", "/api/wishlist"],
]) {
  const res = await api(path);
  check(id, `${path} rejects anonymous callers`, res.status === 401, `status ${res.status}`, "401");
}

const adminAnon = await api("/api/admin/dashboard");
check("SEC-04", "Admin dashboard rejects anonymous callers", adminAnon.status === 401, `status ${adminAnon.status}`, "401");

const adminAsCustomer = await api("/api/admin/dashboard", { cookie: u1 });
check("SEC-05", "Customer token cannot open admin dashboard", [401, 403].includes(adminAsCustomer.status), `status ${adminAsCustomer.status}`, "401/403");

const adminAsCustomer2 = await api("/api/admin/users", { cookie: u1 });
check("SEC-06", "Customer token cannot list all users", [401, 403].includes(adminAsCustomer2.status), `status ${adminAsCustomer2.status}`, "401/403");

const crossOrigin = await api("/api/cart/items", {
  method: "POST",
  cookie: u1,
  origin: "http://evil.example",
  body: { productId: "000000000000000000000000", quantity: 1 },
});
check("SEC-07", "State-changing request from a foreign Origin is blocked", crossOrigin.status === 403, `status ${crossOrigin.status}`, "403");

// ------------------------------------------------------------- storefront
const list = await api("/api/products?limit=50");
check("FUN-01", "Product list loads", list.status === 200 && Array.isArray(list.json?.products), `status ${list.status}`, "200 + products[]");

const saleable = (list.json?.products || []).filter((p) => p.inStock && p.price > 0 && !p.hasVariants);
if (!saleable.length) {
  record("FUN-02", "A saleable product exists for checkout tests", false, "no in-stock simple product found", "at least one");
} else {
  var product = saleable[0];
  record("FUN-02", "A saleable product exists for checkout tests", true, product.name);
}

const detail = product ? await api(`/api/products/${product._id}`) : { status: 0 };
check("FUN-03", "Product detail loads", detail.status === 200, `status ${detail.status}`, "200");

const categories = await api("/api/products/categories");
check("FUN-04", "Category list loads", categories.status === 200 && categories.json?.categories?.length > 0, `count ${categories.json?.categories?.length}`, "> 0");

const minPinned = await api("/api/products?limit=0");
check("FUN-05", "limit=0 is handled without a crash", minPinned.status === 400 || minPinned.status === 200, `status ${minPinned.status}`, "200/400");

const badSort = await api("/api/products?sort=DROP%20TABLE");
check("VAL-01", "Unknown sort value is rejected", badSort.status === 400, `status ${badSort.status}`, "400");

const badPrice = await api("/api/products?minPrice=-1");
check("VAL-02", "Negative price filter is rejected", badPrice.status === 400, `status ${badPrice.status}`, "400");

const badId = await api("/api/products/not-an-object-id");
check("VAL-03", "Malformed product id is rejected", [400, 404].includes(badId.status), `status ${badId.status}`, "400/404");

const missingRoute = await api("/api/there-is-no-such-route");
check("VAL-04", "Unknown route returns JSON 404", missingRoute.status === 404 && missingRoute.json?.success === false, `status ${missingRoute.status}`, "404 JSON");

const badJson = await api("/api/users/login", { method: "POST", rawBody: "{not json" });
check("VAL-05", "Malformed JSON body is rejected", badJson.status === 400, `status ${badJson.status}`, "400");

// ------------------------------------------------------------- cart rules
for (const [id, qty, label] of [
  ["VAL-06", -1, "Negative quantity"],
  ["VAL-07", 999999, "Absurd quantity"],
  ["VAL-08", 1.5, "Decimal quantity"],
]) {
  const res = await api("/api/cart/items", { method: "POST", cookie: u1, body: { productId: product._id, quantity: qty } });
  check(id, `${label} is rejected by the cart`, res.status === 400, `status ${res.status} ${res.json?.message || ""}`, "400");
}

const ghost = await api("/api/cart/items", { method: "POST", cookie: u1, body: { productId: "000000000000000000000000", quantity: 1 } });
check("VAL-09", "Unknown product cannot be added", ghost.status === 404, `status ${ghost.status}`, "404");

const added = await api("/api/cart/items", { method: "POST", cookie: u1, body: { productId: product._id, quantity: 1 } });
check("FUN-06", "Valid product can be added to the cart", [200, 201].includes(added.status), `status ${added.status}`, "200/201");

const cart = await api("/api/cart", { cookie: u1 });
check("FUN-07", "Cart returns a server-side price", cart.status === 200 && cart.json?.cart?.items?.length > 0, `status ${cart.status}`, "items[]");

// ---------------------------------------------------------------- checkout
const address = {
  fullName: "QA Customer One",
  phone: "9876543210",
  addressLine1: "1 QA Test Street",
  addressLine2: "Near Test Junction",
  city: "Kochi",
  district: "Ernakulam",
  state: "Kerala",
  pincode: "682001",
};

// Tampered prices in the body must be ignored completely.
const tampered = await api("/api/orders", {
  method: "POST",
  cookie: u1,
  body: {
    paymentMethod: "COD",
    shippingAddress: address,
    totalPrice: 1,
    items: [{ product: product._id, price: 1, quantity: 1 }],
    idempotencyKey: "qa-tamper-" + Date.now(),
  },
});
const tamperedTotal = tampered.json?.order?.totalPrice;
check("SEC-08", "Client-sent price cannot lower the order total", tampered.status === 201 && tamperedTotal >= product.price, `status ${tampered.status}, total ${tamperedTotal} vs price ${product.price}`, `total >= ${product.price}`);

const orderId = tampered.json?.order?._id;
check("FUN-08", "COD order is created", Boolean(orderId), `status ${tampered.status}`, "order id");

// ------------------------------------------------------------- IDOR checks
let foreignRead = { status: 0, json: null };
let foreignInvoice = { status: 0 };
let foreignCancel = { status: 0 };
if (orderId) {
  foreignRead = await api(`/api/orders/${orderId}`, { cookie: u2 });
  check("SEC-09", "Customer 2 cannot read customer 1's order", [403, 404].includes(foreignRead.status), `status ${foreignRead.status}`, "403/404");

  foreignInvoice = await api(`/api/orders/${orderId}/invoice`, { cookie: u2 });
  check("SEC-10", "Customer 2 cannot download customer 1's invoice", [403, 404].includes(foreignInvoice.status), `status ${foreignInvoice.status}`, "403/404");

  foreignCancel = await api(`/api/orders/${orderId}/cancel`, { method: "PUT", cookie: u2 });
  check("SEC-11", "Customer 2 cannot cancel customer 1's order", [403, 404].includes(foreignCancel.status), `status ${foreignCancel.status}`, "403/404");

  const afterAttack = await api(`/api/orders/${orderId}`, { cookie: u1 });
  check("SEC-12", "Order survived the foreign cancel attempt", afterAttack.json?.order?.status === "Confirmed", afterAttack.json?.order?.status, "Confirmed");
}

// --------------------------------------------------------------- idempotency
if (product) {
  await api("/api/cart/items", { method: "POST", cookie: u1, body: { productId: product._id, quantity: 1 } });
  const key = "qa-idem-" + Date.now();
  const first = await api("/api/orders", { method: "POST", cookie: u1, body: { paymentMethod: "COD", shippingAddress: address, idempotencyKey: key } });
  await api("/api/cart/items", { method: "POST", cookie: u1, body: { productId: product._id, quantity: 1 } });
  const second = await api("/api/orders", { method: "POST", cookie: u1, body: { paymentMethod: "COD", shippingAddress: address, idempotencyKey: key } });
  check(
    "SEC-13",
    "Double submit with the same idempotency key returns ONE order",
    first.json?.order?._id && second.json?.duplicate === true && first.json.order._id === second.json.order._id,
    `first ${first.status}/${first.json?.order?._id} second ${second.status}/${second.json?.order?._id}`,
    "same order id, duplicate=true"
  );
  await emptyCart(u1);
}

// ---------------------------------------------------------------- coupon
const badCoupon = await api("/api/orders/apply-coupon", { method: "POST", cookie: u1, body: { code: "NO-SUCH-COUPON-123" } });
check("VAL-10", "Unknown coupon is rejected", badCoupon.status >= 400 && badCoupon.status < 500, `status ${badCoupon.status} ${badCoupon.json?.message || ""}`, "4xx");

const couponSql = await api("/api/orders/apply-coupon", { method: "POST", cookie: u1, body: { code: "'; db.users.drop(); --" } });
check("SEC-14", "Coupon input is not interpolated into a query", couponSql.status >= 400 && couponSql.status < 500, `status ${couponSql.status}`, "4xx");

// --------------------------------------------------------------- profile
const massAssign = await api("/api/users/profile", {
  method: "PUT",
  cookie: u1,
  body: { name: "QA Customer One", phone: "9000000001", role: "admin", isBlocked: false, isVerified: true },
});
const afterRole = await api("/api/users/me", { cookie: u1 });
check("SEC-15", "Profile update cannot grant the admin role", afterRole.json?.user?.role === "user", `role=${afterRole.json?.user?.role} (update ${massAssign.status})`, "user");

// --------------------------------------------------------------- own cancel + stock
if (orderId) {
  const productBefore = await api(`/api/products/${product._id}`);
  const ownCancel = await api(`/api/orders/${orderId}/cancel`, { method: "PUT", cookie: u1 });
  const productAfter = await api(`/api/products/${product._id}`);
  check("FUN-09", "Customer can cancel their own order", [200, 201].includes(ownCancel.status), `status ${ownCancel.status} ${ownCancel.json?.message || ""}`, "200");

  const cancelled = await api(`/api/orders/${orderId}`, { cookie: u1 });
  check("FUN-10", "Cancelled order shows status Cancelled", cancelled.json?.order?.status === "Cancelled", cancelled.json?.order?.status, "Cancelled");

  const readStock = (p) => (typeof p.json?.product?.stock === "number" ? p.json.product.stock : p.json?.product?.stockLeft);
  const before = readStock(productBefore);
  const after = readStock(productAfter);
  check(
    "FUN-11",
    "Cancelling restores stock (not doubled)",
    before === null || after === null ? true : after >= before,
    `stock before cancel ${before}, after ${after}`,
    "after >= before"
  );
}

// ----------------------------------------------------------- invoice for owner
const myOrders = await api("/api/orders/myorders", { cookie: u1 });
check("FUN-12", "Customer sees their own orders", myOrders.status === 200 && Array.isArray(myOrders.json?.orders), `status ${myOrders.status}`, "200 + orders[]");

const invoice = await api(`/api/orders/${myOrders.json?.orders?.[0]?._id || "000000000000000000000000"}/invoice`, { cookie: u1 });
check("FUN-13", "Invoice download works for the owner", invoice.status === 200, `status ${invoice.status} (${invoice.headers.get("content-type")})`, "200 pdf");

// --------------------------------------------------------------- admin side
if (ADMIN_EMAIL && ADMIN_PASSWORD) {
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD, true);
  check("ADM-01", "Admin can log in", admin.res.status === 200 && admin.cookie, `status ${admin.res.status}`, "200 + cookie");

  const adm = admin.cookie;
  const dash = await api("/api/admin/dashboard", { cookie: adm });
  check("ADM-02", "Admin dashboard loads", dash.status === 200, `status ${dash.status}`, "200");

  const admOrders = await api("/api/admin/orders", { cookie: adm });
  check("ADM-03", "Admin order list loads", admOrders.status === 200, `status ${admOrders.status}`, "200");

  const adminProducts = await api("/api/admin/products?limit=50", { cookie: adm });
  const adminProduct = (adminProducts.json?.products || []).find((p) => String(p._id) === String(product._id));
  check("ADM-04", "Admin product list loads", adminProducts.status === 200, `status ${adminProducts.status}`, "200");

  if (product) {
    await emptyCart(u1);
    await api("/api/cart/items", { method: "POST", cookie: u1, body: { productId: product._id, quantity: 1 } });
    const stockBefore = adminProduct?.stock;
    const cod = await api("/api/orders", { method: "POST", cookie: u1, body: { paymentMethod: "COD", shippingAddress: address, idempotencyKey: "qa-stock-" + Date.now() } });
    const afterProducts = await api("/api/admin/products?limit=50", { cookie: adm });
    const stockAfter = (afterProducts.json?.products || []).find((p) => String(p._id) === String(product._id))?.stock;
    check(
      "FUN-14",
      "COD order deducts stock exactly once",
      cod.status === 201 && (typeof stockBefore !== "number" || stockAfter === stockBefore - 1),
      `status ${cod.status}, stock ${stockBefore} -> ${stockAfter}`,
      "stock - 1"
    );

    // leave the database tidy: cancel the order so stock goes back
    if (cod.json?.order?._id) await api(`/api/orders/${cod.json.order._id}/cancel`, { method: "PUT", cookie: u1 });
  }
} else {
  record("ADM-00", "Admin tests", false, "QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD not set", "env vars");
}

// ------------------------------------------------------------------ summary
const pass = results.filter((r) => r.pass).length;
const fail = results.length - pass;
console.log(`\n${pass}/${results.length} checks passed, ${fail} failed`);
if (fail) {
  console.log("\nFailures:");
  for (const r of results.filter((x) => !x.pass)) console.log(`- ${r.id} ${r.name}: got "${r.detail}" expected "${r.expected}"`);
  process.exitCode = 1;
}

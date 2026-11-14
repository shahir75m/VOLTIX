const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const {
  validateProductInput,
  validateCategoryInput,
  validateQuantity,
} = require("../utils/validators");
const { evaluateLine } = require("../services/cartService");
const { serializeProduct, stockStatus, isVisibleToCustomer } = require("../services/productService");

const CATEGORY_ID = "64b7f0c2a1b2c3d4e5f60718";
const BRAND_ID = "64b7f0c2a1b2c3d4e5f60719";

const goodBody = () => ({
  name: "Wireless Earbuds Pro",
  description: "Nice earbuds",
  category: CATEGORY_ID,
  brand: BRAND_ID,
  price: "4999",
  mrp: "6999",
  stock: "24",
});

// ---------------------------------------------------------------- VALIDATION
test("valid product passes validation", () => {
  const { errors, value } = validateProductInput(goodBody());
  assert.deepEqual(errors, {});
  assert.equal(value.price, 4999);
  assert.equal(value.stock, 24);
});

test("negative / zero / non-numeric price is rejected", () => {
  for (const price of ["-1", "0", "abc", "", "1e999", "10.999"]) {
    const { errors } = validateProductInput({ ...goodBody(), price });
    assert.ok(errors.price, `price "${price}" should be rejected`);
  }
});

test("negative, decimal and huge stock is rejected", () => {
  for (const stock of ["-5", "2.5", "abc", "", "999999999"]) {
    const { errors } = validateProductInput({ ...goodBody(), stock });
    assert.ok(errors.stock, `stock "${stock}" should be rejected`);
  }
});

test("mrp lower than price is rejected, empty mrp means no discount", () => {
  assert.ok(validateProductInput({ ...goodBody(), mrp: "100" }).errors.mrp);
  assert.equal(validateProductInput({ ...goodBody(), mrp: "" }).value.mrp, 0);
});

test("invalid category id, short name and bad sku are rejected", () => {
  const { errors } = validateProductInput({
    ...goodBody(),
    name: "a",
    category: "nope",
    sku: "!!",
  });
  assert.ok(errors.name && errors.category && errors.sku);
  assert.ok(validateProductInput({ ...goodBody(), brand: "" }).errors.brand);
});

const variantBody = (variants, options = ["Colour", "Storage"]) => ({
  ...goodBody(),
  price: "",
  mrp: "",
  stock: "",
  variantOptions: JSON.stringify(options),
  variants: JSON.stringify(variants),
});

const v = (colour, storage, price, stock, mrp = "") => ({
  attributes: [
    { name: "Colour", value: colour, hex: "#000000" },
    { name: "Storage", value: storage },
  ],
  price,
  mrp,
  stock,
});

test("variants: price, mrp and stock of the product are derived from variants", () => {
  const ok = validateProductInput(
    variantBody([v("Black", "128 GB", "18999", 3, "21999"), v("Blue", "256 GB", 21999, 4, 24999)])
  );
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.price, 18999); // cheapest variant
  assert.equal(ok.value.mrp, 21999);
  assert.equal(ok.value.stock, 7);
  assert.deepEqual(ok.value.variantOptions, ["Colour", "Storage"]);
  assert.equal(ok.value.variants[0].attributes[0].hex, "#000000");
});

test("variants: duplicates, bad numbers and missing values are rejected", () => {
  const dup = validateProductInput(
    variantBody([v("Black", "128 GB", 100, 1), v("black", "128 gb", 120, 1)])
  );
  assert.match(dup.errors.variants, /already exists/);

  assert.ok(validateProductInput(variantBody([v("Red", "64 GB", -5, 1)])).errors.variants);
  assert.ok(validateProductInput(variantBody([v("Red", "64 GB", 100, -1)])).errors.variants);
  assert.ok(validateProductInput(variantBody([v("Red", "64 GB", 100, 1.5)])).errors.variants);
  assert.ok(validateProductInput(variantBody([v("Red", "64 GB", 100, 1, 50)])).errors.variants); // mrp < price
  assert.ok(validateProductInput(variantBody([v("", "64 GB", 100, 1)])).errors.variants);
  assert.ok(validateProductInput(variantBody([], ["Colour"])).errors.variants);
  assert.ok(validateProductInput(variantBody([v("Red", "64 GB", 100, 1)], [])).errors.variants);
  assert.ok(
    validateProductInput(variantBody([v("Red", "64 GB", 100, 1)], ["A", "B", "C", "D"])).errors.variants
  );
  assert.ok(validateProductInput({ ...goodBody(), variants: "{bad json" }).errors.variants);
});

test("specification rows: empty rows ignored, half rows rejected", () => {
  const ok = validateProductInput({
    ...goodBody(),
    highlights: JSON.stringify([{ name: "Battery", value: "24h" }, { name: "", value: "" }]),
  });
  assert.equal(ok.value.highlights.length, 1);

  const bad = validateProductInput({
    ...goodBody(),
    highlights: JSON.stringify([{ name: "Battery", value: "" }]),
  });
  assert.ok(bad.errors.highlights);
});

test("category name validation", () => {
  assert.ok(validateCategoryInput({ name: "" }).errors.name);
  assert.ok(validateCategoryInput({ name: "A" }).errors.name);
  assert.ok(validateCategoryInput({ name: "<script>" }).errors.name);
  assert.deepEqual(validateCategoryInput({ name: "  Phones  " }).errors, {});
  assert.equal(validateCategoryInput({ name: "  Phones  " }).value.name, "Phones");
});

test("quantity validation", () => {
  assert.equal(validateQuantity(2).quantity, 2);
  assert.ok(validateQuantity(0).error);
  assert.ok(validateQuantity(-1).error);
  assert.ok(validateQuantity(1.5).error);
  assert.ok(validateQuantity("abc").error);
  assert.ok(validateQuantity(6).error); // above MAX_QTY_PER_ITEM (5)
});

// -------------------------------------------------------------- CART LOGIC
const productDoc = (overrides = {}) => ({
  _id: "p1",
  name: "Charger",
  price: 1299,
  mrp: 1799,
  stock: 10,
  variants: [],
  images: [{ url: "http://img/1.jpg" }],
  variantOptions: [],
  isDeleted: false,
  isPublished: true,
  isBlocked: false,
  category: { _id: "c1", name: "Accessories", isDeleted: false },
  brand: { _id: "b1", name: "Anker", isDeleted: false },
  createdAt: new Date(),
  ...overrides,
});

test("cart line uses DATABASE price and checks stock", () => {
  const line = evaluateLine({ _id: "i1", product: "p1", variant: null, quantity: 2 }, productDoc());
  assert.equal(line.unitPrice, 1299);
  assert.equal(line.lineTotal, 2598);
  assert.equal(line.valid, true);
});

test("cart line is invalid when quantity exceeds stock or stock is 0", () => {
  const over = evaluateLine({ _id: "i1", product: "p1", variant: null, quantity: 4 }, productDoc({ stock: 3 }));
  assert.equal(over.valid, false);
  assert.match(over.issues[0], /Only 3 left/);

  const out = evaluateLine({ _id: "i1", product: "p1", variant: null, quantity: 1 }, productDoc({ stock: 0 }));
  assert.equal(out.valid, false);
  assert.match(out.issues[0], /Out of stock/);
});

test("deleted / unpublished / blocked / hidden-category products are unavailable", () => {
  const cases = [
    productDoc({ isDeleted: true }),
    productDoc({ isPublished: false }),
    productDoc({ isBlocked: true }),
    productDoc({ category: { _id: "c1", name: "X", isDeleted: true } }),
    productDoc({ brand: { _id: "b1", name: "X", isDeleted: true } }),
    null,
  ];
  for (const doc of cases) {
    const line = evaluateLine({ _id: "i1", product: "p1", variant: null, quantity: 1 }, doc);
    assert.equal(line.unavailable, true);
    assert.equal(line.valid, false);
    assert.equal(line.lineTotal, 0);
    assert.equal(isVisibleToCustomer(doc), false);
  }
});

test("variant lines use the variant's own price, label and stock", () => {
  const doc = productDoc({
    stock: 8,
    variants: [
      { _id: "v1", attributes: [{ name: "Colour", value: "Black" }, { name: "Storage", value: "128 GB" }], price: 1000, mrp: 1200, stock: 5 },
      { _id: "v2", attributes: [{ name: "Colour", value: "White" }, { name: "Storage", value: "256 GB" }], price: 1500, mrp: 0, stock: 0 },
    ],
  });
  const black = evaluateLine({ _id: "i", product: "p1", variant: "v1", quantity: 2 }, doc);
  assert.equal(black.valid, true);
  assert.equal(black.variantLabel, "Black · 128 GB");
  assert.equal(black.unitPrice, 1000); // NOT the product-level price
  assert.equal(black.lineTotal, 2000);

  const white = evaluateLine({ _id: "i", product: "p1", variant: "v2", quantity: 1 }, doc);
  assert.equal(white.valid, false);

  const missing = evaluateLine({ _id: "i", product: "p1", variant: "gone", quantity: 1 }, doc);
  assert.equal(missing.unavailable, true);

  const noVariantChosen = evaluateLine({ _id: "i", product: "p1", variant: null, quantity: 1 }, doc);
  assert.equal(noVariantChosen.unavailable, true);
});

test("serialized product hides internals and exposes discount/stock info", () => {
  const out = serializeProduct(productDoc({ stock: 4 }));
  assert.equal(out.discountPercent, 28);
  assert.equal(out.stockStatus, "low_stock");
  assert.equal(out.stockLeft, 4);
  assert.equal(out.isOnSale, true);
  assert.equal("isBlocked" in out, false);
  assert.equal("isDeleted" in out, false);
  assert.equal(stockStatus(0), "out_of_stock");
  assert.equal(stockStatus(50), "in_stock");
});

// ------------------------------------------------------- HTTP (no database)
const app = require("../app");
let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("product list rejects invalid sort, price and category filters with 400", async () => {
  const urls = [
    "/api/products?sort=hacked",
    "/api/products?sort=constructor",
    "/api/products?sort=__proto__",
    "/api/products?minPrice=-5",
    "/api/products?minPrice=abc",
    "/api/products?minPrice=500&maxPrice=100",
    "/api/products?category=notanid",
    "/api/products?brand=notanid",
  ];
  for (const url of urls) {
    const response = await fetch(`${baseUrl}${url}`);
    assert.equal(response.status, 400, url);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.ok(body.message);
  }
});

test("cart and wishlist need a logged-in customer", async () => {
  const calls = [
    ["GET", "/api/cart"],
    ["POST", "/api/cart/items"],
    ["PATCH", "/api/cart/items/64b7f0c2a1b2c3d4e5f60718"],
    ["DELETE", "/api/cart/items/64b7f0c2a1b2c3d4e5f60718"],
    ["POST", "/api/cart/validate-checkout"],
    ["GET", "/api/wishlist"],
    ["POST", "/api/wishlist"],
    ["DELETE", "/api/wishlist/64b7f0c2a1b2c3d4e5f60718"],
  ];
  for (const [method, url] of calls) {
    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" || method === "PATCH" ? "{}" : undefined,
    });
    assert.equal(response.status, 401, `${method} ${url}`);
  }
});

test("admin category and product APIs need an admin login", async () => {
  const calls = [
    ["GET", "/api/admin/categories"],
    ["POST", "/api/admin/categories"],
    ["PUT", "/api/admin/categories/64b7f0c2a1b2c3d4e5f60718"],
    ["DELETE", "/api/admin/categories/64b7f0c2a1b2c3d4e5f60718"],
    ["GET", "/api/admin/brands"],
    ["POST", "/api/admin/brands"],
    ["DELETE", "/api/admin/brands/64b7f0c2a1b2c3d4e5f60718"],
    ["GET", "/api/admin/products"],
    ["POST", "/api/admin/products"],
    ["PUT", "/api/admin/products/64b7f0c2a1b2c3d4e5f60718"],
    ["DELETE", "/api/admin/products/64b7f0c2a1b2c3d4e5f60718"],
    ["PATCH", "/api/admin/products/64b7f0c2a1b2c3d4e5f60718/publish"],
  ];
  for (const [method, url] of calls) {
    const response = await fetch(`${baseUrl}${url}`, { method });
    assert.equal(response.status, 401, `${method} ${url}`);
  }
});

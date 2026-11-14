const assert = require("node:assert/strict");
const { test } = require("node:test");
const { validateProductInput, validateTaxonomyInput } = require("../utils/validators");
const { serializeProduct } = require("../services/productService");
const { defaultSpecTemplate } = require("../config/specTemplates");
const Product = require("../models/Product");
const body = () => ({ name: "Test phone", brand: "64b7f0c2a1b2c3d4e5f60719", category: "64b7f0c2a1b2c3d4e5f60718", price: "100", mrp: "200", stock: "4" });

test("draft can be saved with just a name, but the same data cannot be published", () => {
  const draft = validateProductInput({ name: "Future phone", isPublished: "false" });
  assert.deepEqual(draft.errors, {});
  assert.equal(draft.value.stock, 0);
  assert.equal(draft.value.price, 0);
  const published = validateProductInput({ name: "Future phone", isPublished: "true" });
  assert.ok(published.errors.brand && published.errors.category && published.errors.price);
});

test("GST-inclusive prices, shipping, flags and JSON specifications are validated", () => {
  const result = validateProductInput({ ...body(), gstPercent: "18", deliveryCharge: "40", costPrice: "50", weightGrams: "250", taxInclusive: "true", codAvailable: "false", isNew: "true", tags: '["phone","gaming"]', boxContents: '["Phone","Cable"]', highlights: '[{"name":"Battery","value":"5000 mAh"}]' });
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.price, 100);
  assert.equal(result.value.taxInclusive, true);
  assert.equal(result.value.newArrival, true);
  assert.equal(result.value.codAvailable, false);
  assert.equal(result.value.highlights[0].name, "Battery");
  for (const fields of [{ gstPercent: "101" }, { weightGrams: "-1" }, { deliveryCharge: "no" }, { taxInclusive: "false" }, { tags: "{}" }, { shortDescription: "x".repeat(301) }]) assert.ok(Object.keys(validateProductInput({ ...body(), ...fields }).errors).length);
});

test("variant stock and price override tampered product totals; SKUs cannot repeat within a product", () => {
  const input = { ...body(), sku: "PHONE", price: "1", stock: "9999", variantOptions: '["Colour"]', variants: JSON.stringify([
    { attributes: [{ name: "Colour", value: "Black" }], price: 100, mrp: 200, stock: 2, sku: "BLACK", imageToken: "new:0" },
    { attributes: [{ name: "Colour", value: "Blue" }], price: 150, stock: 3, sku: "BLUE" },
  ]) };
  const result = validateProductInput(input);
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.stock, 5);
  assert.equal(result.value.price, 100);
  assert.equal(result.value.variants[0].imageToken, "new:0");
  const variants = JSON.parse(input.variants); variants[1].sku = "black";
  assert.ok(validateProductInput({ ...input, variants: JSON.stringify(variants) }).errors.sku);
  assert.ok(validateProductInput({ ...input, sku: "BLACK" }).errors.sku);
});

test("public serialization excludes cost price and internal SKU keys and exposes selected variant image", () => {
  const product = { ...body(), price: 100, mrp: 200, stock: 2, costPrice: 15, skuKeys: ["SECRET"], newArrival: true, deliveryCharge: 40, images: [{ publicId: "blue", url: "https://example.test/blue.png", alt: "Blue phone" }], variants: [{ _id: "v1", price: 100, mrp: 200, stock: 2, imagePublicId: "blue", attributes: [{ name: "Colour", value: "Blue" }] }], createdAt: new Date() };
  const result = serializeProduct(product);
  assert.equal(result.discountPercent, 50);
  assert.equal(result.variants[0].discountPercent, 50);
  assert.equal(result.variants[0].image, product.images[0].url);
  assert.equal(result.imageAlt, "Blue phone");
  assert.equal(result.isNew, true);
  assert.equal(result.costPrice, undefined);
  assert.equal(result.skuKeys, undefined);
});

test("category specification templates can change without changing the product schema", () => {
  assert.deepEqual(defaultSpecTemplate("Mobile phones"), ["RAM", "Storage", "Display", "Battery", "Camera", "OS"]);
  assert.deepEqual(defaultSpecTemplate("Laptops"), ["CPU", "RAM", "SSD", "Screen"]);
  assert.deepEqual(defaultSpecTemplate("Earbuds"), ["Battery", "Bluetooth", "ANC"]);
  const custom = validateTaxonomyInput({ name: "Cameras", specTemplate: '["Sensor","Lens","Sensor"]' });
  assert.deepEqual(custom.value.specTemplate, ["Sensor", "Lens"]);
});

test("model derives aggregate stock and refuses publishing an incomplete draft", async () => {
  const draft = new Product({ name: "Upcoming gadget", isPublished: false, price: 0, stock: 0 });
  await draft.validate();
  draft.isPublished = true;
  await assert.rejects(draft.validate(), /category|brand|image|price/i);
  const variants = new Product({ name: "Variant gadget", isPublished: false, price: 999, stock: 999, variants: [
    { attributes: [{ name: "Colour", value: "Black" }], price: 100, stock: 2, sku: "BLACK" },
    { attributes: [{ name: "Colour", value: "Blue" }], price: 200, stock: 3, sku: "BLUE" },
  ] });
  await variants.validate();
  assert.equal(variants.stock, 5);
  assert.equal(variants.price, 100);
  assert.deepEqual([...variants.skuKeys], ["BLACK", "BLUE"]);
});

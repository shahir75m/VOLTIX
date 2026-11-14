const mongoose = require("mongoose");
const shop = require("../config/shop");

const isValidId = (value) =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === value;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cleanText = (value, max) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

// Strict number parser: "12.5" -> 12.5, "" / "abc" / NaN / Infinity -> null
const toNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const hasMax2Decimals = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

const parsePage = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
};

const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined; // marks "invalid JSON"
  }
};

// ------------------------------------------------------ CATEGORY / BRAND
const validateTaxonomyInput = (body = {}, label = "Category") => {
  const errors = {};
  const name = cleanText(body.name, 60);

  if (!name) errors.name = `${label} name is required`;
  else if (name.length < 2) errors.name = `${label} name must be at least 2 characters`;
  else if (name.length > 40) errors.name = `${label} name must not exceed 40 characters`;
  else if (!/^[\p{L}\p{N}][\p{L}\p{N} &'().,/+-]*$/u.test(name))
    errors.name = `${label} name contains invalid characters`;

  const value = { name };
  if (body.specTemplate !== undefined) {
    const fields = parseJsonField(body.specTemplate, []);
    if (!Array.isArray(fields) || fields.length > 25 || fields.some((f) => typeof f !== "string" || !f.trim() || f.trim().length > 60)) {
      errors.specTemplate = "Use at most 25 specification names, each 1–60 characters";
    } else {
      value.specTemplate = [...new Map(fields.map((f) => [f.trim().toLowerCase(), f.trim()])).values()];
    }
  }
  return { errors, value };
};

const validateCategoryInput = (body) => validateTaxonomyInput(body, "Category");

// ----------------------------------------------------------------- PRODUCT
const checkMoney = (raw, { label, required }) => {
  if (!required && (raw === undefined || raw === null || raw === "")) return { value: 0 };
  const n = toNumber(raw);
  if (n === null) return { error: required ? `${label} is required and must be a number` : `${label} must be a number` };
  if (required && n <= 0) return { error: `${label} must be greater than 0` };
  if (n < 0) return { error: `${label} cannot be negative` };
  if (n > shop.MAX_PRICE) return { error: `${label} must not exceed ₹${shop.MAX_PRICE}` };
  if (!hasMax2Decimals(n)) return { error: `${label} can have at most 2 decimal places` };
  return { value: Math.round(n * 100) / 100 };
};

const checkStock = (raw, label = "Stock") => {
  const n = toNumber(raw);
  if (n === null) return { error: `${label} is required` };
  if (!Number.isInteger(n)) return { error: `${label} must be a whole number` };
  if (n < 0) return { error: `${label} cannot be negative` };
  if (n > shop.MAX_STOCK) return { error: `${label} must not exceed ${shop.MAX_STOCK}` };
  return { value: n };
};

const HEX = /^#[0-9a-fA-F]{6}$/;

const validateProductInput = (body = {}) => {
  const errors = {};
  const value = {};

  const published = body.isPublished === undefined || body.isPublished === "" || body.isPublished === true || body.isPublished === "true";
  value.isPublished = published;
  // name
  value.name = cleanText(body.name, 200);
  if (!value.name) errors.name = "Product name is required";
  else if (value.name.length < 2) errors.name = "Product name must be at least 2 characters";
  else if (value.name.length > 120) errors.name = "Product name must not exceed 120 characters";

  // description
  value.description = typeof body.description === "string" ? body.description.trim() : "";
  if (value.description.length > 10000) errors.description = "Full description must not exceed 10000 characters";

  // category + brand
  if (!published && !body.category) value.category = null;
  else if (!isValidId(body.category)) errors.category = "Please select a valid category";
  else value.category = body.category;

  if (!published && !body.brand) value.brand = null;
  else if (!isValidId(body.brand)) errors.brand = "Please select a valid brand";
  else value.brand = body.brand;

  // sku (optional)
  value.sku = typeof body.sku === "string" ? body.sku.trim().toUpperCase() : "";
  if (value.sku && !/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(value.sku))
    errors.sku = "SKU may contain letters, numbers, - and _ (2–30 characters)";

  // ------------------------------------------------ variants (Amazon style)
  // variantOptions = the things that differ, e.g. ["Colour", "Storage"]
  // every variant has a value for each option plus its own price, MRP and stock
  const rawOptions = parseJsonField(body.variantOptions, []);
  const rawVariants = parseJsonField(body.variants, []);
  value.variantOptions = [];
  value.variants = [];

  if (rawOptions === undefined || !Array.isArray(rawOptions) || rawVariants === undefined || !Array.isArray(rawVariants)) {
    errors.variants = "Invalid variants data";
  } else if (rawVariants.length === 0 && rawOptions.length === 0) {
    // no variants – nothing to validate
  } else if (!published && rawVariants.length === 0) {
    value.variantOptions = rawOptions.filter((o) => typeof o === "string").map((o) => cleanText(o, 20)).slice(0, 3);
  } else if (rawVariants.length === 0) {
    errors.variants = "Add at least one variant or remove the variant options";
  } else {
    const optionNames = [];
    for (const raw of rawOptions) {
      const name = cleanText(raw, 40);
      if (!name || name.length > 20 || !/^[\p{L}\p{N}][\p{L}\p{N} /-]*$/u.test(name)) {
        errors.variants = "Variant option names must be 1–20 letters/numbers (e.g. Colour, Storage)";
        break;
      }
      if (optionNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
        errors.variants = `Duplicate variant option "${name}"`;
        break;
      }
      optionNames.push(name);
    }

    if (!errors.variants && (optionNames.length < 1 || optionNames.length > 3)) {
      errors.variants = "Choose 1 to 3 variant options (e.g. Colour, Storage)";
    }
    if (!errors.variants && rawVariants.length > 30) {
      errors.variants = "A product can have at most 30 variants";
    }

    if (!errors.variants) {
      const seen = new Set();
      for (const [index, item] of rawVariants.entries()) {
        const label = `Variant ${index + 1}`;
        const attrList = Array.isArray(item?.attributes) ? item.attributes : [];
        const attributes = [];

        for (const optionName of optionNames) {
          const attr = attrList.find((a) => cleanText(a?.name, 40).toLowerCase() === optionName.toLowerCase());
          const attrValue = cleanText(attr?.value, 60);
          if (!attrValue) {
            errors.variants = `${label}: ${optionName} is required`;
            break;
          }
          if (attrValue.length > 30) {
            errors.variants = `${label}: ${optionName} must not exceed 30 characters`;
            break;
          }
          const entry = { name: optionName, value: attrValue };
          if (typeof attr?.hex === "string" && HEX.test(attr.hex)) entry.hex = attr.hex.toLowerCase();
          attributes.push(entry);
        }
        if (errors.variants) break;

        const key = attributes.map((a) => a.value.toLowerCase()).join("|");
        if (seen.has(key)) {
          errors.variants = `${label}: this combination (${attributes.map((a) => a.value).join(", ")}) already exists`;
          break;
        }
        seen.add(key);

        const price = checkMoney(item?.price, { label: `${label} price`, required: published });
        if (price.error) { errors.variants = price.error; break; }
        const mrp = checkMoney(item?.mrp, { label: `${label} MRP`, required: false });
        if (mrp.error) { errors.variants = mrp.error; break; }
        if (mrp.value !== 0 && mrp.value < price.value) {
          errors.variants = `${label}: MRP cannot be lower than the price`;
          break;
        }
        const stock = checkStock(!published && (item?.stock === "" || item?.stock === undefined) ? 0 : item?.stock, `${label} stock`);
        if (stock.error) { errors.variants = stock.error; break; }

        const sku = typeof item?.sku === "string" ? item.sku.trim().toUpperCase() : "";
        if (sku && !/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(sku)) {
          errors.variants = `${label}: SKU may contain letters, numbers, - and _ (2–30 characters)`;
          break;
        }

        const variant = { imageToken: typeof item?.imageToken === "string" ? item.imageToken : typeof item?.imagePublicId === "string" ? item.imagePublicId : "", attributes, price: price.value, mrp: mrp.value, stock: stock.value, sku };
        if (isValidId(String(item?._id || ""))) variant._id = String(item._id); // keep id on edit
        value.variants.push(variant);
      }
    }

    if (!errors.variants) value.variantOptions = optionNames;
    else value.variants = [];
  }

  const hasVariants = value.variants.length > 0;

  // ------------------------------------------------ price / mrp / stock
  if (hasVariants) {
    // product-level numbers are DERIVED from the variants (never trusted from the browser)
    const cheapest = value.variants.reduce((min, v) => (v.price < min.price ? v : min), value.variants[0]);
    value.price = cheapest.price;
    value.mrp = cheapest.mrp > cheapest.price ? cheapest.mrp : 0;
    value.stock = value.variants.reduce((sum, v) => sum + v.stock, 0);
  } else if (!errors.variants) {
    const price = checkMoney(body.price, { label: "Price", required: published });
    if (price.error) errors.price = price.error;
    else value.price = price.value;

    const mrp = checkMoney(body.mrp, { label: "MRP", required: false });
    if (mrp.error) errors.mrp = mrp.error;
    else if (mrp.value !== 0 && value.price !== undefined && mrp.value < value.price)
      errors.mrp = "MRP cannot be lower than the selling price";
    else value.mrp = mrp.value;

    const stock = checkStock(!published && (body.stock === "" || body.stock === undefined) ? 0 : body.stock);
    if (stock.error) errors.stock = stock.error;
    else value.stock = stock.value;
  }

  // highlights / specifications
  const rawHighlights = parseJsonField(body.highlights, []);
  value.highlights = [];
  if (rawHighlights === undefined || !Array.isArray(rawHighlights)) {
    errors.highlights = "Invalid specifications data";
  } else if (rawHighlights.length > 25) {
    errors.highlights = "At most 25 specifications are allowed";
  } else {
    for (const [index, row] of rawHighlights.entries()) {
      const name = cleanText(row?.name, 100);
      const val = cleanText(row?.value, 300);
      if (!name && !val) continue; // ignore empty rows
      if (!name || !val) {
        errors.highlights = `Specification ${index + 1}: both name and value are required`;
        break;
      }
      if (name.length > 60 || val.length > 200) {
        errors.highlights = `Specification ${index + 1} is too long`;
        break;
      }
      if (value.highlights.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
        errors.highlights = `Specification "${name}" is repeated`;
        break;
      }
      value.highlights.push({ name, value: val });
    }
  }

  // Phase 1/2 metadata. Tax-inclusive pricing is the single store convention.
  for (const [field, max] of Object.entries({ modelNumber: 80, shortDescription: 300, warrantyPeriod: 80, warrantyType: 120 })) {
    const raw = body[field] ?? "";
    if (typeof raw !== "string" || raw.trim().length > max) errors[field] = `${field} must be text of at most ${max} characters`;
    value[field] = typeof raw === "string" ? raw.trim() : "";
  }
  value.slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (value.slug && (value.slug.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug))) errors.slug = "Slug must contain lowercase letters, numbers and single hyphens";
  for (const [field, max] of Object.entries({ gstPercent: 100, costPrice: shop.MAX_PRICE, weightGrams: 1000000, deliveryCharge: shop.MAX_PRICE })) {
    const raw = body[field];
    const n = raw === undefined || raw === "" ? 0 : toNumber(raw);
    if (n === null || n < 0 || n > max || !hasMax2Decimals(n)) errors[field] = `${field} must be a number between 0 and ${max}, with at most 2 decimals`;
    else value[field] = n;
  }
  if (body.taxInclusive !== undefined && body.taxInclusive !== true && body.taxInclusive !== "true") errors.taxInclusive = "Selling prices must include GST";
  value.taxInclusive = true;
  for (const [field, maxRows, maxLength] of [["tags", 20, 40], ["boxContents", 30, 120], ["keyFeatures", 8, 160]]) {
    const rows = parseJsonField(body[field], []);
    if (!Array.isArray(rows) || rows.length > maxRows || rows.some((v) => typeof v !== "string" || v.trim().length > maxLength)) errors[field] = `${field}: invalid list or too many entries`;
    else value[field] = [...new Set(rows.map((v) => v.trim()).filter(Boolean))];
  }
  // product video: only https links to YouTube, Vimeo or a direct .mp4/.webm file
  const video = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  if (video) {
    let ok = false;
    try {
      const u = new URL(video);
      const host = u.hostname.replace(/^www\./, "");
      ok = u.protocol === "https:" && (["youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com"].includes(host) || /\.(mp4|webm)$/i.test(u.pathname));
    } catch {
      ok = false;
    }
    if (!ok || video.length > 300) errors.videoUrl = "Video must be an https link to YouTube, Vimeo or a .mp4/.webm file";
  }
  value.videoUrl = errors.videoUrl ? "" : video;
  for (const field of ["isFeatured", "isNew", "isBestSeller", "codAvailable"]) {
    const raw = body[field];
    if (raw !== undefined && ![true, false, "true", "false"].includes(raw)) errors[field] = "Use true or false";
    value[field] = raw === undefined ? field === "codAvailable" : raw === true || raw === "true";
  }
  value.newArrival = value.isNew;
  delete value.isNew;
  const skus = [value.sku, ...value.variants.map((v) => v.sku)].filter(Boolean);
  if (new Set(skus).size !== skus.length) errors.sku = "Product and variant SKUs must all be different";
  value.skuKeys = skus;
  // status flags
  const toBool = (v, d) => (v === undefined || v === "" ? d : v === true || v === "true");
  value.isPublished = toBool(body.isPublished, true);

  return { errors, value };
};

// ------------------------------------------------------------------- CART
const validateQuantity = (raw) => {
  const quantity = toNumber(raw);
  if (quantity === null || !Number.isInteger(quantity))
    return { error: "Quantity must be a whole number" };
  if (quantity < 1) return { error: "Quantity must be at least 1" };
  if (quantity > shop.MAX_QTY_PER_ITEM)
    return { error: `You can buy a maximum of ${shop.MAX_QTY_PER_ITEM} units of one item` };
  return { quantity };
};

module.exports = {
  isValidId,
  escapeRegex,
  cleanText,
  toNumber,
  parsePage,
  parseJsonField,
  validateCategoryInput,
  validateTaxonomyInput,
  validateProductInput,
  validateQuantity,
};

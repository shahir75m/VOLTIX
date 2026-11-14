// Creates (or refreshes) one customer-visible product for storefront demos.
// Run from backend: node scripts/seedDemoProduct.js
require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const Product = require("../models/Product");

const key = (value) => value.trim().toLowerCase();

async function seedDemoProduct() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing. Add it to backend/.env first.");
  await mongoose.connect(process.env.MONGO_URI);

  // Some early databases still have a legacy `normalizedName` unique index.
  // Use the raw collection so this one-off demo works with both old and new data.
  const now = new Date();
  await Category.collection.updateOne(
    { nameKey: key("Audio") },
    { $set: { name: "Audio", nameKey: key("Audio"), normalizedName: key("Audio"), isDeleted: false, deletedAt: null, specTemplate: ["Battery", "Bluetooth", "ANC", "Driver size"], updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  await Brand.collection.updateOne(
    { nameKey: key("VORTIX") },
    { $set: { name: "VORTIX", nameKey: key("VORTIX"), normalizedName: key("VORTIX"), isDeleted: false, deletedAt: null, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  const [category, brand] = await Promise.all([
    Category.findOne({ nameKey: key("Audio") }),
    Brand.findOne({ nameKey: key("VORTIX") }),
  ]);

  const image = { url: "/vortix-demo-headphones.svg", publicId: "vortix-demo-headphones", alt: "VORTIX Pulse wireless headphones" };
  const product = await Product.findOne({ slug: "vortix-pulse-wireless-headphones" });
  const payload = {
    name: "VORTIX Pulse Wireless Headphones",
    slug: "vortix-pulse-wireless-headphones",
    shortDescription: "Immersive wireless sound with hybrid noise cancellation.",
    description: "VORTIX Pulse gives you focused listening with soft over-ear cushions, hybrid ANC and long battery life. This product is a sample listing for checking the full customer product-detail experience.",
    category: category._id,
    brand: brand._id,
    gstPercent: 18,
    price: 2499,
    mrp: 3999,
    stock: 24,
    variantOptions: ["Colour"],
    variants: [
      { attributes: [{ name: "Colour", value: "Midnight Black", hex: "#15191f" }], price: 2499, mrp: 3999, stock: 16, sku: "VXPULSE-BLK", imagePublicId: image.publicId },
      { attributes: [{ name: "Colour", value: "Electric Lime", hex: "#d6ff36" }], price: 2599, mrp: 3999, stock: 8, sku: "VXPULSE-LIME", imagePublicId: image.publicId },
    ],
    images: [image],
    highlights: [{ name: "Battery", value: "Up to 40 hours" }, { name: "Noise cancellation", value: "Hybrid ANC" }, { name: "Bluetooth", value: "5.3 multipoint" }, { name: "Drivers", value: "40 mm dynamic" }],
    keyFeatures: ["Hybrid active noise cancellation", "Up to 40 hours of playtime", "Low-latency gaming mode", "Soft memory-foam ear cushions"],
    boxContents: ["Headphones", "USB-C cable", "Quick-start guide"],
    warrantyPeriod: "1 year",
    warrantyType: "Manufacturer warranty",
    weightGrams: 265,
    codAvailable: true,
    isPublished: true,
    isBlocked: false,
    isFeatured: true,
    newArrival: true,
    isBestSeller: false,
    tags: ["headphones", "wireless", "audio"],
  };

  if (product) {
    Object.assign(product, payload);
    await product.save();
  } else {
    await Product.create(payload);
  }
  console.log("Demo product ready: /products/vortix-pulse-wireless-headphones");
}

seedDemoProduct()
  .catch((error) => { console.error("Could not seed demo product:", error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

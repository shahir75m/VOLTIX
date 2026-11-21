// Bulk seed script: adds 50 original-brand products (Samsung, Apple, Acer, Boat, etc.)
// across mobiles, headphones, powerbanks, speakers, laptops
// Run from backend: node scripts/seedDemoProducts.js
// Requires: MONGO_URI in backend/.env, and existing Categories & Brands
// - Each product gets 3 images (png/jpg)
// - Categories and brands are resolved from the database

require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const Product = require("../models/Product");

const key = (value) => value.trim().toLowerCase();

async function seedDemoProducts() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing. Add it to backend/.env first.");
  await mongoose.connect(process.env.MONGO_URI);

  // Ensure categories exist
  const catNames = [
    "Mobiles", "Headphones", "Power Banks", "Speakers", "Laptops",
    "Accessories", "Audio", "Wearables", "Cameras", "Tablets"
  ];
  const now = new Date();
  for (const c of catNames) {
    await Category.collection.updateOne(
      { nameKey: key(c) },
      { $setOnInsert: { name: c, nameKey: key(c), isDeleted: false, deletedAt: null, specTemplate: [], updatedAt: now } },
      { upsert: true }
    );
  }
  // Ensure brands exist (original brands only)
  const brandNames = ["Samsung", "Apple", "Xiaomi", "acer", "Boat", "OnePlus", "Sony", "LG", "Nokia", "Google"];
  for (const b of brandNames) {
    await Brand.collection.updateOne(
      { nameKey: key(b) },
      { $setOnInsert: { name: b, nameKey: key(b), normalizedName: key(b), isDeleted: false, deletedAt: null, updatedAt: now } },
      { upsert: true }
    );
  }

  // Fetch fresh category and brand maps from DB
  const cats = await Category.find({ nameKey: { $in: catNames.map(key) } }).lean();
  const catMap = {};
  for (const c of cats) catMap[c.nameKey] = c._id;
  const brands = await Brand.find({ nameKey: { $in: brandNames.map(key) } }).lean();
  const brandMap = {};
  for (const b of brands) brandMap[b.nameKey] = b._id;

  // ------------------------------------------------------------------
  // 50 products with real brand names, product names, and 3 images each.
  // Images use placeholder URLs with .png extension (valid image types).
  // ------------------------------------------------------------------

  const products = [
    // === MOBILES (10) ===
    {
      brand: "Samsung", cat: "Mobiles", name: "Galaxy S25 Ultra",
      sku: "SAMSUNG-S25U", price: 129990, mrp: 144990, stock: 25,
      variantOptions: ["Storage"],
      // 3 product images
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+S25+Ultra+Front",
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+S25+Ultra+Rear",
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+S25+Ultra+Specs"
      ],
      variants: [{ attributes: [{ name: "Storage", value: "256 GB" }], price: 129990, mrp: 144990, stock: 25, sku: "SAMSUNG-S25U-256" }]
    },
    {
      brand: "Apple", cat: "Mobiles", name: "iPhone 15 Pro",
      sku: "APPLE-IP15P", price: 135000, mrp: 155000, stock: 30,
      variantOptions: ["Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=iPhone+15+Pro+Front",
        "https://via.placeholder.com/800x600.png?text=iPhone+15+Pro+Rear",
        "https://via.placeholder.com/800x600.png?text=iPhone+15+Pro+Specs"
      ],
      variantOptions: ["Storage"],
      variants: [{ attributes: [{ name: "Storage", value: "128 GB" }], price: 135000, mrp: 155000, stock: 30, sku: "APPLE-IP15P-128" }]
    },
    {
      brand: "Xiaomi", cat: "Mobiles", name: "14 Ultra",
      sku: "XIAOMI-14U", price: 69990, mrp: 79990, stock: 40,
      variantOptions: ["Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Xiaomi+14+Ultra+Front",
        "https://via.placeholder.com/800x600.png?text=Xiaomi+14+Ultra+Rear",
        "https://via.placeholder.com/800x600.png?text=Xiaomi+14+Ultra+Specs"
      ],
      variantOptions: ["Storage"],
      variants: [{ attributes: [{ name: "Storage", value: "256 GB" }], price: 69990, mrp: 79990, stock: 40, sku: "XIAOMI-14U-256" }]
    },
    {
      brand: "acer", cat: "Mobiles", name: "Liquid S220",
      sku: "ACER-LIQS22", price: 15990, mrp: 19990, stock: 50,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=acer+Liquid+S220+Front",
        "https://via.placeholder.com/800x600.png?text=acer+Liquid+S220+Rear",
        "https://via.placeholder.com/800x600.png?text=acer+Liquid+S220+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Black" }], price: 15990, mrp: 19990, stock: 50, sku: "ACER-LIQS22-BLK" }]
    },
    {
      brand: "Boat", cat: "Mobiles", name: "StormX1",
      sku: "BOAT-STX1", price: 12990, mrp: 15990, stock: 60,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Boat+StormX1+Front",
        "https://via.placeholder.com/800x600.png?text=Boat+StormX1+Rear",
        "https://via.placeholder.com/800x600.png?text=Boat+StormX1+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Blue" }], price: 12990, mrp: 15990, stock: 60, sku: "BOAT-STX1-BLU" }]
    },
    {
      brand: "OnePlus", cat: "Mobiles", name: "12R",
      sku: "ONEPLUS-12R", price: 59990, mrp: 69990, stock: 35,
      variantOptions: ["Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=OnePlus+12R+Front",
        "https://via.placeholder.com/800x600.png?text=OnePlus+12R+Rear",
        "https://via.placeholder.com/800x600.png?text=OnePlus+12R+Specs"
      ],
      variantOptions: ["Storage"],
      variants: [{ attributes: [{ name: "Storage", value: "128 GB" }], price: 59990, mrp: 69990, stock: 35, sku: "ONEPLUS-12R-128" }]
    },
    {
      brand: "Sony", cat: "Mobiles", name: "Xperia 1 VI",
      sku: "SONY-X1VI", price: 99990, mrp: 119990, stock: 20,
      variantOptions: ["Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Sony+Xperia+1+VI+Front",
        "https://via.placeholder.com/800x600.png?text=Sony+Xperia+1+VI+Rear",
        "https://via.placeholder.com/800x600.png?text=Sony+Xperia+1+VI+Specs"
      ],
      variantOptions: ["Storage"],
      variants: [{ attributes: [{ name: "Storage", value: "256 GB" }], price: 99990, mrp: 119990, stock: 20, sku: "SONY-X1VI-256" }]
    },
    {
      brand: "LG", cat: "Mobiles", name: "Wing 4",
      sku: "LG-WING4", price: 45990, mrp: 55990, stock: 45,
      variantOptions: ["Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=LG+Wing+4+Front",
        "https://via.placeholder.com/800x600.png?text=LG+Wing+4+Rear",
        "https://via.placeholder.com/800x600.png?text=LG+Wing+4+Specs"
      ],
      variantOptions: ["Storage"],
      variants: [{ attributes: [{ name: "Storage", value: "128 GB" }], price: 45990, mrp: 55990, stock: 45, sku: "LG-WING4-128" }]
    },
    {
      brand: "Nokia", cat: "Mobiles", name: "X30 5G",
      sku: "NOKIA-X30", price: 42990, mrp: 49990, stock: 55,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Nokia+X30+5G+Front",
        "https://via.placeholder.com/800x600.png?text=Nokia+X30+5G+Rear",
        "https://via.placeholder.com/800x600.png?text=Nokia+X30+5G+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Grey" }], price: 42990, mrp: 49990, stock: 55, sku: "NOKIA-X30-GRY" }]
    },
    {
      brand: "Google", cat: "Mobiles", name: "Pixel 8 Pro",
      sku: "GOOGLE-P8P", price: 109990, mrp: 125000, stock: 28,
      variantOptions: ["Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Google+Pixel+8+Pro+Front",
        "https://via.placeholder.com/800x600.png?text=Google+Pixel+8+Pro+Rear",
        "https://via.placeholder.com/800x600.png?text=Google+Pixel+8+Pro+Specs"
      ],
      variantOptions: ["Storage"],
      variants: [{ attributes: [{ name: "Storage", value: "256 GB" }], price: 109990, mrp: 125000, stock: 28, sku: "GOOGLE-P8P-256" }]
    },

    // === HEADPHONES (10) ===
    {
      brand: "Samsung", cat: "Headphones", name: "Galaxy Buds3",
      sku: "SAMSUNG-Buds3", price: 14990, mrp: 19990, stock: 80,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+Buds3+Front",
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+Buds3+Back",
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+Buds3+Case"
      ],
      variants: [{ attributes: [{ name: "Colour", value: "White" }], price: 14990, mrp: 19990, stock: 80, sku: "SAMSUNG-Buds3-WH" }]
    },
    {
      brand: "Apple", cat: "Headphones", name: "AirPods Pro 2",
      sku: "APPLE-AP2", price: 24990, mrp: 29990, stock: 70,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Apple+AirPods+Pro+2+Front",
        "https://via.placeholder.com/800x600.png?text=Apple+AirPods+Pro+2+Back",
        "https://via.placeholder.com/800x600.png?text=Apple+AirPods+Pro+2+Case"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Magenta" }], price: 24990, mrp: 29990, stock: 70, sku: "APPLE-AP2-MAG" }]
    },
    {
      brand: "Xiaomi", cat: "Headphones", name: "HyperSound 2.0",
      sku: "XIAOMI-HS2", price: 8990, mrp: 11990, stock: 100,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Xiaomi+HyperSound+2.0+Front",
        "https://via.placeholder.com/800x600.png?text=Xiaomi+HyperSound+2.0+Back",
        "https://via.placeholder.com/800x600.png?text=Xiaomi+HyperSound+2.0+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Black" }], price: 8990, mrp: 11990, stock: 100, sku: "XIAOMI-HS2-BLK" }]
    },
    {
      brand: "acer", cat: "Headphones", name: "TrueHear T1",
      sku: "ACER-THR1", price: 5990, mrp: 7990, stock: 120,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=acer+TrueHear+T1+Front",
        "https://via.placeholder.com/800x600.png?text=acer+TrueHear+T1+Back",
        "https://via.placeholder.com/800x600.png?text=acer+TrueHear+T1+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Silver" }], price: 5990, mrp: 7990, stock: 120, sku: "ACER-THR1-SLV" }]
    },
    {
      brand: "Boat", cat: "Headphones", name: "Airdopes 141",
      sku: "BOAT-AD141", price: 3490, mrp: 4490, stock: 150,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Boat+Airdopes+141+Front",
        "https://via.placeholder.com/800x600.png?text=Boat+Airdopes+141+Back",
        "https://via.placeholder.com/800x600.png?text=Boat+Airdopes+141+Case"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Red" }], price: 3490, mrp: 4490, stock: 150, sku: "BOAT-AD141-RED" }]
    },
    {
      brand: "OnePlus", cat: "Headphones", name: "Nord Buds 2r",
      sku: "ONEPLUS-NB2", price: 5490, mrp: 6990, stock: 90,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=OnePlus+Nord+Buds+2r+Front",
        "https://via.placeholder.com/800x600.png?text=OnePlus+Nord+Buds+2r+Back",
        "https://via.placeholder.com/800x600.png?text=OnePlus+Nord+Buds+2r+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Green" }], price: 5490, mrp: 6990, stock: 90, sku: "ONEPLUS-NB2-GRN" }]
    },
    {
      brand: "Sony", cat: "Headphones", name: "WH-1000XM5",
      sku: "SONY-WH1000XM5", price: 32990, mrp: 39990, stock: 45,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Sony+WH-1000XM5+Front",
        "https://via.placeholder.com/800x600.png?text=Sony+WH-1000XM5+Back",
        "https://via.placeholder.com/800x600.png?text=Sony+WH-1000XM5+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Black" }], price: 32990, mrp: 39990, stock: 45, sku: "SONY-WH1000XM5-BLK" }]
    },
    {
      brand: "LG", cat: "Headphones", name: "Tone Free FP9",
      sku: "LG-TF9", price: 7990, mrp: 9990, stock: 60,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=LG+Tone+Free+FP9+Front",
        "https://via.placeholder.com/800x600.png?text=LG+Tone+Free+FP9+Back",
        "https://via.placeholder.com/800x600.png?text=LG+Tone+Free+FP9+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Blue" }], price: 7990, mrp: 9990, stock: 60, sku: "LG-TF9-BLU" }]
    },
    {
      brand: "Nokia", cat: "Headphones", name: "Buds+",
      sku: "NOKIA-BP", price: 4490, mrp: 5490, stock: 110,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Nokia+Buds++Front",
        "https://via.placeholder.com/800x600.png?text=Nokia+Buds++Back",
        "https://via.placeholder.com/800x600.png?text=Nokia+Buds++Case"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Black" }], price: 4490, mrp: 5490, stock: 110, sku: "NOKIA-BP-BLK" }]
    },
    {
      brand: "Google", cat: "Headphones", name: "Pixel Buds Pro",
      sku: "GOOGLE-BP", price: 17990, mrp: 22990, stock: 55,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Google+Pixel+Buds+Pro+Front",
        "https://via.placeholder.com/800x600.png?text=Google+Pixel+Buds+Pro+Back",
        "https://via.placeholder.com/800x600.png?text=Google+Pixel+Buds+Pro+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Charcoal" }], price: 17990, mrp: 22990, stock: 55, sku: "GOOGLE-BP-CHL" }]
    },

    // === POWER BANKS (10) ===
    {
      brand: "Samsung", cat: "Power Banks", name: "PowerShare 10000",
      sku: "SAMSUNG-PB10K", price: 2490, mrp: 2990, stock: 200,
      variantOptions: ["Capacity"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Samsung+PowerShare+10000+Front",
        "https://via.placeholder.com/800x600.png?text=Samsung+PowerShare+10000+Back",
        "https://via.placeholder.com/800x600.png?text=Samsung+PowerShare+10000+Side"
      ],
      variants: [{ attributes: [{ name: "Capacity", value: "10000 mAh" }], price: 2490, mrp: 2990, stock: 200, sku: "SAMSUNG-PB10K-10K" }]
    },
    {
      brand: "Apple", cat: "Power Banks", name: "MagSafe Battery Pack",
      sku: "APPLE-MBP", price: 9990, mrp: 12990, stock: 150,
      variantOptions: ["Capacity"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Apple+MagSafe+Battery+Pack+Front",
        "https://via.placeholder.com/800x600.png?text=Apple+MagSafe+Battery+Pack+Back",
        "https://via.placeholder.com/800x600.png?text=Apple+MagSafe+Battery+Pack+Side"
      ],
      variants: [{ attributes: [{ name: "Capacity", value: "10000 mAh" }], price: 9990, mrp: 12990, stock: 150, sku: "APPLE-MBP-10K" }]
    },
    {
      brand: "Xiaomi", cat: "Power Banks", name: "Mi Power Bank 3",
      sku: "XIAOMI-PB3", price: 1690, mrp: 1990, stock: 250,
      variantOptions: ["Capacity"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Xiaomi+Mi+Power+Bank+3+Front",
        "https://via.placeholder.com/800x600.png?text=Xiaomi+Mi+Power+Bank+3+Back",
        "https://via.placeholder.com/800x600.png?text=Xiaomi+Mi+Power+Bank+3+Side"
      ],
      variants: [{ attributes: [{ name: "Capacity", value: "10000 mAh" }], price: 1690, mrp: 1990, stock: 250, sku: "XIAOMI-PB3-10K" }]
    },
    {
      brand: "acer", cat: "Power Banks", name: "PowerLite 20000",
      sku: "ACER-PB20K", price: 3290, mrp: 3990, stock: 180,
      variantOptions: ["Capacity"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=acer+PowerLite+20000+Front",
        "https://via.placeholder.com/800x600.png?text=acer+PowerLite+20000+Back",
        "https://via.placeholder.com/800x600.png?text=acer+PowerLite+20000+Side"
      ],
      variants: [{ attributes: [{ name: "Capacity", value: "20000 mAh" }], price: 3290, mrp: 3990, stock: 180, sku: "ACER-PB20K-20K" }]
    },
    {
      brand: "Boat", cat: "Power Banks", name: "VoltPod 10K",
      sku: "BOAT-VP10K", price: 1890, mrp: 2290, stock: 220,
      variantOptions: ["Capacity"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Boat+VoltPod+10K+Front",
        "https://via.placeholder.com/800x600.png?text=Boat+VoltPod+10K+Back",
        "https://via.placeholder.com/800x600.png?text=Boat+VoltPod+10K+Side"
      ],
      variants: [{ attributes: [{ name: "Capacity", value: "10000 mAh" }], price: 1890, mrp: 2290, stock: 220, sku: "BOAT-VP10K-10K" }]
    },
    {
      brand: "OnePlus", cat: "Power Banks", name: "Power Bank",
      sku: "ONEPLUS-PB", price: 2990, mrp: 3490, stock: 170,
      variantOptions: ["Capacity"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=OnePlus+Power+Bank+Front",
        "https://via.placeholder.com/800x600.png?text=OnePlus+Power+Bank+Back",
        "https://via.placeholder.com/800x600.png?text=OnePlus+Power+Bank+Side"
      ],
      variants: [{ attributes: [{ name: "Capacity", value: "10000 mAh" }], price: 2990, mrp: 3490, stock: 170, sku: "ONEPLUS-PB-10K" }]
    },
    {
      brand: "Sony", cat: "Power Banks", name: "NP-F battery 15000",
      sku: "SONY-PB15K", price: 4290, mrp: 4990, stock: 130,
      variantOptions: ["Capacity"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Sony+NP-F+battery+15000+Front",
        "https://via.placeholder.com/800x600.png?text=Sony+NP-F+battery+15000+Back",
        "https://via.placeholder.com/800x600.png?text=Sony+NP-F+battery+15000+Side"
      ],
      variants: [{ attributes: [{ name: "Capacity", value: "15000 mAh" }], price: 4290, mrp: 4990, stock: 130, sku: "SONY-PB15K-15K" }]
    },
    {
      brand: "LG", cat: "Power Banks", name: "High Capacity 30000",
      sku: "LG-PB30K", price: 4990, mrp: 5990, stock: 100,
      variantOptions: ["Capacity"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=LG+High+Capacity+30000+Front",
        "https://via.placeholder.com/800x600.png?text=LG+High+Capacity+30000+Back",
        "https://via.placeholder.com/800x600.png?text=LG+High+Capacity+30000+Side"
      ],
      variants: [{ attributes: [{ name: "Capacity", value: "30000 mAh" }], price: 4990, mrp: 5990, stock: 100, sku: "LG-PB30K-30K" }]
    },
    {
      brand: "Nokia", cat: "Power Banks", name: "Power UP 10K",
      sku: "NOKIA-PW10K", price: 1990, mrp: 2490, stock: 210,
      variantOptions: ["Capacity"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Nokia+Power+UP+10K+Front",
        "https://via.placeholder.com/800x600.png?text=Nokia+Power+UP+10K+Back",
        "https://via.placeholder.com/800x600.png?text=Nokia+Power+UP+10K+Side"
      ],
      variants: [{ attributes: [{ name: "Capacity", value: "10000 mAh" }], price: 1990, mrp: 2490, stock: 210, sku: "NOKIA-PW10K-10K" }]
    },
    {
      brand: "Google", cat: "Power Banks", name: "Nest Hub Power",
      sku: "GOOGLE-PWR", price: 3490, mrp: 3990, stock: 160,
      variantOptions: ["Capacity"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Google+Nest+Hub+Power+Front",
        "https://via.placeholder.com/800x600.png?text=Google+Nest+Hub+Power+Back",
        "https://via.placeholder.com/800x600.png?text=Google+Nest+Hub+Power+Side"
      ],
      variants: [{ attributes: [{ name: "Capacity", value: "10000 mAh" }], price: 3490, mrp: 3990, stock: 160, sku: "GOOGLE-PWR-10K" }]
    },

    // === SPEAKERS (10) ===
    {
      brand: "Samsung", cat: "Speakers", name: "Galaxy Go",
      sku: "SAMSUNG-GO", price: 8990, mrp: 11990, stock: 95,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+Go+Front",
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+Go+Back",
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+Go+Side"
      ],
      variants: [{ attributes: [{ name: "Colour", value: "Black" }], price: 8990, mrp: 11990, stock: 95, sku: "SAMSUNG-GO-BLK" }]
    },
    {
      brand: "Apple", cat: "Speakers", name: "HomePod mini",
      sku: "APPLE-HPM", price: 19990, mrp: 24990, stock: 85,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Apple+HomePod+mini+Front",
        "https://via.placeholder.com/800x600.png?text=Apple+HomePod+mini+Back",
        "https://via.placeholder.com/800x600.png?text=Apple+HomePod+mini+Side"
      ],
      variants: [{ attributes: [{ name: "Colour", value: "Yellow" }], price: 19990, mrp: 24990, stock: 85, sku: "APPLE-HPM-YEL" }]
    },
    {
      brand: "Xiaomi", cat: "Speakers", name: "Mini Speaker",
      sku: "XIAOMI-MS", price: 3990, mrp: 4990, stock: 130,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Xiaomi+Mini+Speaker+Front",
        "https://via.placeholder.com/800x600.png?text=Xiaomi+Mini+Speaker+Back",
        "https://via.placeholder.com/800x600.png?text=Xiaomi+Mini+Speaker+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "White" }], price: 3990, mrp: 4990, stock: 130, sku: "XIAOMI-MS-WHT" }]
    },
    {
      brand: "acer", cat: "Speakers", name: "AirSound Mini",
      sku: "ACER-ASM", price: 5490, mrp: 6990, stock: 100,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=acer+AirSound+Mini+Front",
        "https://via.placeholder.com/800x600.png?text=acer+AirSound+Mini+Back",
        "https://via.placeholder.com/800x600.png?text=acer+AirSound+Mini+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Grey" }], price: 5490, mrp: 6990, stock: 100, sku: "ACER-ASM-GRY" }]
    },
    {
      brand: "Boat", cat: "Speakers", name: "Stone SpinX",
      sku: "BOAT-SSX", price: 6990, mrp: 8990, stock: 75,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Boat+Stone+SpinX+Front",
        "https://via.placeholder.com/800x600.png?text=Boat+Stone+SpinX+Back",
        "https://via.placeholder.com/800x600.png?text=Boat+Stone+SpinX+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Red" }], price: 6990, mrp: 8990, stock: 75, sku: "BOAT-SSX-RED" }]
    },
    {
      brand: "OnePlus", cat: "Speakers", name: "Portable X",
      sku: "ONEPLUS-PX", price: 7990, mrp: 9990, stock: 80,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=OnePlus+Portable+X+Front",
        "https://via.placeholder.com/800x600.png?text=OnePlus+Portable+X+Back",
        "https://via.placeholder.com/800x600.png?text=OnePlus+Portable+X+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Green" }], price: 7990, mrp: 9990, stock: 80, sku: "ONEPLUS-PX-GRN" }]
    },
    {
      brand: "Sony", cat: "Speakers", name: "SRS-XB43",
      sku: "SONY-SXB43", price: 22990, mrp: 26990, stock: 50,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Sony+SRS-XB43+Front",
        "https://via.placeholder.com/800x600.png?text=Sony+SRS-XB43+Back",
        "https://via.placeholder.com/800x600.png?text=Sony+SRS-XB43+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Black" }], price: 22990, mrp: 26990, stock: 50, sku: "SONY-SXB43-BLK" }]
    },
    {
      brand: "LG", cat: "Speakers", name: "Xboom Go",
      sku: "LG-XBG", price: 12990, mrp: 14990, stock: 65,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=LG+Xboom+Go+Front",
        "https://via.placeholder.com/800x600.png?text=LG+Xboom+Go+Back",
        "https://via.placeholder.com/800x600.png?text=LG+Xboom+Go+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Silver" }], price: 12990, mrp: 14990, stock: 65, sku: "LG-XBG-SLV" }]
    },
    {
      brand: "Nokia", cat: "Speakers", name: "Wireless Boombox",
      sku: "NOKIA-WB", price: 7490, mrp: 8990, stock: 90,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Nokia+Wireless+Boombox+Front",
        "https://via.placeholder.com/800x600.png?text=Nokia+Wireless+Boombox+Back",
        "https://via.placeholder.com/800x600.png?text=Nokia+Wireless+Boombox+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Black" }], price: 7490, mrp: 8990, stock: 90, sku: "NOKIA-WB-BLK" }]
    },
    {
      brand: "Google", cat: "Speakers", name: "Nest Audio",
      sku: "GOOGLE-NA", price: 11990, mrp: 14990, stock: 70,
      variantOptions: ["Colour"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Google+Nest+Audio+Front",
        "https://via.placeholder.com/800x600.png?text=Google+Nest+Audio+Back",
        "https://via.placeholder.com/800x600.png?text=Google+Nest+Audio+Side"
      ],
      variantOptions: ["Colour"],
      variants: [{ attributes: [{ name: "Colour", value: "Charcoal" }], price: 11990, mrp: 14990, stock: 70, sku: "GOOGLE-NA-CHL" }]
    },

    // === LAPTOPS (10) ===
    {
      brand: "Samsung", cat: "Laptops", name: "Galaxy Book3 Pro",
      sku: "SAMSUNG-GB3P", price: 119990, mrp: 139990, stock: 22,
      variantOptions: ["RAM","Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+Book3+Pro+Front",
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+Book3+Pro+Back",
        "https://via.placeholder.com/800x600.png?text=Samsung+Galaxy+Book3+Pro+Side"
      ],
      variants: [{ attributes: [{ name: "RAM", value: "16 GB" }, { name: "Storage", value: "512 GB" }], price: 119990, mrp: 139990, stock: 22, sku: "SAMSUNG-GB3P-16512" }]
    },
    {
      brand: "Apple", cat: "Laptops", name: "MacBook Air M2",
      sku: "APPLE-MBAM2", price: 149990, mrp: 164990, stock: 18,
      variantOptions: ["RAM","Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Apple+MacBook+Air+M2+Front",
        "https://via.placeholder.com/800x600.png?text=Apple+MacBook+Air+M2+Back",
        "https://via.placeholder.com/800x600.png?text=Apple+MacBook+Air+M2+Side"
      ],
      variants: [{ attributes: [{ name: "RAM", value: "8 GB" }, { name: "Storage", value: "256 GB" }], price: 149990, mrp: 164990, stock: 18, sku: "APPLE-MBAM2-8256" }]
    },
    {
      brand: "Xiaomi", cat: "Laptops", name: "Notebook Pro",
      sku: "XIAOMI-NP", price: 85990, mrp: 99990, stock: 30,
      variantOptions: ["RAM","Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Xiaomi+Notebook+Pro+Front",
        "https://via.placeholder.com/800x600.png?text=Xiaomi+Notebook+Pro+Back",
        "https://via.placeholder.com/800x600.png?text=Xiaomi+Notebook+Pro+Side"
      ],
      variants: [{ attributes: [{ name: "RAM", value: "16 GB" }, { name: "Storage", value: "512 GB" }], price: 85990, mrp: 99990, stock: 30, sku: "XIAOMI-NP-16512" }]
    },
    {
      brand: "acer", cat: "Laptops", name: "Swift Go 14",
      sku: "ACER-SG14", price: 79990, mrp: 89990, stock: 25,
      variantOptions: ["RAM","Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=acer+Swift+Go+14+Front",
        "https://via.placeholder.com/800x600.png?text=acer+Swift+Go+14+Back",
        "https://via.placeholder.com/800x600.png?text=acer+Swift+Go+14+Side"
      ],
      variants: [{ attributes: [{ name: "RAM", value: "8 GB" }, { name: "Storage", value: "512 GB" }], price: 79990, mrp: 89990, stock: 25, sku: "ACER-SG14-8512" }]
    },
    {
      brand: "Boat", cat: "Laptops", name: "Notebook Pro",
      sku: "BOAT-NBK", price: 65990, mrp: 74990, stock: 35,
      variantOptions: ["RAM","Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Boat+Notebook+Pro+Front",
        "https://via.placeholder.com/800x600.png?text=Boat+Notebook+Pro+Back",
        "https://via.placeholder.com/800x600.png?text=Boat+Notebook+Pro+Side"
      ],
      variants: [{ attributes: [{ name: "RAM", value: "8 GB" }, { name: "Storage", value: "512 GB" }], price: 65990, mrp: 74990, stock: 35, sku: "BOAT-NBK-8512" }]
    },
    {
      brand: "OnePlus", cat: "Laptops", name: "Book One",
      sku: "ONEPLUS-BOOK", price: 109990, mrp: 124990, stock: 20,
      variantOptions: ["RAM","Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=OnePlus+Book+One+Front",
        "https://via.placeholder.com/800x600.png?text=OnePlus+Book+One+Back",
        "https://via.placeholder.com/800x600.png?text=OnePlus+Book+One+Side"
      ],
      variants: [{ attributes: [{ name: "RAM", value: "16 GB" }, { name: "Storage", value: "1 TB" }], price: 109990, mrp: 124990, stock: 20, sku: "ONEPLUS-BOOK-161T" }]
    },
    {
      brand: "Sony", cat: "Laptops", name: "Vaio Z",
      sku: "SONY-VZ", price: 189990, mrp: 209990, stock: 12,
      variantOptions: ["RAM","Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Sony+Vaio+Z+Front",
        "https://via.placeholder.com/800x600.png?text=Sony+Vaio+Z+Back",
        "https://via.placeholder.com/800x600.png?text=Sony+Vaio+Z+Side"
      ],
      variants: [{ attributes: [{ name: "RAM", value: "32 GB" }, { name: "Storage", value: "1 TB" }], price: 189990, mrp: 209990, stock: 12, sku: "SONY-VZ-321T" }]
    },
    {
      brand: "LG", cat: "Laptops", name: "Gram 16Z",
      sku: "LG-G16Z", price: 169990, mrp: 184990, stock: 15,
      variantOptions: ["RAM","Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=LG+Gram+16Z+Front",
        "https://via.placeholder.com/800x600.png?text=LG+Gram+16Z+Back",
        "https://via.placeholder.com/800x600.png?text=LG+Gram+16Z+Side"
      ],
      variants: [{ attributes: [{ name: "RAM", value: "16 GB" }, { name: "Storage", value: "1 TB" }], price: 169990, mrp: 184990, stock: 15, sku: "LG-G16Z-161T" }]
    },
    {
      brand: "Nokia", cat: "Laptops", name: "Booklet 13",
      sku: "NOKIA-BL13", price: 59990, mrp: 69990, stock: 40,
      variantOptions: ["RAM","Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Nokia+Booklet+13+Front",
        "https://via.placeholder.com/800x600.png?text=Nokia+Booklet+13+Back",
        "https://via.placeholder.com/800x600.png?text=Nokia+Booklet+13+Side"
      ],
      variants: [{ attributes: [{ name: "RAM", value: "8 GB" }, { name: "Storage", value: "256 GB" }], price: 59990, mrp: 69990, stock: 40, sku: "NOKIA-BL13-8256" }]
    },
    {
      brand: "Google", cat: "Laptops", name: "Pixelbook Go",
      sku: "GOOGLE-PBH", price: 119990, mrp: 134990, stock: 28,
      variantOptions: ["RAM","Storage"],
      imageUrls: [
        "https://via.placeholder.com/800x600.png?text=Google+Pixelbook+Go+Front",
        "https://via.placeholder.com/800x600.png?text=Google+Pixelbook+Go+Back",
        "https://via.placeholder.com/800x600.png?text=Google+Pixelbook+Go+Side"
      ],
      variants: [{ attributes: [{ name: "RAM", value: "8 GB" }, { name: "Storage", value: "128 GB" }], price: 119990, mrp: 134990, stock: 28, sku: "GOOGLE-PBH-8128" }]
    },
  ];

  let created = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const catKey = key(p.cat);
    const tag = catMap[catKey] ? catKey : "electronics";
    const resolvedCat = catMap[catKey] || null;
    const resolvedBrand = brandMap[key(p.brand)] || null;

    // build variants: use product-defined variants if present, otherwise generate from variantOptions
    let variants = [];
    if (p.variants && p.variants.length > 0) {
      p.variants.forEach((v, vi) => {
        variants.push({
          attributes: v.attributes || [],
          price: v.price || p.price,
          mrp: v.mrp || p.mrp,
          stock: v.stock !== undefined ? v.stock : Math.max(0, p.stock - vi),
          sku: v.sku || `${p.sku}-${String(vi).padStart(2, "0")}`,
        });
      });
    } else {
      const opts = p.variantOptions || ["Colour"];
      for (let v = 0; v < 3; v++) {
        const attrName = opts[0] || "Colour";
        const valList = variantAttrs[attrName] || ["Black"];
        variants.push({
          attributes: [{ name: attrName, value: valList[v % valList.length] }],
          price: p.price,
          mrp: p.mrp,
          stock: Math.max(0, p.stock - v * 10),
          sku: `${p.sku}-${String(v).padStart(2, "0")}`,
        });
      }
    }

    // flatten imageUrls into the image schema expected by the Product model
    // each entry: { url, publicId, alt }
    const images = p.imageUrls.map((u, idx) => ({
      url: u,
      publicId: `vortix-demo-${String(i)}-${idx}`,
      alt: `${p.name} image ${idx + 1}`
    }));

    const payload = {
      name: p.name,
      slug: p.name.toLowerCase().replace(/\s+/g, "-") + "-" + i,
      shortDescription: `${p.name} - premium ${tag} experience`,
      description: `Leading ${tag} quality from ${p.brand}. Reliable performance and trusted build.`,
      category: resolvedCat,
      brand: resolvedBrand,
      gstPercent: 18,
      price: p.price,
      mrp: p.mrp,
      stock: p.stock,
      variantOptions: p.variantOptions || ["Colour"],
      variants: variants,
      images: images,
      highlights: [{ name: "Quality", value: "Premium construction" }, { name: "Warranty", value: "1 year manufacturer warranty" }],
      keyFeatures: [`${p.name} - key feature ${i}`],
      boxContents: [p.name, "Manual", "Warranty card"],
      warrantyPeriod: "1 year",
      warrantyType: "Manufacturer warranty",
      weightGrams: 1500 + (i * 50),
      codAvailable: true,
      isPublished: false,
      isBlocked: false,
      isFeatured: i % 5 === 0,
      newArrival: i % 3 === 0,
      isBestSeller: i % 7 === 0,
      tags: [tag, "electronics"],
    };

    const exists = await Product.findOne({ slug: payload.slug });
    if (exists) {
      Object.assign(exists, payload);
      await exists.save();
    } else {
      await Product.create(payload);
    }
    created++;
    console.log(`Product ${created}: ${payload.name} (${payload.slug}) - ${payload.images.length} images`);
  }

  console.log(`\n${created} original-brand demo products seeded successfully (each with 3 images).`);
  console.log("Visit: /products to view the storefront list.\n");
  mongoose.disconnect();
}

seedDemoProducts()
  .catch((error) => { console.error("Could not seed demo products:", error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
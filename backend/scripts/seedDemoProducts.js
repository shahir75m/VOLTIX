// Bulk seed script: adds 50 demo products (mobiles, headsets, powerbanks, speakers, laptops)
// Run from backend: node scripts/seedDemoProducts.js
// Requires: MONGO_URI in backend/.env, and existing Categories & Brands

require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const Product = require("../models/Product");

const key = (value) => value.trim().toLowerCase();

async function seedDemoProducts() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing. Add it to backend/.env first.");
  await mongoose.connect(process.env.MONGO_URI);

  // Ensure default categories exist
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
  await Brand.collection.updateOne(
    { nameKey: key("VORTIX") },
    { $setOnInsert: { name: "VORTIX", nameKey: key("VORTIX"), normalizedName: key("VORTIX"), isDeleted: false, deletedAt: null, updatedAt: now } },
    { upsert: true }
  );

  const cats = await Category.find({ nameKey: { $in: catNames.map(key) } }).lean();
  const catMap = {};
  for (const c of cats) catMap[c.nameKey] = c._id;
  const brand = await Brand.findOne({ nameKey: key("VORTIX") });

  // product templates: name, category key (must match catMap key), brand, variantOptions, basePrice, baseMRP, baseStock
  // First 25 products (5 per category)
  const productTemplatesPart1 = [
    // Mobile phones
    { name: "VORTIX X1 Pro", catKey: "mobiles", brand: "VORTIX", variantOptions: ["Colour", "Storage"], basePrice: 29990, baseMRP: 34990, baseStock: 40 },
    { name: "VORTIX S5", catKey: "mobiles", brand: "VORTIX", variantOptions: ["Colour"], basePrice: 19990, baseMRP: 23990, baseStock: 60 },
    { name: "VORTIX A10", catKey: "mobiles", brand: "VORTIX", variantOptions: ["Colour", "Storage"], basePrice: 24990, baseMRP: 29990, baseStock: 30 },
    { name: "PowerMax P1", catKey: "mobiles", brand: "PowerMax", variantOptions: ["Colour"], basePrice: 15990, baseMRP: 19990, baseStock: 50 },
    { name: "SmartConnect X", catKey: "mobiles", brand: "SmartConnect", variantOptions: ["Colour"], basePrice: 12990, baseMRP: 15990, baseStock: 70 },

    // Headphones
    { name: "VORTIX Pulse Wireless", catKey: "headphones", brand: "VORTIX", variantOptions: ["Colour"], basePrice: 2499, baseMRP: 3999, baseStock: 25 },
    { name: "VORTIX BassBud", catKey: "headphones", brand: "VORTIX", variantOptions: ["Colour"], basePrice: 1299, baseMRP: 1999, baseStock: 80 },
    { name: "NoiseGear Pro", catKey: "headphones", brand: "NoiseGear", variantOptions: ["Colour"], basePrice: 3499, baseMRP: 4499, baseStock: 15 },
    { name: "EchoFit TWS", catKey: "headphones", brand: "EchoFit", variantOptions: ["Colour"], basePrice: 899, baseMRP: 1299, baseStock: 120 },
    { name: "StudioSound 2", catKey: "headphones", brand: "StudioSound", variantOptions: ["Colour"], basePrice: 2999, baseMRP: 4500, baseStock: 20 },

    // Power Banks
    { name: "VORTIX Power 10000", catKey: "power-banks", brand: "VORTIX", variantOptions: ["Capacity"], basePrice: 1299, baseMRP: 1499, baseStock: 100 },
    { name: "VORTIX Power 20000", catKey: "power-banks", brand: "VORTIX", variantOptions: ["Capacity"], basePrice: 2199, baseMRP: 2499, baseStock: 60 },
    { name: "ChargeMaster Pro", catKey: "power-banks", brand: "ChargeMaster", variantOptions: ["Capacity"], basePrice: 1799, baseMRP: 2299, baseStock: 45 },
    { name: "QuickPower 10K", catKey: "power-banks", brand: "QuickPower", variantOptions: ["Capacity"], basePrice: 999, baseMRP: 1299, baseStock: 150 },
    { name: "EnergyBoost 20K", catKey: "power-banks", brand: "EnergyBoost", variantOptions: ["Capacity"], basePrice: 2499, baseMRP: 2999, baseStock: 30 },

    // Speakers
    { name: "VORTIX BoomBox", catKey: "speakers", brand: "VORTIX", variantOptions: ["Colour"], basePrice: 3999, baseMRP: 4999, baseStock: 20 },
    { name: "VORTIX BeatsBud", catKey: "speakers", brand: "VORTIX", variantOptions: ["Colour"], basePrice: 1999, baseMRP: 2499, baseStock: 50 },
    { name: "BassBox X", catKey: "speakers", brand: "BassBox", variantOptions: ["Colour"], basePrice: 2799, baseMRP: 3500, baseStock: 35 },
    { name: "PartyLoud 5G", catKey: "speakers", brand: "PartyLoud", variantOptions: ["Colour"], basePrice: 1599, baseMRP: 1999, baseStock: 70 },
    { name: "ClearTone Mini", catKey: "speakers", brand: "ClearTone", variantOptions: ["Colour"], basePrice: 899, baseMRP: 1299, baseStock: 100 },

    // Laptops
    { name: "VORTIX UltraBook", catKey: "laptops", brand: "VORTIX", variantOptions: ["RAM", "Storage"], basePrice: 59990, baseMRP: 69990, baseStock: 15 },
    { name: "VORTIX Gaming Pro", catKey: "laptops", brand: "VORTIX", variantOptions: ["RAM", "Storage"], basePrice: 89990, baseMRP: 99990, baseStock: 10 },
    { name: "SpeedNote 14", catKey: "laptops", brand: "SpeedNote", variantOptions: ["RAM", "Storage"], basePrice: 45990, baseMRP: 52990, baseStock: 25 },
    { name: "WorkMate Pro", catKey: "laptops", brand: "WorkMate", variantOptions: ["RAM", "Storage"], basePrice: 52990, baseMRP: 62990, baseStock: 20 },
    { name: "LiteBook Go", catKey: "laptops", brand: "LiteBook", variantOptions: ["RAM", "Storage"], basePrice: 39990, baseMRP: 45990, baseStock: 35 },
  ];

  // Additional 25 products (5 per category) - variants with different specs
  const productTemplatesPart2 = [
    // Mobile phones (different price points)
    { name: "VORTIX X1 Lite", catKey: "mobiles", brand: "VORTIX", variantOptions: ["Colour"], basePrice: 19990, baseMRP: 23990, baseStock: 80 },
    { name: "VORTIX X2 Max", catKey: "mobiles", brand: "VORTIX", variantOptions: ["Colour", "Storage"], basePrice: 39990, baseMRP: 44990, baseStock: 25 },
    { name: "VORTIX A5", catKey: "mobiles", brand: "VORTIX", variantOptions: ["Colour"], basePrice: 14990, baseMRP: 17990, baseStock: 100 },
    { name: "PowerMax P2", catKey: "mobiles", brand: "PowerMax", variantOptions: ["Colour"], basePrice: 12990, baseMRP: 15990, baseStock: 70 },
    { name: "Connct Y", catKey: "mobiles", brand: "SmartConnect", variantOptions: ["Colour"], basePrice: 9990, baseMRP: 12990, baseStock: 120 },

    // Headphones (different models)
    { name: "VORTIX Beat 2", catKey: "headphones", brand: "VORTIX", variantOptions: ["Colour"], basePrice: 1999, baseMRP: 2999, baseStock: 60 },
    { name: "VORTIX SoundMax", catKey: "headphones", brand: "VORTIX", variantOptions: ["Colour"], basePrice: 3999, baseMRP: 4999, baseStock: 40 },
    { name: "BassPro Deluxe", catKey: "headphones", brand: "BassBox", variantOptions: ["Colour"], basePrice: 2499, baseMRP: 3299, baseStock: 50 },
    { name: "TruFit TWS", catKey: "headphones", brand: "EchoFit", variantOptions: ["Colour"], basePrice: 699, baseMRP: 899, baseStock: 150 },
    { name: "HomeTheater 5.1", catKey: "headphones", brand: "StudioSound", variantOptions: ["Colour"], basePrice: 1799, baseMRP: 2299, baseStock: 35 },

    // Power Banks (higher capacity)
    { name: "VORTIX Power 30000", catKey: "power-banks", brand: "VORTIX", variantOptions: ["Capacity"], basePrice: 2999, baseMRP: 3499, baseStock: 25 },
    { name: "SolarCharge 15K", catKey: "power-banks", brand: "QuickPower", variantOptions: ["Capacity"], basePrice: 1599, baseMRP: 1999, baseStock: 90 },
    { name: " turboPower 5K", catKey: "power-banks", brand: "EnergyBoost", variantOptions: ["Capacity"], basePrice: 799, baseMRP: 999, baseStock: 200 },
    { name: "HeavyDuty 30K", catKey: "power-banks", brand: "ChargeMaster", variantOptions: ["Capacity"], basePrice: 3299, baseMRP: 3999, baseStock: 20 },
    { name: "Compact 5000", catKey: "power-banks", brand: "PowerMax", variantOptions: ["Capacity"], basePrice: 699, baseMRP: 899, baseStock: 180 },

    // Speakers (different styles)
    { name: "VORTIX MiniSound", catKey: "speakers", brand: "VORTIX", variantOptions: ["Colour"], basePrice: 1299, baseMRP: 1799, baseStock: 100 },
    { name: "Wireless Beam", catKey: "speakers", brand: "PartyLoud", variantOptions: ["Colour"], basePrice: 2499, baseMRP: 2999, baseStock: 45 },
    { name: "StudioMonitor 2", catKey: "speakers", brand: "BassBox", variantOptions: ["Colour"], basePrice: 1999, baseMRP: 2499, baseStock: 60 },
    { name: "PodcastMic Set", catKey: "speakers", brand: "ClearTone", variantOptions: ["Colour"], basePrice: 899, baseMRP: 1299, baseStock: 120 },
    { name: "BassJack 10", catKey: "speakers", brand: "PartyLoud", variantOptions: ["Colour"], basePrice: 3499, baseMRP: 3999, baseStock: 30 },

    // Laptops (different configs)
    { name: "VORTIX UltraLight", catKey: "laptops", brand: "VORTIX", variantOptions: ["RAM", "Storage"], basePrice: 45990, baseMRP: 52990, baseStock: 30 },
    { name: "VORTIX WorkStation", catKey: "laptops", brand: "VORTIX", variantOptions: ["RAM", "Storage"], basePrice: 79990, baseMRP: 89990, baseStock: 12 },
    { name: "NoteBook Go", catKey: "laptops", brand: "SpeedNote", variantOptions: ["RAM", "Storage"], basePrice: 35990, baseMRP: 42990, baseStock: 45 },
    { name: "CreatorPro 16", catKey: "laptops", brand: "WorkMate", variantOptions: ["RAM", "Storage"], basePrice: 65990, baseMRP: 74990, baseStock: 18 },
    { name: "EduBook SE", catKey: "laptops", brand: "LiteBook", variantOptions: ["RAM", "Storage"], basePrice: 29990, baseMRP: 35990, baseStock: 55 },
  ];

  const variantAttrs = {
    Colour: ["Midnight Black", "Electric Lime", "Arctic White", "Sunset Red"],
    Storage: ["128 GB", "256 GB", "512 GB"],
    Capacity: ["10000 mAh", "20000 mAh", "30000 mAh"],
    RAM: ["8 GB", "16 GB", "32 GB"],
  };

  // map catKey to display tag
  const catTags = {
    mobiles: "mobiles", headphones: "headphones", "power-banks": "power-banks",
    speakers: "speakers", laptops: "laptops",
    // additional catKeys from part 2
    mobiles2: "mobiles", headphones2: "headphones", power-banks2: "power-banks", speakers2: "speakers", laptops2: "laptops"
  };

  const productTemplates = [...productTemplatesPart1, ...productTemplatesPart2];
  let created = 0;
  for (let i = 0; i < productTemplates.length; i++) {
    const t = productTemplates[i];
    const catKey = t.catKey;
    const attrList = variantAttrs[t.variantOptions?.[0] || "Colour"] || ["Default"];

    // use pre-mapped tag (support both part1 catKey and part2 catKey variants)
    const tag = catTags[catKey] || catTags[catKey + "2"] || "electronics";

    const variants = [];
    const numVariants = Math.min(3, attrList.length);
    for (let v = 0; v < numVariants; v++) {
      const variantPrice = t.basePrice + (v * 200);
      const variantMRP = t.baseMRP + (v * 300);
      variants.push({
        attributes: [{ name: t.variantOptions?.[0] || "Colour", value: attrList[v], hex: v === 0 ? "#15191f" : "" }],
        price: variantPrice,
        mrp: variantMRP,
        stock: Math.max(0, t.baseStock - v * 10),
        sku: `V${String(i).padStart(2, "0")}${String(v).padStart(2, "0")}`,
      });
    }

    const image = { url: `/vortix-demo-${String(i).padStart(2, "0")}.svg`, publicId: `vortix-demo-${String(i).padStart(2, "0")}`, alt: t.name };
    const payload = {
      name: t.name,
      slug: t.name.toLowerCase().replace(/\s+/g, "-") + "-" + i,
      shortDescription: `${t.name} - premium ${tag} experience`,
      description: `VORTIX quality ${tag}. Premium features and reliable performance.`,
      category: catMap[catKey] || catMap[catKey + "2"] || null,
      brand: brand._id,
      gstPercent: 18,
      price: t.basePrice,
      mrp: t.baseMRP,
      stock: t.baseStock,
      variantOptions: t.variantOptions || ["Colour"],
      variants: variants,
      images: [image],
      highlights: [{ name: "Quality", value: "Premium construction" }, { name: "Warranty", value: "1 year manufacturer warranty" }],
      keyFeatures: [`${t.name} - key feature ${i}`],
      boxContents: [t.name, "Manual", "Warranty card"],
      warrantyPeriod: "1 year",
      warrantyType: "Manufacturer warranty",
      weightGrams: 150 + (i * 10),
      codAvailable: true,
      isPublished: false,
      isBlocked: false,
      isFeatured: i % 5 === 0,
      newArrival: i % 3 === 0,
      isBestSeller: i % 7 === 0,
      tags: [tag, "electronics"],
    };

    // Upsert by slug
    const exists = await Product.findOne({ slug: payload.slug });
    if (exists) {
      Object.assign(exists, payload);
      await exists.save();
    } else {
      await Product.create(payload);
    }
    created++;
    console.log(`Product ${created}: ${payload.name} (${payload.slug})`);
  }

  console.log(`\n${created} demo products seeded successfully.`);
  console.log("Visit: /products to view the storefront list.\n");
  mongoose.disconnect();
}

seedDemoProducts()
  .catch((error) => { console.error("Could not seed demo products:", error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
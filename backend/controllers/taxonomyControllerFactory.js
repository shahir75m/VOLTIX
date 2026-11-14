const Product = require("../models/Product");
const { defaultSpecTemplate } = require("../config/specTemplates");
const shop = require("../config/shop");
const { isValidId, escapeRegex, parsePage, validateTaxonomyInput } = require("../utils/validators");
const { detectImageType, uploadBuffer, destroyImages } = require("../utils/imageUpload");

// Builds the admin handlers for "Category" and "Brand" (same rules, different model).
// Model         – mongoose model (name, nameKey, image, isDeleted)
// productField  – field on Product that points to it ("category" | "brand")
module.exports = function makeTaxonomyController({ Model, productField, label, folder }) {
  const lower = label.toLowerCase();

  const format = (doc, productCount = 0) => ({
    _id: doc._id,
    name: doc.name,
    ...(productField === "category" ? { specTemplate: doc.specTemplate?.length ? doc.specTemplate : defaultSpecTemplate(doc.name) } : {}),
    image: doc.image?.url || "",
    productCount,
    isDeleted: Boolean(doc.isDeleted),
    deletedAt: doc.deletedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });

  const duplicate = (res) =>
    res.status(409).json({
      success: false,
      message: `A ${lower} with this name already exists`,
      errors: { name: `A ${lower} with this name already exists` },
    });

  const uploadImage = async (file) => {
    if (!detectImageType(file.buffer)) {
      const error = new Error("Invalid image file");
      error.status = 400;
      throw error;
    }
    const result = await uploadBuffer(file.buffer, folder, [
      { width: 300, height: 300, crop: "fill", quality: "auto" },
    ]);
    return { url: result.secure_url, publicId: result.public_id };
  };

  const list = async (req, res) => {
    try {
      const page = parsePage(req.query.page);
      const limit = shop.ADMIN_PAGE_SIZE;
      const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 60) : "";

      const status = req.query.status || "all";
      if (status !== "all" && status !== "deleted") {
        return res.status(400).json({ success: false, message: "Invalid status filter" });
      }
      // Keep deleted records out of the default/all view. They are available
      // only when an admin explicitly selects the Deleted filter.
      const filter = { isDeleted: status === "deleted" };
      if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

      const total = await Model.countDocuments(filter);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, totalPages);

      const docs = await Model.find(filter)
        .sort({ createdAt: -1, _id: -1 }) // latest first
        .skip((safePage - 1) * limit)
        .limit(limit)
        .lean();

      const counts = await Product.aggregate([
        { $match: { isDeleted: false, [productField]: { $in: docs.map((d) => d._id) } } },
        { $group: { _id: `$${productField}`, count: { $sum: 1 } } },
      ]);
      const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

      return res.status(200).json({
        success: true,
        items: docs.map((d) => format(d, countMap.get(String(d._id)) || 0)),
        pagination: { currentPage: safePage, totalPages, totalItems: total, limit },
      });
    } catch (error) {
      console.error(`List ${label}s Error:`, error);
      return res.status(500).json({ success: false, message: `Failed to fetch ${lower}s` });
    }
  };

  const listAll = async (req, res) => {
    try {
      const items = await Model.find({ isDeleted: false })
        .select("name specTemplate")
        .sort({ name: 1 })
        .collation({ locale: "en", strength: 2 })
        .lean();
      return res.status(200).json({ success: true, items: items.map((item) => format(item)) });
    } catch (error) {
      console.error(`List All ${label}s Error:`, error);
      return res.status(500).json({ success: false, message: `Failed to fetch ${lower}s` });
    }
  };

  const create = async (req, res) => {
    let uploaded = null;
    try {
      const { errors, value } = validateTaxonomyInput(req.body, label);
      if (Object.keys(errors).length) {
        return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
      }

      const nameKey = value.name.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
      if (await Model.exists({ nameKey, isDeleted: false })) return duplicate(res);

      if (req.file) uploaded = await uploadImage(req.file);

      const doc = await Model.create({ name: value.name, nameKey, image: uploaded || undefined, ...(productField === "category" ? { specTemplate: value.specTemplate || defaultSpecTemplate(value.name) } : {}) });
      return res.status(201).json({ success: true, message: `${label} added successfully`, item: format(doc, 0) });
    } catch (error) {
      if (uploaded) await destroyImages([uploaded.publicId]);
      if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
      if (error.code === 11000) return duplicate(res);
      console.error(`Create ${label} Error:`, error);
      return res.status(500).json({ success: false, message: `Failed to add ${lower}` });
    }
  };

  const update = async (req, res) => {
    let uploaded = null;
    try {
      const { id } = req.params;
      if (!isValidId(id)) return res.status(400).json({ success: false, message: `Invalid ${lower} id` });

      const doc = await Model.findOne({ _id: id, isDeleted: false });
      if (!doc) return res.status(404).json({ success: false, message: `${label} not found` });

      const { errors, value } = validateTaxonomyInput(req.body, label);
      if (Object.keys(errors).length) {
        return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
      }

      const nameKey = value.name.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
      if (await Model.exists({ nameKey, isDeleted: false, _id: { $ne: doc._id } })) return duplicate(res);

      const oldPublicId = doc.image?.publicId;
      let removeOld = false;

      if (req.file) {
        uploaded = await uploadImage(req.file);
        doc.image = uploaded;
        removeOld = true;
      } else if (req.body.removeImage === "true") {
        doc.image = { url: "", publicId: "" };
        removeOld = true;
      }

      if (productField === "category" && value.specTemplate !== undefined) doc.specTemplate = value.specTemplate;
      doc.name = value.name;
      doc.nameKey = nameKey;
      await doc.save();

      if (removeOld && oldPublicId) await destroyImages([oldPublicId]);

      const productCount = await Product.countDocuments({ [productField]: doc._id, isDeleted: false });
      return res.status(200).json({ success: true, message: `${label} updated successfully`, item: format(doc, productCount) });
    } catch (error) {
      if (uploaded) await destroyImages([uploaded.publicId]);
      if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
      if (error.code === 11000) return duplicate(res);
      console.error(`Update ${label} Error:`, error);
      return res.status(500).json({ success: false, message: `Failed to update ${lower}` });
    }
  };

  // soft delete
  const remove = async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidId(id)) return res.status(400).json({ success: false, message: `Invalid ${lower} id` });

      const doc = await Model.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: new Date() } },
        { new: true }
      );
      if (!doc) return res.status(404).json({ success: false, message: `${label} not found` });

      return res.status(200).json({
        success: true,
        message: `${label} deleted. Its products are now hidden from the store.`,
      });
    } catch (error) {
      console.error(`Delete ${label} Error:`, error);
      return res.status(500).json({ success: false, message: `Failed to delete ${lower}` });
    }
  };

  const restore = async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidId(id)) return res.status(400).json({ success: false, message: `Invalid ${lower} id` });

      const doc = await Model.findOneAndUpdate(
        { _id: id, isDeleted: true },
        { $set: { isDeleted: false, deletedAt: null } },
        { new: true }
      );
      if (!doc) return res.status(404).json({ success: false, message: `Deleted ${lower} not found` });

      const productCount = await Product.countDocuments({ [productField]: doc._id, isDeleted: false });
      return res.status(200).json({ success: true, message: `${label} restored`, item: format(doc, productCount) });
    } catch (error) {
      if (error.code === 11000) return duplicate(res);
      console.error(`Restore ${label} Error:`, error);
      return res.status(500).json({ success: false, message: `Failed to restore ${lower}` });
    }
  };

  return { list, listAll, create, update, remove, restore };
};

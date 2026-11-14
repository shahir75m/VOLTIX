const multer = require("multer");
const shop = require("../config/shop");

const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

const build = (maxSize, maxFiles) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize, files: maxFiles, fields: 50, fieldSize: 100 * 1024 },
    fileFilter: (req, file, cb) =>
      allowedTypes.includes(file.mimetype)
        ? cb(null, true)
        : cb(new Error("Only JPG, PNG and WebP images are allowed")),
  });

const productUploader = build(shop.MAX_IMAGE_SIZE, shop.MAX_PRODUCT_IMAGES);
const categoryUploader = build(2 * 1024 * 1024, 1);

const wrap = (handler, sizeMessage) => (req, res, next) =>
  handler(req, res, (error) => {
    if (!error) return next();
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? sizeMessage
        : error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE"
          ? `You can upload at most ${shop.MAX_PRODUCT_IMAGES} images`
          : error.message || "Invalid upload";
    return res.status(400).json({ success: false, message });
  });

const uploadProductImages = wrap(
  productUploader.array("images", shop.MAX_PRODUCT_IMAGES),
  "Each image must be 5 MB or smaller"
);
const uploadCategoryImage = wrap(categoryUploader.single("image"), "Category image must be 2 MB or smaller");

module.exports = { uploadProductImages, uploadCategoryImage };

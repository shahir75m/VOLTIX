const multer = require("multer");

const allowed = ["image/jpeg", "image/png", "image/webp"];
const build = (maxSize, maxFiles) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize, files: maxFiles, fields: 40, fieldSize: 20 * 1024 },
    fileFilter: (req, file, cb) =>
      allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("Only JPG, PNG and WebP images are allowed")),
  });

const wrap = (handler, sizeMessage) => (req, res, next) =>
  handler(req, res, (error) => {
    if (!error) return next();
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? sizeMessage
        : error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE"
          ? "Too many files uploaded"
          : error.message || "Invalid upload";
    return res.status(400).json({ success: false, message });
  });

// offer banner: one image, up to 5 MB
const uploadOfferImage = wrap(build(5 * 1024 * 1024, 1).single("image"), "Banner image must be 5 MB or smaller");
// return request photos: up to 3 images, 3 MB each
const uploadReturnPhotos = wrap(build(3 * 1024 * 1024, 3).array("photos", 3), "Each photo must be 3 MB or smaller");

// review photos: up to 3 images, 3 MB each
const uploadReviewPhotos = wrap(build(3 * 1024 * 1024, 3).array("photos", 3), "Each photo must be 3 MB or smaller");

module.exports = { uploadOfferImage, uploadReturnPhotos, uploadReviewPhotos };

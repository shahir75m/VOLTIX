const multer = require("multer");

// Store uploaded image temporarily in memory
const storage = multer.memoryStorage();

// Allowed image MIME types
const allowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const profileImageUpload = multer({
  storage,

  limits: {
    fileSize: 2 * 1024 * 1024, 
    files: 1,
  },

  fileFilter: (req, file, callback) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error("Only JPG, PNG and WebP images are allowed")
      );
    }

    callback(null, true);
  },
});

module.exports = profileImageUpload;
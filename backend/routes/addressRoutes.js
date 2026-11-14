const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const { protectUser } = require("../middleware/userAuthMiddleware");

const {
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require("../controllers/addressController");

const getPincodeDetails = require("../services/pincodeService");

// Pincode lookup calls an external service, so keep it public but protected
// from scripted abuse before any upstream request is made.
const pincodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === "test" ? 10000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many pincode lookups. Please try again shortly." },
});

router.get("/pincode/:pincode", pincodeLimiter, async (req, res) => {
  try {
    const { pincode } = req.params;

    if (!/^[0-9]{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 6-digit pincode",
      });
    }

    const details = await getPincodeDetails(pincode);

    if (!details) {
      return res.status(404).json({
        success: false,
        message: "Pincode not found",
      });
    }

    return res.json({
      success: true,
      ...details,
    });
  } catch (error) {
    console.error("Pincode lookup error:", error.message);

    return res.status(503).json({
      success: false,
      message: "Pincode service unavailable. Please try again.",
    });
  }
});

// All address routes require login
router.use(protectUser);

// Get logged-in user's addresses
router.get("/", getAddresses);

// Add new address
router.post("/", addAddress);

// Update existing address
router.put("/:id", updateAddress);

// Delete address
router.delete("/:id", deleteAddress);

// Set default address
router.patch("/:id/default", setDefaultAddress);

module.exports = router;

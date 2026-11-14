const mongoose = require("mongoose");
const Address = require("../models/Address");
const getPincodeDetails = require("../services/pincodeService");

const limits = { addressType: 30, fullName: 60, addressLine1: 200, addressLine2: 200, city: 100, district: 100, state: 100 };
const allowedFields = ["addressType", "fullName", "phone", "addressLine1", "addressLine2", "city", "district", "state", "pincode"];
const labels = { addressType: "Address type", fullName: "Full name", phone: "Phone number", addressLine1: "Address line 1", addressLine2: "Address line 2", city: "City", district: "District", state: "State", pincode: "Pincode" };
const namePattern = /^[\p{L}\p{M} .'-]+$/u;
const placePattern = /^[\p{L}\p{M} .'-]+$/u;
const badRequest = (res, message) => res.status(400).json({ success: false, message });
const serverError = (res, message) => res.status(500).json({ success: false, message });
const normalize = (value) => value.trim().replace(/\s+/g, " ").toLowerCase();

function validateField(field, value) {
  const label = labels[field];
  if (typeof value !== "string") return `${label} must be text.`;
  const clean = value.trim();
  if (field === "addressLine2") return clean.length > limits.addressLine2 ? "Address line 2 must not exceed 200 characters." : "";
  if (!clean) return `${label} is required.`;
  if (field === "phone") return /^[6-9]\d{9}$/.test(clean) ? "" : "Enter a valid 10-digit Indian mobile number.";
  if (field === "pincode") return /^[1-9]\d{5}$/.test(clean) ? "" : "Enter a valid 6-digit Indian pincode.";
  if (clean.length > limits[field]) return `${label} must not exceed ${limits[field]} characters.`;
  if (field === "addressType" && clean.length < 2) return "Address type must contain 2 to 30 characters.";
  if (field === "fullName") {
    if (clean.length < 2) return "Full name must contain 2 to 60 characters.";
    if (!namePattern.test(clean) || !/\p{L}/u.test(clean)) return "Full name can contain letters, spaces, dots, apostrophes and hyphens only.";
  }
  if (["city", "district", "state"].includes(field) && (!placePattern.test(clean) || !/\p{L}/u.test(clean))) return `${label} contains invalid characters.`;
  return "";
}

async function validatePincodeLocation(pincode, state, district) {
  try {
    const details = await getPincodeDetails(pincode);
    if (!details || typeof details.state !== "string" || typeof details.district !== "string") return { valid: false, status: 400, message: "Invalid pincode." };
    if (normalize(details.state) !== normalize(state)) return { valid: false, status: 400, message: `Pincode ${pincode} belongs to ${details.state}, not ${state}.` };
    if (normalize(details.district) !== normalize(district)) return { valid: false, status: 400, message: `Pincode ${pincode} belongs to ${details.district} district, not ${district}.` };
    return { valid: true };
  } catch (error) {
    console.error("Pincode validation error:", error);
    return { valid: false, status: 503, message: "Unable to verify pincode. Please try again." };
  }
}

function handleError(res, error, fallback) {
  console.error(fallback, error);
  if (error.name === "CastError") return badRequest(res, "Invalid address ID.");
  if (error.name === "ValidationError") return badRequest(res, "Please check the address details.");
  if (error.code === 11000) return res.status(409).json({ success: false, message: "Default address conflict. Please try again." });
  return serverError(res, fallback);
}

const addAddress = async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest(res, "Invalid address details.");
    const unknown = Object.keys(body).find((field) => !allowedFields.includes(field));
    if (unknown) return badRequest(res, `Cannot set ${unknown}.`);
    const values = { ...body, addressType: body.addressType === undefined ? "Home" : body.addressType, addressLine2: body.addressLine2 === undefined ? "" : body.addressLine2 };
    for (const field of allowedFields) {
      const message = validateField(field, values[field]);
      if (message) return badRequest(res, message);
      values[field] = values[field].trim();
    }
    const check = await validatePincodeLocation(values.pincode, values.state, values.district);
    if (!check.valid) return res.status(check.status).json({ success: false, message: check.message });
    const existingAddress = await Address.exists({ user: req.user._id });
    const address = await Address.create({ ...values, user: req.user._id, isDefault: !existingAddress });
    return res.status(201).json({ success: true, message: "Address added successfully.", address });
  } catch (error) { return handleError(res, error, "Failed to add address."); }
};

const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 }).lean();
    return res.status(200).json({ success: true, count: addresses.length, addresses });
  } catch (error) { return handleError(res, error, "Failed to fetch addresses."); }
};

const updateAddress = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badRequest(res, "Invalid address ID.");
    const updates = req.body;
    if (!updates || typeof updates !== "object" || Array.isArray(updates) || !Object.keys(updates).length) return badRequest(res, "No valid fields provided.");
    const unknown = Object.keys(updates).find((field) => !allowedFields.includes(field));
    if (unknown) return badRequest(res, `Cannot update ${unknown}.`);
    const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!address) return res.status(404).json({ success: false, message: "Address not found." });
    for (const [field, value] of Object.entries(updates)) {
      const message = validateField(field, value);
      if (message) return badRequest(res, message);
      address[field] = value.trim();
    }
    // Legacy addresses can have no district. Editing requires the new district field.
    if (!address.district) return badRequest(res, "District is required. Enter your pincode to fill district.");
    const check = await validatePincodeLocation(address.pincode, address.state, address.district);
    if (!check.valid) return res.status(check.status).json({ success: false, message: check.message });
    await address.save();
    return res.status(200).json({ success: true, message: "Address updated successfully.", address });
  } catch (error) { return handleError(res, error, "Failed to update address."); }
};

const deleteAddress = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badRequest(res, "Invalid address ID.");
    const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!address) return res.status(404).json({ success: false, message: "Address not found." });
    const wasDefault = address.isDefault;
    await address.deleteOne();
    if (wasDefault) {
      const next = await Address.findOne({ user: req.user._id }).sort({ createdAt: -1 });
      if (next) { next.isDefault = true; await next.save(); }
    }
    return res.status(200).json({ success: true, message: "Address deleted successfully." });
  } catch (error) { return handleError(res, error, "Failed to delete address."); }
};

const setDefaultAddress = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badRequest(res, "Invalid address ID.");
    const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!address) return res.status(404).json({ success: false, message: "Address not found." });
    if (address.isDefault) return res.status(200).json({ success: true, message: "Address is already default.", address });
    await Address.updateMany({ user: req.user._id, isDefault: true }, { $set: { isDefault: false } });
    address.isDefault = true;
    await address.save();
    return res.status(200).json({ success: true, message: "Default address updated successfully.", address });
  } catch (error) { return handleError(res, error, "Failed to update default address."); }
};

module.exports = { addAddress, getAddresses, updateAddress, deleteAddress, setDefaultAddress };

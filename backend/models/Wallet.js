const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  type: { type: String, enum: ["Credit", "Debit"], required: true },
  amount: { type: Number, min: 0.01, required: true },
  description: { type: String, trim: true, maxlength: 200, default: "Wallet transaction" },
  sourceOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const walletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  balance: { type: Number, min: 0, default: 0 },
  transactions: { type: [transactionSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model("Wallet", walletSchema);

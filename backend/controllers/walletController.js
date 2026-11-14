const Wallet = require("../models/Wallet");

// Wallet funds are store credits issued after an approved return. Customers cannot self-credit.
exports.getMyWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOneAndUpdate(
      { user: req.user._id },
      { $setOnInsert: { balance: 0, transactions: [] } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return res.status(200).json({
      success: true,
      wallet: {
        balance: Number(wallet.balance || 0),
        transactions: [...(wallet.transactions || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100),
      },
    });
  } catch (error) {
    console.error("Wallet fetch error:", error);
    return res.status(500).json({ success: false, message: "Failed to load wallet" });
  }
};

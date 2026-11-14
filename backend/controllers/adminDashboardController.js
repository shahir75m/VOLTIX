const Order = require("../models/Order");
const Product = require("../models/Product");
const shop = require("../config/shop");

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

// GET /api/admin/dashboard
// Calculates from the store's source of truth, avoiding stale duplicate counters.
const getDashboard = async (req, res) => {
  try {
    const today = startOfDay(new Date());
    const sevenDaysAgo = new Date(today.getTime() - 6 * DAY_MS);
    const thirtyDaysAgo = new Date(today.getTime() - 29 * DAY_MS);
    const paidOrder = { status: { $nin: ["Cancelled"] }, paymentStatus: "Completed" };

    const [revenue, orderCount, processingOrders, lowStockItemCount, lowStock, recentOrders, pendingReturns, salesByDay] = await Promise.all([
      Order.aggregate([{ $match: { ...paidOrder, createdAt: { $gte: thirtyDaysAgo } } }, { $group: { _id: null, total: { $sum: "$totalPrice" }, count: { $sum: 1 } } }]),
      Order.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Order.countDocuments({ status: { $in: ["Pending", "Confirmed"] } }),
      Product.countDocuments({ isDeleted: false, stock: { $lte: shop.LOW_STOCK_LIMIT } }),
      Product.find({ isDeleted: false, stock: { $lte: shop.LOW_STOCK_LIMIT } }).select("name stock").sort({ stock: 1, updatedAt: -1 }).limit(5).lean(),
      Order.find({}).select("orderId totalPrice status shippingAddress.fullName user createdAt").populate("user", "name").sort({ createdAt: -1 }).limit(5).lean(),
      Order.find({ "returnRequest.isRequested": true, "returnRequest.status": "Pending" }).select("orderId orderItems returnRequest.reason").sort({ "returnRequest.requestedAt": -1 }).limit(1).lean(),
      Order.aggregate([{ $match: { ...paidOrder, createdAt: { $gte: sevenDaysAgo } } }, { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, day: { $dayOfMonth: "$createdAt" } }, total: { $sum: "$totalPrice" } } }]),
    ]);

    const salesMap = new Map(salesByDay.map((sale) => [`${sale._id.year}-${sale._id.month}-${sale._id.day}`, sale.total]));
    const sales = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(sevenDaysAgo.getTime() + index * DAY_MS);
      return { date: date.toISOString().slice(0, 10), label: date.toLocaleDateString("en-IN", { weekday: "short" }), amount: salesMap.get(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`) || 0 };
    });

    const pendingReturn = pendingReturns[0];
    return res.status(200).json({
      success: true,
      // Kept for the shared admin-session guard, which validates this route.
      admin: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role },
      stats: { revenue30Days: revenue[0]?.total || 0, revenueOrderCount: revenue[0]?.count || 0, orders7Days: orderCount, processingOrders, lowStockItems: lowStockItemCount },
      sales,
      orders: recentOrders.map((order) => ({ _id: order._id, orderId: order.orderId, customer: order.shippingAddress?.fullName || order.user?.name || "Customer", total: order.totalPrice, status: order.status })),
      lowStock: lowStock.map((product) => ({ _id: product._id, name: product.name, stock: product.stock, status: product.stock === 0 ? "Out of stock" : "Low stock" })),
      pendingReturn: pendingReturn ? { orderId: pendingReturn.orderId, item: pendingReturn.orderItems?.[0]?.name || "Order items", reason: pendingReturn.returnRequest?.reason || "Return requested" } : null,
    });
  } catch (error) {
    console.error("Load dashboard error:", error);
    return res.status(500).json({ success: false, message: "Failed to load dashboard" });
  }
};

module.exports = { getDashboard };

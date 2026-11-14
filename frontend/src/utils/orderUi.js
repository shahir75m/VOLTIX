// Labels and colours shared by the admin order pages

// The order lines a return request is about (older requests without a selection = the whole order)
export const returnedItems = (order) => {
  const chosen = order.returnRequest?.items || [];
  return chosen.length ? order.orderItems.filter((i) => chosen.some((r) => String(r.itemId) === String(i._id))) : order.orderItems;
};
export const statusPill = (order) => {
  if (order.status === "Pending") return { label: order.paymentMethod === "Razorpay" ? "Payment pending" : "Pending", cls: "yellow" };
  if (order.status === "Confirmed") return { label: "Processing", cls: "yellow" };
  if (["Shipped", "Out for Delivery"].includes(order.status)) return { label: order.status, cls: "blue" };
  if (order.status === "Delivered") return { label: "Delivered", cls: "green" };
  if (order.status === "Cancelled") return { label: "Cancelled", cls: "red" };
  return { label: order.status, cls: "grey" };
};

export const paymentLabel = (order) => ({
  method: order.paymentMethod === "COD" ? "COD" : order.paymentMethod === "Wallet" ? "Wallet" : "Online",
  state: order.paymentStatus === "Completed" ? "Paid" : order.paymentStatus === "Refunded" ? "Refunded" : order.paymentStatus === "Failed" ? "Failed" : "Unpaid",
});


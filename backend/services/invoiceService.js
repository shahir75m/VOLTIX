const PDFDocument = require("pdfkit");

/**
 * Generate PDF Invoice buffer for an order
 * @param {Object} order 
 * @param {Object} user 
 * @returns {Promise<Buffer>}
 */
function generateInvoicePDF(order, user) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const buffers = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      // Header Brand
      doc
        .fillColor("#11151b")
        .fontSize(22)
        .font("Helvetica-Bold")
        .text("VOLTIX", 40, 40)
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#6b7280")
        .text("Premium Gadgets Store", 40, 68)
        .text("support@voltix.in | www.voltix.com", 40, 82);

      // Invoice Meta (Right side)
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#11151b")
        .text("TAX INVOICE", 380, 40, { align: "right" })
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#4b5563")
        .text(`Invoice No: INV-${order.orderId}`, 380, 64, { align: "right" })
        .text(`Order Date: ${new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`, 380, 78, { align: "right" })
        .text(`Order Status: ${order.status}`, 380, 92, { align: "right" });

      doc.moveTo(40, 115).lineTo(555, 115).strokeColor("#e5e7eb").stroke();

      // Bill To & Ship To
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#11151b")
        .text("Billed & Delivered To:", 40, 130)
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#374151")
        .text(order.shippingAddress?.fullName || user?.name || "Customer", 40, 146)
        .text(order.shippingAddress?.addressLine1 || "", 40, 160)
        .text(`${order.shippingAddress?.city || ""}, ${order.shippingAddress?.state || ""} - ${order.shippingAddress?.pincode || ""}`, 40, 174)
        .text(`Phone: ${order.shippingAddress?.phone || user?.phone || "N/A"}`, 40, 188);

      // Payment Info (Right side)
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#11151b")
        .text("Payment Information:", 340, 130)
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#374151")
        .text(`Method: ${order.paymentMethod}`, 340, 146)
        .text(`Status: ${order.paymentStatus || (order.isPaid ? "Paid" : "Pending")}`, 340, 160)
        .text(`Payment ID: ${order.razorpayPaymentId || "N/A (COD)"}`, 340, 174);

      doc.moveTo(40, 215).lineTo(555, 215).strokeColor("#e5e7eb").stroke();

      // Items Table Header
      let tableY = 230;
      doc
        .rect(40, tableY - 5, 515, 22)
        .fill("#f3f4f6");

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#11151b")
        .text("ITEM DESCRIPTION", 48, tableY)
        .text("QTY", 330, tableY, { width: 40, align: "center" })
        .text("PRICE", 380, tableY, { width: 80, align: "right" })
        .text("TOTAL", 470, tableY, { width: 80, align: "right" });

      tableY += 25;

      // Items Rows
      order.orderItems.forEach((item) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor("#11151b")
          .text(item.name, 48, tableY, { width: 270 });

        if (item.variantLabel) {
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#6b7280")
            .text(item.variantLabel, 48, tableY + 12);
        }

        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#374151")
          .text(String(item.qty), 330, tableY, { width: 40, align: "center" })
          .text(`₹${Number(item.price).toLocaleString("en-IN")}`, 380, tableY, { width: 80, align: "right" })
          .font("Helvetica-Bold")
          .text(`₹${Number(item.lineTotal || item.price * item.qty).toLocaleString("en-IN")}`, 470, tableY, { width: 80, align: "right" });

        tableY += item.variantLabel ? 32 : 24;

        doc.moveTo(40, tableY).lineTo(555, tableY).strokeColor("#f3f4f6").stroke();
        tableY += 8;
      });

      // Summary Table
      tableY += 15;
      const summaryX = 350;
      const valX = 470;

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#4b5563")
        .text("Items Subtotal:", summaryX, tableY)
        .text(`₹${Number(order.itemsPrice || order.totalPrice).toLocaleString("en-IN")}`, valX, tableY, { width: 80, align: "right" });

      tableY += 18;
      doc
        .text("Delivery / Shipping:", summaryX, tableY)
        .text(order.shippingPrice > 0 ? `₹${order.shippingPrice}` : "FREE", valX, tableY, { width: 80, align: "right" });

      if (order.discountPrice > 0) {
        tableY += 18;
        doc
          .fillColor("#166534")
          .text(`Coupon Discount (${order.couponCode || "PROMO"}):`, summaryX, tableY)
          .text(`- ₹${Number(order.discountPrice).toLocaleString("en-IN")}`, valX, tableY, { width: 80, align: "right" });
      }

      if (order.taxPrice > 0) {
        tableY += 18;
        doc
          .fillColor("#4b5563")
          .text("GST included in price:", summaryX, tableY)
          .text(`₹${Number(order.taxPrice).toLocaleString("en-IN")}`, valX, tableY, { width: 80, align: "right" });
      }

      tableY += 22;
      doc.moveTo(summaryX, tableY - 4).lineTo(555, tableY - 4).strokeColor("#11151b").stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#11151b")
        .text("Total Paid / Due:", summaryX, tableY)
        .text(`₹${Number(order.totalPrice).toLocaleString("en-IN")}`, valX, tableY, { width: 80, align: "right" });

      // Footer
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#9ca3af")
        .text("Thank you for shopping with VOLTIX. All electronic products include manufacturer warranty as specified.", 40, 740, { align: "center", width: 515 })
        .text("This is a computer-generated tax invoice and does not require a physical signature.", 40, 755, { align: "center", width: 515 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateInvoicePDF };

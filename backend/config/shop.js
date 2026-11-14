// Central shop rules. Change a value here and it applies everywhere
// (cart, wishlist, listing, checkout revalidation).
module.exports = {
  MAX_QTY_PER_ITEM: 5,        // max units of one product/variant in a cart
  MAX_CART_LINES: 20,         // max different lines in one cart
  MAX_PRODUCT_IMAGES: 35,    // room for general images plus one per variant
  MAX_IMAGE_SIZE: 5 * 1024 * 1024,
  MAX_PRICE: 10000000,
  MAX_STOCK: 100000,
  LOW_STOCK_LIMIT: 10,        // admin "Low stock" badge threshold
  ADMIN_PAGE_SIZE: 10,
  STORE_PAGE_SIZE: 12,
  STORE_STATE: "Kerala",      // delivery is fastest inside this state
  DELIVERY_PROCESSING_DAYS: 1, // packing time before the courier picks the parcel up
  DELIVERY_DAYS_SAME_STATE: [1, 2], // transit days (min, max)
  DELIVERY_DAYS_OTHER_STATE: [3, 6],
  RETURN_WINDOW_DAYS: 7,      // customer can request a return within N days of delivery
  HIDE_OUT_OF_STOCK_IN_LISTING: false, // true = customers do not see 0-stock products in the list
};

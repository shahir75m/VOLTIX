import { createContext, useContext } from "react";

export const ShopContext = createContext(null);

// user, cartCount, wishlist helpers and toast – provided by <StoreLayout>
export const useShop = () => {
  const value = useContext(ShopContext);
  if (!value) throw new Error("useShop must be used inside <StoreLayout>");
  return value;
};

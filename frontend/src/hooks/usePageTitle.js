import { useEffect } from "react";

// Sets the browser tab title (also what bookmarks and history show).
export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | Voltix` : "Voltix | Phones, Laptops, Audio & Gadgets";
  }, [title]);
}

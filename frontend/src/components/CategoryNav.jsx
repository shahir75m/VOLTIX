import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../utils/api";
import "./CategoryNav.css";

export default function CategoryNav({ categories, className = "voltix-store-category-nav" }) {
  const [loaded, setLoaded] = useState([]);
  const scrollRef = useRef(null);
  useEffect(() => {
    if (categories !== undefined) return undefined;
    const controller = new AbortController();
    apiFetch("/api/products/categories", { signal: controller.signal })
      .then((data) => setLoaded(data.categories || []))
      .catch(() => {});
    return () => controller.abort();
  }, [categories]);
  useEffect(() => {
    const element = scrollRef.current;
    const wheel = (event) => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY) || element.scrollWidth <= element.clientWidth) return;
      const distance = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1);
      const next = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + distance));
      if (next === element.scrollLeft) return;
      event.preventDefault();
      element.scrollLeft = next;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  const items = (categories || loaded).filter((category) => category?._id && category.name && !category.isDeleted);
  return <nav className={`${className} vx-category-bar`} aria-label="Categories">
    <div className="vx-category-scroll" ref={scrollRef} tabIndex={items.length ? 0 : undefined} role="group" aria-label="Product categories, scroll horizontally">
      {items.map((category) => <Link key={category._id} to={`/products?category=${encodeURIComponent(category._id)}`}>{category.name}</Link>)}
    </div>
  </nav>;
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatPrice } from "../utils/format";
import { readRecent } from "../utils/recentlyViewed";

export default function RecentlyViewed({ currentId }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    setItems(readRecent().filter((p) => p._id !== currentId).slice(0, 6));
  }, [currentId]);

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recent-heading">
      <h2 className="vx-h2" id="recent-heading">Recently viewed</h2>
      <ul className="voltix-store-product-grid" style={{ listStyle: "none", padding: 0 }}>
        {items.map((p) => (
          <li key={p._id}>
            <Link to={`/products/${p._id}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              {p.image && <img src={p.image} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain" }} />}
              <strong style={{ display: "block", fontSize: 14, margin: "8px 0 2px" }}>{p.name}</strong>
              <span>{formatPrice(p.price)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

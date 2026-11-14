import { useEffect, useState } from "react";
import { apiFetch } from "../utils/api";
import ProductCard from "./ProductCard";
import Icon from "./Icon";

// ---------------------------------------------------------------- specifications
const GROUPS = [
  ["Performance", /processor|cpu|chip|soc|ram|memory|storage|rom|os\b|operating|gpu|graphics|performance/i],
  ["Display", /display|screen|resolution|refresh|panel|brightness|size/i],
  ["Camera", /camera|lens|megapixel|\bmp\b|video|sensor|zoom/i],
  ["Battery & Charging", /battery|charg|mah|playtime|power|watt|adapter/i],
  ["Connectivity", /bluetooth|wi-?fi|5g|4g|network|sim\b|nfc|usb|port|connect|jack|gps/i],
  ["Warranty", /warranty/i],
];

const ICONS = [
  ["Display", "monitor", /display|screen/i],
  ["Processor", "cpu", /processor|cpu|chip|soc/i],
  ["Memory", "storage", /^ram$|memory|storage|rom/i],
  ["Camera", "camera", /camera|lens|megapixel/i],
  ["Battery", "battery", /battery|playtime/i],
  ["Connectivity", "wifi", /bluetooth|wi-?fi|5g|connect/i],
];

// the 4-5 things buyers look at first, shown as icons above the details
export function KeySpecStrip({ highlights = [] }) {
  const picked = [];
  for (const [label, icon, rx] of ICONS) {
    const found = highlights.find((h) => rx.test(h.name) && !picked.some((p) => p.name === h.name));
    if (found) picked.push({ label, icon, name: found.name, value: found.value });
  }
  if (picked.length === 0) return null;
  return (
    <ul className="vx-keyspecs" aria-label="Key specifications">
      {picked.slice(0, 5).map((s) => (
        <li key={s.name}>
          <Icon name={s.icon} size={22} />
          <small>{s.label}</small>
          <b>{s.value}</b>
        </li>
      ))}
    </ul>
  );
}

// the full table, grouped like Performance / Display / Battery ...
export function SpecTable({ product }) {
  const rows = [...(product.highlights || [])];
  if (product.warrantyPeriod && !rows.some((r) => /warranty/i.test(r.name))) {
    rows.push({ name: "Warranty", value: `${product.warrantyPeriod}${product.warrantyType ? ` · ${product.warrantyType}` : ""}` });
  }
  if (rows.length === 0) return null;

  const grouped = new Map(GROUPS.map(([title]) => [title, []]));
  grouped.set("Other details", []);
  for (const row of rows) {
    const match = GROUPS.find(([, rx]) => rx.test(row.name));
    grouped.get(match ? match[0] : "Other details").push(row);
  }

  return (
    <section className="vx-panel">
      <h2>Specifications</h2>
      {[...grouped].filter(([, list]) => list.length > 0).map(([title, list]) => (
        <div key={title} className="vx-spec-group">
          <h3>{title}</h3>
          <table className="vx-specs">
            <tbody>
              {list.map((h) => (
                <tr key={h.name}>
                  <th scope="row">{h.name}</th>
                  <td>{h.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- video
function embedFor(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return { type: "iframe", src: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}` };
    if (host.endsWith("youtube.com")) {
      const id = u.searchParams.get("v") || u.pathname.split("/").filter(Boolean).pop();
      return id ? { type: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    if (host.endsWith("vimeo.com")) return { type: "iframe", src: `https://player.vimeo.com/video/${u.pathname.split("/").filter(Boolean).pop()}` };
    if (/\.(mp4|webm)$/i.test(u.pathname)) return { type: "video", src: url };
  } catch {
    /* not a link */
  }
  return null;
}

export function ProductVideo({ url, title }) {
  const embed = url ? embedFor(url) : null;
  if (!embed) return null;
  return (
    <section className="vx-panel">
      <h2>Product video</h2>
      <div className="vx-video">
        {embed.type === "video" ? (
          <video controls preload="metadata" src={embed.src} />
        ) : (
          <iframe src={embed.src} title={`${title} video`} loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- delivery
const niceDay = (iso) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export function DeliveryChecker({ codAvailable }) {
  const [pincode, setPincode] = useState(() => {
    try {
      return localStorage.getItem("voltix_pincode") || "";
    } catch {
      return "";
    }
  });
  const [state, setState] = useState({ status: "idle" }); // idle | loading | ok | error

  const check = async (value = pincode) => {
    if (!/^[1-9]\d{5}$/.test(value)) return setState({ status: "error", message: "Enter a valid 6-digit pincode" });
    setState({ status: "loading" });
    try {
      const data = await apiFetch(`/api/products/delivery-estimate?pincode=${value}`);
      setState({ status: "ok", data });
      try {
        localStorage.setItem("voltix_pincode", value);
      } catch {
        /* private mode: fine */
      }
    } catch (err) {
      setState({ status: "error", message: err.message || "Could not check this pincode" });
    }
  };

  // the pincode used last time is checked again automatically
  useEffect(() => {
    if (/^[1-9]\d{5}$/.test(pincode)) check(pincode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="vx-delivery">
      <label htmlFor="pin-check"><b>Delivery</b> – check when it reaches you</label>
      <form onSubmit={(e) => { e.preventDefault(); check(); }}>
        <input id="pin-check" inputMode="numeric" maxLength={6} placeholder="Enter pincode" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} />
        <button type="submit" disabled={state.status === "loading"}>{state.status === "loading" ? "Checking..." : "Check"}</button>
      </form>
      {state.status === "ok" && (
        <p className="vx-delivery-ok">
          Delivery by <b>{niceDay(state.data.from)} – {niceDay(state.data.to)}</b> to {state.data.district}, {state.data.state}.{" "}
          {codAvailable ? "Cash on delivery available." : "Cash on delivery not available for this product."}
        </p>
      )}
      {state.status === "error" && <p className="vx-field-error">{state.message}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- frequently bought together
export function BoughtTogether({ productId }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let active = true;
    apiFetch(`/api/products/${productId}/bought-together`)
      .then((d) => active && setItems(d.products || []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [productId]);
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="vx-h2">Frequently bought together</h2>
      <div className="voltix-store-product-grid">
        {items.map((p) => <ProductCard key={p._id} product={p} />)}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- trust badges (below the buy buttons)
export function TrustBadges({ product }) {
  const items = [
    { icon: "truck", title: product.deliveryCharge ? "Delivery" : "Free delivery", text: product.deliveryCharge ? `Rs ${product.deliveryCharge} per product` : "On this product" },
    { icon: "return", title: `${product.returnWindowDays}-day returns`, text: "Easy returns after delivery" },
    { icon: "shield", title: "Secure payment", text: product.codAvailable ? "UPI, cards, wallet, COD" : "UPI, cards, wallet" },
    { icon: "award", title: product.warrantyPeriod ? `${product.warrantyPeriod} warranty` : "Genuine product", text: product.warrantyType || "Sold by Voltix" },
  ];
  return (
    <ul className="vx-trust">
      {items.map((i) => (
        <li key={i.title}>
          <Icon name={i.icon} size={22} />
          <b>{i.title}</b>
          <small>{i.text}</small>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- "Available offers" (live coupon codes)
export function ProductOffers() {
  const [coupons, setCoupons] = useState([]);
  useEffect(() => {
    let active = true;
    apiFetch("/api/offers")
      .then((d) => active && setCoupons((d.coupons || []).slice(0, 3)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (coupons.length === 0) return null;
  return (
    <div className="vx-offers-box">
      <h3><Icon name="tag" size={16} /> Available offers</h3>
      <ul>
        {coupons.map((c) => (
          <li key={c.code}>
            <b>{c.headline}</b> with code <code>{c.code}</code>
            {c.condition && <small> {c.condition}</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}

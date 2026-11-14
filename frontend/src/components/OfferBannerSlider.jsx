import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../utils/api";

// Home page banner slider. The admin chooses the banners in Admin -> Offers
// ("Home page banner slider"). Nothing is shown when no offer is live.
export default function OfferBannerSlider() {
  const [offers, setOffers] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch("/api/offers?placement=home")
      .then((d) => active && setOffers(d.offers.filter((o) => o.image)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // change slide every 5 seconds
  useEffect(() => {
    if (offers.length < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % offers.length), 5000);
    return () => clearInterval(timer);
  }, [offers.length]);

  if (offers.length === 0) return null;
  const current = offers[Math.min(index, offers.length - 1)];

  return (
    <section className="vx-banner" aria-label="Offers">
      <Link to={current.link} className="vx-banner-link">
        <img src={current.image} alt={current.name} />
        <div className="vx-banner-text">
          {current.discountLabel && <span>{current.discountLabel}</span>}
          <strong>{current.name}</strong>
          {current.description && <small>{current.description}</small>}
        </div>
      </Link>
      {offers.length > 1 && (
        <div className="vx-banner-dots">
          {offers.map((o, i) => (
            <button key={o._id} type="button" className={i === index ? "on" : ""} aria-label={`Show offer ${i + 1}`} onClick={() => setIndex(i)} />
          ))}
        </div>
      )}
    </section>
  );
}

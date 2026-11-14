import { useEffect, useState } from "react";
import usePageTitle from "../../hooks/usePageTitle";
import { Link, useNavigate } from "react-router-dom";
import StoreLayout from "../../components/StoreLayout";
import { useShop } from "../../context/ShopContext";
import { apiFetch } from "../../utils/api";
import Icon from "../../components/Icon";

function UserOffersContent() {
  usePageTitle("Offers");
  const navigate = useNavigate();
  const { showToast } = useShop();
  const [copiedCode, setCopiedCode] = useState("");
  const [offers, setOffers] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch("/api/offers")
      .then((data) => {
        if (!active) return;
        setOffers(data.offers || []);
        setCoupons(data.coupons || []);
      })
      .catch((err) => active && setError(err.message || "Could not load offers"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const copyCoupon = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      showToast(`Coupon code ${code} copied`, "success");
      setTimeout(() => setCopiedCode(""), 3000);
    } catch {
      showToast(`Your coupon code is ${code}`, "success");
    }
  };

  const applyInCart = (code) => {
    copyCoupon(code);
    navigate(`/checkout?coupon=${encodeURIComponent(code)}`);
  };

  return (
    <div className="vx-page">
      <h1 className="vx-title" style={{ margin: "8px 0 4px" }}>Offers &amp; coupons</h1>
      <p className="vx-sub" style={{ marginBottom: "36px" }}>Current sales and codes you can use at checkout.</p>

      {loading && <div className="vx-state"><strong>Loading offers...</strong></div>}
      {error && <div className="vx-state" role="alert"><p>{error}</p></div>}

      {!loading && !error && (
        <>
          <section style={{ marginBottom: "48px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "18px", color: "#11151b" }}>Live offers</h2>
            {offers.length === 0 ? (
              <p className="vx-sub">No offers are running right now. Please check back soon.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                {offers.map((offer) => (
                  <div key={offer._id} className="vx-offer-card">
                    <div
                      className={`vx-offer-top ${offer.image ? "has-image" : ""}`}
                      style={offer.image ? { backgroundImage: `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url(${offer.image})` } : undefined}
                    >
                      {offer.discountLabel || offer.name}
                    </div>
                    <div style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column" }}>
                      <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 700 }}>{offer.name}</h3>
                      {offer.description && <p className="vx-sub" style={{ marginBottom: "10px" }}>{offer.description}</p>}
                      <p className="vx-sub" style={{ fontSize: "12px", marginBottom: "16px" }}>
                        {offer.startsOn} – {offer.endsOn}
                      </p>
                      <Link to={offer.link} style={{ marginTop: "auto", fontSize: "13px", fontWeight: 700, color: "#11151b", textDecoration: "underline" }}>
                        Shop this offer <Icon name="arrow-right" size={14} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "18px", color: "#11151b" }}>Coupon codes</h2>
            {coupons.length === 0 ? (
              <p className="vx-sub">No coupon codes are available right now.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                {coupons.map((coupon) => (
                  <div key={coupon.code} className="vx-coupon-card" style={{ display: "flex", flexDirection: "column" }}>
                    <span className="vx-eyebrow" style={{ color: "#166534" }}>{coupon.headline}</span>
                    <strong style={{ fontSize: "22px", letterSpacing: "1px", color: "#11151b", margin: "4px 0 10px" }}>{coupon.code}</strong>
                    <p className="vx-sub" style={{ marginBottom: "20px", minHeight: "36px" }}>{coupon.condition}</p>
                    <div style={{ display: "flex", gap: "10px", marginTop: "auto" }}>
                      <button type="button" className="vx-btn-dark" style={{ flex: 1, minHeight: "38px", fontSize: "13px" }} onClick={() => copyCoupon(coupon.code)}>
                        {copiedCode === coupon.code ? "Copied!" : "Copy code"}
                      </button>
                      <button type="button" className="vx-btn-outline" style={{ flex: 1, minHeight: "38px", fontSize: "13px" }} onClick={() => applyInCart(coupon.code)}>
                        Use in cart
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function UserOffers() {
  return (
    <StoreLayout>
      <UserOffersContent />
    </StoreLayout>
  );
}

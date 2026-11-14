import { useEffect, useRef, useState } from "react";
import { useShop } from "../context/ShopContext";
import Icon from "../components/Icon";
import { API_BASE_URL } from "../config/api";

// Share a product. Phones open their own share sheet; computers get a small menu
// (copy link / WhatsApp / Telegram / email / X). Must be used inside <StoreLayout>.
export default function ShareButton({ title, path, productId }) {
  const { showToast } = useShop();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const url = productId ? `${API_BASE_URL}/share/p/${productId}` : `${window.location.origin}${path}`;
  const text = `Check out ${title} on Voltix`;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => (e.type === "keydown" ? e.key === "Escape" && setOpen(false) : !box.current?.contains(e.target) && setOpen(false));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    } catch {
      window.prompt("Copy this link", url);
    }
    setOpen(false);
  };

  const onClick = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error.name === "AbortError") return; // the customer closed the share sheet
      }
    }
    setOpen((o) => !o);
  };

  const q = encodeURIComponent;
  const targets = [
    { label: "WhatsApp", href: `https://wa.me/?text=${q(`${text} ${url}`)}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${q(url)}&text=${q(text)}` },
    { label: "X (Twitter)", href: `https://twitter.com/intent/tweet?url=${q(url)}&text=${q(text)}` },
    { label: "Email", href: `mailto:?subject=${q(title)}&body=${q(`${text}\n${url}`)}` },
  ];

  return (
    <div className="vx-share" ref={box}>
      <button type="button" className="vx-share-btn" onClick={onClick} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="share" size={15} /> Share
      </button>
      {open && (
        <div className="vx-share-menu" role="menu">
          <button type="button" role="menuitem" onClick={copy}>Copy link</button>
          {targets.map((t) => (
            <a key={t.label} role="menuitem" href={t.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>{t.label}</a>
          ))}
        </div>
      )}
    </div>
  );
}

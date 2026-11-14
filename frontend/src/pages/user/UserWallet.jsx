import { useEffect, useState } from "react";
import usePageTitle from "../../hooks/usePageTitle";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../utils/api";
import { formatPrice } from "../../utils/format";

export default function UserWallet() {
  usePageTitle("Wallet");
  const navigate = useNavigate();
  const [wallet, setWallet] = useState({ balance: 0, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/api/users/wallet", { signal: controller.signal })
      .then((data) => setWallet(data.wallet || { balance: 0, transactions: [] }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        if (err.status === 401 || err.status === 403) navigate("/login", { replace: true, state: { message: "Please log in to view your wallet." } });
        else setError(err.message || "Could not load wallet");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [navigate]);

  return (
    <main className="vx-panel-col">
      <section className="vx-card">
        <p className="vx-eyebrow">VORTIX WALLET</p>
        <h2 style={{ margin: "8px 0" }}>Available balance</h2>
        <strong style={{ display: "block", fontSize: 34, margin: "8px 0 16px" }}>{loading ? "Loading…" : formatPrice(wallet.balance)}</strong>
        <p className="vx-sub">Wallet balance is store credit issued after an approved return request. It is not a bank balance and cannot be withdrawn as cash.</p>
      </section>
      <section className="vx-card">
        <h2>Transaction history</h2>
        {error && <p className="vx-field-error" role="alert">{error}</p>}
        {loading ? <p className="vx-sub">Loading transactions…</p> : wallet.transactions.length === 0 ? (
          <div className="vx-state"><strong>No wallet transactions yet</strong><p>Your approved store-credit refunds will appear here.</p><Link to="/orders">View your orders</Link></div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {wallet.transactions.map((tx) => (
              <div key={tx._id} style={{ display: "flex", justifyContent: "space-between", gap: 16, borderBottom: "1px solid #e5e7eb", paddingBottom: 12 }}>
                <div><strong>{tx.description}</strong><p className="vx-sub">{new Date(tx.createdAt).toLocaleString("en-IN")}</p></div>
                <strong style={{ color: tx.type === "Credit" ? "#15803d" : "#b91c1c", whiteSpace: "nowrap" }}>{tx.type === "Credit" ? "+" : "−"}{formatPrice(tx.amount)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

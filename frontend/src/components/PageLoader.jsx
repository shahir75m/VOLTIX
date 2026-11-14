// Shown while a lazily loaded page downloads (first visit to a route only).
export default function PageLoader() {
  return (
    <div className="vx-page" role="status" aria-busy="true" aria-label="Loading page">
      <div className="vx-skeleton" style={{ height: 56, marginBottom: 16 }} />
      <div className="voltix-store-product-grid vx-grid-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="vx-skeleton" />)}
      </div>
    </div>
  );
}

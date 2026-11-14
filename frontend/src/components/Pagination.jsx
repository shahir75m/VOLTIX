// Numbered pager used by admin tables and the customer product list.
function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

export default function Pagination({ pagination, onChange, className = "vx-pager-btns", activeClass = "active", prevLabel = "‹", nextLabel = "›" }) {
  const { currentPage, totalPages } = pagination;
  if (totalPages <= 1) return null;

  return (
    <div className={className}>
      <button type="button" disabled={currentPage <= 1} onClick={() => onChange(currentPage - 1)} aria-label="Previous page">
        {prevLabel}
      </button>
      {pageNumbers(currentPage, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} style={{ alignSelf: "center", padding: "0 4px" }}>…</span>
        ) : (
          <button key={p} type="button" className={p === currentPage ? activeClass : ""} onClick={() => onChange(p)} aria-current={p === currentPage ? "page" : undefined}>
            {p}
          </button>
        )
      )}
      <button type="button" disabled={currentPage >= totalPages} onClick={() => onChange(currentPage + 1)} aria-label="Next page">
        {nextLabel}
      </button>
    </div>
  );
}

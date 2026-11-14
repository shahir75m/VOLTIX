import Icon from "./Icon";

// Read-only stars. value 0-5 (decimals allowed, rounded to half stars).
export default function StarRating({ value = 0, count, small = false }) {
  const rounded = Math.round(value * 2) / 2;
  const size = small ? 13 : 16;
  return (
    <span className={`vx-stars ${small ? "small" : ""}`} aria-label={`Rated ${value.toFixed(1)} out of 5${count ? ` from ${count} reviews` : ""}`}>
      <span className="vx-stars-row" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = rounded >= n ? 100 : rounded >= n - 0.5 ? 50 : 0;
          return (
            <span key={n} className="vx-star" style={{ width: size, height: size }}>
              <Icon name="star" size={size} filled className="vx-star-empty" />
              <span className="vx-star-fill" style={{ width: `${fill}%` }}><Icon name="star" size={size} filled className="vx-star-full" /></span>
            </span>
          );
        })}
      </span>
      <b>{value.toFixed(1)}</b>
      {count > 0 && <small>({count})</small>}
    </span>
  );
}

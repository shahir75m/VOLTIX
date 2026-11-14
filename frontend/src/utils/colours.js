// Colour names used to auto-fill the name when the admin picks a colour.
// The picked colour is matched to the nearest name in this list.
export const COLOUR_NAMES = [
  ["Black", "#000000"], ["Jet Black", "#0a0a0a"], ["Graphite", "#3a3a3c"], ["Charcoal", "#36454f"],
  ["Space Grey", "#8e8e93"], ["Grey", "#808080"], ["Silver", "#c0c0c0"], ["Light Grey", "#d3d3d3"],
  ["White", "#ffffff"], ["Pearl White", "#f5f5f0"], ["Starlight", "#f0e4d3"], ["Cream", "#fffdd0"],
  ["Ivory", "#fffff0"], ["Beige", "#d9c7a3"], ["Champagne", "#f7e7ce"], ["Gold", "#d4af37"],
  ["Rose Gold", "#b76e79"], ["Copper", "#b87333"], ["Bronze", "#cd7f32"], ["Brown", "#8b5a2b"],
  ["Tan", "#d2b48c"], ["Coffee", "#4b3621"], ["Red", "#e11d2e"], ["Dark Red", "#8b0000"],
  ["Maroon", "#800000"], ["Burgundy", "#6d1a36"], ["Coral", "#ff6f61"], ["Pink", "#ff8fb1"],
  ["Hot Pink", "#ff1493"], ["Magenta", "#ff00ff"], ["Peach", "#ffcba4"], ["Orange", "#ff7a00"],
  ["Amber", "#ffbf00"], ["Yellow", "#ffe135"], ["Lemon", "#fff44f"], ["Olive", "#6b8e23"],
  ["Lime", "#b6e61e"], ["Light Green", "#90ee90"], ["Green", "#16a34a"], ["Forest Green", "#228b22"],
  ["Dark Green", "#0b4d2c"], ["Mint", "#98ffcc"], ["Teal", "#008080"], ["Turquoise", "#30d5c8"],
  ["Cyan", "#00bcd4"], ["Sky Blue", "#87ceeb"], ["Light Blue", "#add8e6"], ["Blue", "#1d4ed8"],
  ["Royal Blue", "#2a4bd7"], ["Navy Blue", "#0b1f4b"], ["Midnight", "#191970"], ["Indigo", "#4b0082"],
  ["Lavender", "#c4b5fd"], ["Purple", "#7e22ce"], ["Violet", "#8f00ff"], ["Plum", "#8e4585"],
];

const toRgb = (hex) => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

// perceptual-ish distance (weighted RGB) – good enough to pick a sensible name
const distance = (a, b) => {
  const rMean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db;
};

export function nearestColourName(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) return "";
  const target = toRgb(hex);
  let best = COLOUR_NAMES[0];
  let bestDistance = Infinity;
  for (const entry of COLOUR_NAMES) {
    const d = distance(target, toRgb(entry[1]));
    if (d < bestDistance) {
      bestDistance = d;
      best = entry;
    }
  }
  return best[0];
}

export const isColourOption = (name) => ["colour", "color"].includes(String(name).trim().toLowerCase());

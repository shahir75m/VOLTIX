import { isColourOption } from "./colours.js";

const attribute = (variant, name) => variant?.attributes.find((a) => a.name === name);
const matches = (variant, names, source) => names.every((name) => attribute(variant, name)?.value === attribute(source, name)?.value);

// Offer only combinations saved by the admin; never construct a new combination.
export function buildVariantChoices(product, selectedVariant) {
  const variants = product.variants || [];
  const selected = selectedVariant || variants.find((v) => v.inStock) || variants[0];
  const colourName = (product.variantOptions || []).find(isColourOption);
  const configurationNames = (product.variantOptions || []).filter((name) => name !== colourName);
  const rank = (name) => /^ram$/i.test(name) ? 0 : /^storage$/i.test(name) ? 1 : 2;
  configurationNames.sort((a, b) => rank(a) - rank(b));
  const selectedColour = colourName ? attribute(selected, colourName)?.value : null;
  const colours = [];
  if (colourName) {
    for (const variant of variants) {
      const attr = attribute(variant, colourName);
      if (!attr || colours.some((c) => c.value === attr.value)) continue;
      const candidates = variants.filter((v) => attribute(v, colourName)?.value === attr.value);
      const target = candidates.find((v) => matches(v, configurationNames, selected)) || candidates.find((v) => v.inStock) || candidates[0];
      colours.push({ value: attr.value, hex: attr.hex || "", image: target.image || candidates.find((v) => v.image)?.image || "", target, inStock: candidates.some((v) => v.inStock) });
    }
  }
  const configurations = [];
  if (configurationNames.length) {
    for (const variant of variants) {
      const values = configurationNames.map((name) => attribute(variant, name)?.value || "");
      const key = JSON.stringify(values);
      if (configurations.some((c) => c.key === key)) continue;
      const target = variants.find((v) => matches(v, configurationNames, variant) && (!colourName || attribute(v, colourName)?.value === selectedColour));
      configurations.push({ key, values, target, active: Boolean(selected && matches(variant, configurationNames, selected)) });
    }
  }
  return { colourName, selectedColour, configurationNames, colours, configurations, selected };
}

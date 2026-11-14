import { COLOUR_NAMES } from "../utils/colours";
import { buildVariantChoices } from "../utils/productVariants";
import { formatPrice } from "../utils/format";
import Icon from "../components/Icon";

export default function ProductVariantSelector({ product, selectedVariant, onSelect, disabled = false }) {
  if (!product.hasVariants) return null;
  const choices = buildVariantChoices(product, selectedVariant);
  const selected = choices.selected;
  const configurationLabel = choices.configurationNames.length === 1 ? choices.configurationNames[0] : "Configuration";
  const currentConfiguration = choices.configurationNames.map((name) => selected?.attributes.find((a) => a.name === name)?.value).filter(Boolean).join(" / ");
  const selectedLabel = [choices.selectedColour, ...choices.configurationNames.map((name) => { const value = selected?.attributes.find((a) => a.name === name)?.value; return value ? `${value} ${name}` : ""; })].filter(Boolean).join(" · ") || "Select an option";
  return <section className="vx-variant-selector" aria-label="Choose product variant">
    {choices.colours.length > 0 && <fieldset className="vx-choice-group">
      <legend>{choices.colourName}<span>{choices.selectedColour}</span></legend>
      <div className="vx-colour-choices">
        {choices.colours.map((colour) => {
          const active = colour.value === choices.selectedColour;
          const hex = colour.hex || COLOUR_NAMES.find(([name]) => name.toLowerCase() === colour.value.toLowerCase())?.[1] || "#d8dde4";
          return <button type="button" key={colour.value} className={`vx-colour-choice ${active ? "is-selected" : ""}`} onClick={() => onSelect(colour.target)} aria-pressed={active} aria-label={`${choices.colourName} ${colour.value}${colour.inStock ? "" : ", out of stock"}`} disabled={disabled}>
            {colour.image ? <img src={colour.image} alt="" /> : <span className="vx-colour-dot" style={{ backgroundColor: hex }} />}
            <span>{colour.value}{!colour.inStock && <small>Out of stock</small>}</span>
            {active && <span className="vx-choice-tick" aria-hidden="true"><Icon name="check" size={12} strokeWidth={3} /></span>}
          </button>;
        })}
      </div>
    </fieldset>}
    {choices.configurations.length > 0 && <fieldset className="vx-choice-group">
      <legend>{configurationLabel}<span>{currentConfiguration}</span></legend>
      <div className="vx-configuration-choices">
        {choices.configurations.map((configuration) => <button type="button" key={configuration.key} className={`vx-configuration-choice ${configuration.active && configuration.target ? "is-selected" : ""} ${!configuration.target ? "is-unavailable" : ""}`} disabled={!configuration.target || disabled} aria-pressed={configuration.active && Boolean(configuration.target)} aria-label={`${configuration.values.join(" / ")}${!configuration.target ? `, unavailable in ${choices.selectedColour}` : !configuration.target.inStock ? ", out of stock" : ""}`} onClick={() => onSelect(configuration.target)}>
          <strong>{configuration.values.join(" / ")}</strong>
          <span className="vx-configuration-caption">{choices.configurationNames.join(" / ")}</span>
          <span className="vx-configuration-meta">{configuration.target ? <b>{formatPrice(configuration.target.price)}</b> : <small>Unavailable{choices.selectedColour ? ` in ${choices.selectedColour}` : ""}</small>}{configuration.target && !configuration.target.inStock && <small>Out of stock</small>}</span>
          {configuration.active && configuration.target && <span className="vx-choice-tick" aria-hidden="true"><Icon name="check" size={12} strokeWidth={3} /></span>}
        </button>)}
      </div>
    </fieldset>}
    <div className="vx-selected-variant" role="status"><span aria-hidden="true"><Icon name="check" size={12} strokeWidth={3} /></span><div><small>Your selection</small><strong>{selectedLabel}</strong></div></div>
  </section>;
}

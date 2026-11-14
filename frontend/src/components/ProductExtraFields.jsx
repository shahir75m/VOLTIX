export default function ProductExtraFields({ section, form, setField, errors }) {
  const field = (key, label, type = "text", options = {}) => (
    <div className={`vx-field ${errors[key] ? "has-error" : ""}`} key={key}>
      <label htmlFor={`pf-${key}`}>{label}</label>
      <input id={`pf-${key}`} type={type} value={form[key]} onChange={setField(key)} {...options} />
      {errors[key] && <span className="vx-err">{errors[key]}</span>}
    </div>
  );
  const checkbox = (key, label) => <label key={key} className="vx-product-check"><input type="checkbox" checked={form[key]} onChange={setField(key)} />{label}</label>;
  if (section === "basic") return <>
    <div className="vx-row two">{field("modelNumber", "Model number", "text", { maxLength: 80 })}{field("slug", "Unique product slug (optional)", "text", { maxLength: 160, placeholder: "Product slug" })}</div>
    <div className="vx-field"><label htmlFor="pf-shortDescription">Short description</label><textarea id="pf-shortDescription" value={form.shortDescription} onChange={setField("shortDescription")} maxLength={300} rows={2} /><span className="vx-hint">{form.shortDescription.length}/300</span>{errors.shortDescription && <span className="vx-err">{errors.shortDescription}</span>}</div>
  </>;
  if (section === "pricing") return <>
    <div className="vx-row two">{field("gstPercent", "GST (%)", "number", { min: 0, max: 100, step: "0.01" })}{field("costPrice", "Cost price (₹, admin only)", "number", { min: 0, step: "0.01" })}</div>
  </>;
  return <>
    <section className="vx-card"><h2>Key features, video, warranty &amp; box contents</h2>
      <div className={`vx-field ${errors.keyFeatures ? "has-error" : ""}`}><label htmlFor="pf-keyFeatures">Key features / benefits (one per line, 4-5 short points)</label><textarea id="pf-keyFeatures" value={form.keyFeatures} onChange={setField("keyFeatures")} rows={5} placeholder={"Active noise cancellation\n30 hours battery life\nIPX5 water resistant"} />{errors.keyFeatures && <span className="vx-err">{errors.keyFeatures}</span>}</div>
      {field("videoUrl", "Product video link (YouTube, Vimeo or .mp4) - optional", "url", { placeholder: "https://www.youtube.com/watch?v=...", maxLength: 300 })}
      {field("warrantyPeriod", "Warranty period", "text", { placeholder: "e.g. 1 year", maxLength: 80 })}
      {field("warrantyType", "Warranty type", "text", { placeholder: "e.g. Manufacturer warranty", maxLength: 120 })}
      <div className="vx-field"><label htmlFor="pf-boxContents">Box contents (one item per line)</label><textarea id="pf-boxContents" value={form.boxContents} onChange={setField("boxContents")} rows={4} />{errors.boxContents && <span className="vx-err">{errors.boxContents}</span>}</div>
    </section>
    <section className="vx-card"><h2>Shipping</h2>
      <div className="vx-row two">{field("weightGrams", "Packed weight (grams)", "number", { min: 0, step: "0.01" })}{field("deliveryCharge", "Delivery charge (₹)", "number", { min: 0, step: "0.01" })}</div>
      {checkbox("codAvailable", "Cash on delivery available")}
    </section>
    <section className="vx-card"><h2>Product labels &amp; tags</h2>
      <div className="vx-product-checks">{checkbox("isFeatured", "Featured")}{checkbox("isNew", "New")}{checkbox("isBestSeller", "Best seller")}</div>
      {field("tags", "Tags (separate with commas)", "text", { placeholder: "gaming, wireless, travel" })}
    </section>
  </>;
}

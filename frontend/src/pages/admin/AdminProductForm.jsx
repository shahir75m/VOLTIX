import AdminPagePending from "../../components/AdminPagePending";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../utils/api";
import useAdminAuth from "../../hooks/useAdminAuth";
import AdminSidebar from "../../components/AdminSidebar";
import ProductExtraFields from "../../components/ProductExtraFields";
import ImageCropper from "../../components/ImageCropper";
import Pagination from "../../components/Pagination";
import { COLOUR_NAMES, isColourOption, nearestColourName } from "../../utils/colours";
import "./AdminDashboard.css";
import "./AdminShop.css";
import Icon from "../../components/Icon";

const MAX_IMAGES = 35; // five general images plus up to thirty variant images
const MAX_RAW_FILE = 20 * 1024 * 1024; // the cropper shrinks it before upload
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_PRICE = 10000000;
const MAX_STOCK = 100000;
const VARIANTS_PER_PAGE = 2;

let keyCounter = 0;
const nextKey = () => `k${++keyCounter}`;

const emptyForm = {
  name: "",
  modelNumber: "", shortDescription: "", slug: "", gstPercent: "0", costPrice: "",
  warrantyPeriod: "", warrantyType: "", boxContents: "", keyFeatures: "", videoUrl: "", weightGrams: "", deliveryCharge: "0",
  codAvailable: true, isFeatured: false, isNew: false, isBestSeller: false, tags: "",
  description: "",
  category: "",
  brand: "",
  price: "",
  mrp: "",
  stock: "",
  sku: "",
  isPublished: false,
};

// Start with common shopper-facing dimensions, while still allowing a category
// to use a custom option such as Flavour, Pack size, or Connectivity.
const PRESET_OPTIONS = ["Colour", "Size", "Storage", "RAM", "Material", "Style"];
const NEUTRAL_HEX = "#cccccc";

const moneyError = (raw, label, required) => {
  if (!required && raw === "") return "";
  const n = raw === "" ? NaN : Number(raw);
  if (Number.isNaN(n)) return `${label} is required`;
  if (required && n <= 0) return `${label} must be greater than 0`;
  if (n < 0) return `${label} cannot be negative`;
  if (n > MAX_PRICE) return `${label} is too high`;
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return `${label}: max 2 decimal places`;
  return "";
};

const validate = (form, useVariants, options, variants, specs, images) => {
  const errors = {};
  const name = form.name.replace(/\s+/g, " ").trim();

  if (!name) errors.name = "Product name is required";
  else if (name.length < 2) errors.name = "Product name must be at least 2 characters";
  else if (name.length > 120) errors.name = "Product name must not exceed 120 characters";

  if (!form.isPublished) return errors;
  if (form.description.length > 10000) errors.description = "Full description must not exceed 10000 characters";
  if (!form.category) errors.category = "Please select a category";
  if (!form.brand) errors.brand = "Please select a brand";

  if (form.sku.trim() && !/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(form.sku.trim()))
    errors.sku = "Letters, numbers, - and _ only (2–30 characters)";

  if (useVariants) {
    if (options.length === 0) errors.variants = "Choose at least one variant option (e.g. Colour)";
    else if (variants.length === 0) errors.variants = "Use “Add combination” and enter the combination you sell";
    else {
      const seen = new Set();
      for (const [i, v] of variants.entries()) {
        const label = `Variant ${i + 1}`;
        let problem = "";
        for (const o of options) {
          const val = (v.attrs[o]?.value || "").trim();
          if (!val) { problem = `${label}: ${o} is required`; break; }
          if (val.length > 30) { problem = `${label}: ${o} is too long`; break; }
        }
        if (!problem) {
          const key = options.map((o) => v.attrs[o].value.trim().toLowerCase()).join("|");
          if (seen.has(key)) problem = `${label}: this combination already exists`;
          seen.add(key);
        }
        if (!problem) problem = moneyError(v.price, `${label} price`, true);
        if (!problem) problem = moneyError(v.mrp, `${label} MRP`, false);
        if (!problem && v.mrp !== "" && Number(v.mrp) !== 0 && Number(v.mrp) < Number(v.price))
          problem = `${label}: MRP cannot be lower than the price`;
        if (!problem) {
          const st = v.stock === "" ? NaN : Number(v.stock);
          if (Number.isNaN(st) || !Number.isInteger(st) || st < 0 || st > MAX_STOCK)
            problem = `${label}: stock must be a whole number (0 or more)`;
        }
        if (!problem && v.sku.trim() && !/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(v.sku.trim()))
          problem = `${label}: SKU may contain letters, numbers, - and _`;
        if (problem) { errors.variants = problem; break; }
      }
    }
  } else {
    const priceErr = moneyError(form.price, "Price", true);
    if (priceErr) errors.price = priceErr;
    const mrpErr = moneyError(form.mrp, "MRP", false);
    if (mrpErr) errors.mrp = mrpErr;
    else if (form.mrp !== "" && Number(form.mrp) !== 0 && !priceErr && Number(form.mrp) < Number(form.price))
      errors.mrp = "MRP cannot be lower than the price";

    const stock = form.stock === "" ? NaN : Number(form.stock);
    if (Number.isNaN(stock)) errors.stock = "Stock is required";
    else if (!Number.isInteger(stock)) errors.stock = "Stock must be a whole number";
    else if (stock < 0) errors.stock = "Stock cannot be negative";
    else if (stock > MAX_STOCK) errors.stock = "Stock is too high";
  }

  for (const [i, sp] of specs.entries()) {
    const n = sp.name.trim();
    const v = sp.value.trim();
    if ((n && !v) || (!n && v)) { errors.highlights = `Specification ${i + 1}: fill both name and value`; break; }
    if (n.length > 60 || v.length > 200) { errors.highlights = `Specification ${i + 1} is too long`; break; }
  }

  if (images.length === 0) errors.images = "Please upload at least one product image";

  return errors;
};

export default function AdminProductForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { checkingAuth, handleAuthError } = useAdminAuth();

  const [form, setForm] = useState(emptyForm);
  const [useVariants, setUseVariants] = useState(false);
  const [options, setOptions] = useState([]); // variant option names, e.g. ["Colour","Storage"]
  const [variants, setVariants] = useState([]);
  const [confirmRemoveAllVariants, setConfirmRemoveAllVariants] = useState(false);

  const [variantPage, setVariantPage] = useState(1);
  const variantCardsTop = useRef(null);
  const variantTotalPages = Math.max(1, Math.ceil(variants.length / VARIANTS_PER_PAGE));
  const currentVariantPage = Math.min(variantPage, variantTotalPages);
  const variantStart = (currentVariantPage - 1) * VARIANTS_PER_PAGE;
  const visibleVariants = variants.slice(variantStart, variantStart + VARIANTS_PER_PAGE);
  const changeVariantPage = (page) => {
    setVariantPage(page);
    variantCardsTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const showVariantError = (message) => {
    const match = message?.match(/Variant\s+(\d+)/i);
    if (match) setVariantPage(Math.min(variantTotalPages, Math.ceil(Number(match[1]) / VARIANTS_PER_PAGE)));
  };
  const [customOption, setCustomOption] = useState("");
  const [bulk, setBulk] = useState({ price: "", mrp: "", stock: "" });
  const [brands, setBrands] = useState([]);
  const [recrop, setRecrop] = useState(null); // { key, file } – re-crop an image added in this session
  const [specs, setSpecs] = useState([{ key: nextKey(), name: "", value: "" }]);
  const [images, setImages] = useState([]);
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [cropQueue, setCropQueue] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef(null);
  const variantFileInput = useRef(null);
  const variantUploadTarget = useRef(null);
  const [variantCrop, setVariantCrop] = useState(null);
  const imagesRef = useRef(images);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // free object URLs when leaving the page
  useEffect(
    () => () => {
      imagesRef.current.forEach((img) => img.kind === "new" && URL.revokeObjectURL(img.url));
    },
    []
  );

  useEffect(() => {
    if (checkingAuth) return;
    Promise.all([apiFetch("/api/admin/categories/all"), apiFetch("/api/admin/brands/all")])
      .then(([cats, brs]) => {
        setCategories(cats.items);
        setBrands(brs.items);
      })
      .catch((error) => {
        if (!handleAuthError(error)) setFormError(error.message);
      });
  }, [checkingAuth, handleAuthError]);

  useEffect(() => {
    if (checkingAuth || !isEdit) return;
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        const { product } = await apiFetch(`/api/admin/products/${id}`, { signal: controller.signal });
        setForm({
          ...emptyForm,
          ...Object.fromEntries(["modelNumber", "shortDescription", "slug", "warrantyPeriod", "warrantyType", "videoUrl"].map((key) => [key, product[key] || ""])),
          ...Object.fromEntries(["gstPercent", "costPrice", "weightGrams", "deliveryCharge"].map((key) => [key, String(product[key] ?? "")])),
          ...Object.fromEntries(["codAvailable", "isFeatured", "isNew", "isBestSeller"].map((key) => [key, product[key] ?? (key === "codAvailable")])),
          tags: (product.tags || []).join(", "), boxContents: (product.boxContents || []).join("\n"), keyFeatures: (product.keyFeatures || []).join("\n"),
          name: product.name,
          description: product.description || "",
          category: product.category?.isDeleted ? "" : product.category?._id || "",
          brand: product.brand?.isDeleted ? "" : product.brand?._id || "",
          price: String(product.price),
          mrp: product.mrp ? String(product.mrp) : "",
          stock: String(product.stock),
          sku: product.sku || "",
          isPublished: product.isPublished,
        });
        setUseVariants(product.variants.length > 0 || product.variantOptions.length > 0);
        setOptions(product.variantOptions || []);
        setVariantPage(1);
        setVariants(
          product.variants.map((v) => ({
            key: nextKey(),
            _id: v._id,
            attrs: Object.fromEntries(
              (product.variantOptions || []).map((o) => {
                const a = v.attributes.find((x) => x.name === o);
                return [o, { value: a?.value || "", hex: a?.hex || "" }];
              })
            ),
            price: String(v.price),
            mrp: v.mrp ? String(v.mrp) : "",
            stock: String(v.stock),
            sku: v.sku || "",
            imageKey: v.imagePublicId || "",
          }))
        );
        setSpecs(
          product.highlights.length
            ? product.highlights.map((h) => ({ key: nextKey(), name: h.name, value: h.value }))
            : [{ key: nextKey(), name: "", value: "" }]
        );
        setImages(product.images.map((img) => ({ key: nextKey(), kind: "existing", url: img.url, publicId: img.publicId, alt: img.alt || "" })));
      } catch (error) {
        if (error.name === "AbortError") return;
        if (handleAuthError(error)) return;
        navigate("/admin/products", { replace: true, state: { message: error.message } });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [checkingAuth, isEdit, id, navigate, handleAuthError]);

  const setField = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // numbers shown (read-only) when the product has variants
  const derived = useMemo(() => {
    const prices = variants.map((v) => Number(v.price)).filter((n) => n > 0);
    const cheapest = prices.length ? Math.min(...prices) : 0;
    const row = variants.find((v) => Number(v.price) === cheapest);
    return {
      price: cheapest || "",
      mrp: row && Number(row.mrp) > cheapest ? Number(row.mrp) : "",
      stock: variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0),
    };
  }, [variants]);

  // ---------- images
  const queueFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const slots = MAX_IMAGES - images.length - cropQueue.length;
    if (slots <= 0) {
      setErrors((prev) => ({ ...prev, images: `You can add at most ${MAX_IMAGES} images` }));
      return;
    }

    const accepted = [];
    let problem = "";
    for (const file of files) {
      if (!ALLOWED.includes(file.type)) problem = `“${file.name}”: only JPG, PNG and WebP are allowed`;
      else if (file.size > MAX_RAW_FILE) problem = `“${file.name}” is too large (max 20 MB)`;
      else accepted.push(file);
    }
    if (accepted.length > slots) problem = `Only ${slots} more image(s) can be added`;

    setErrors((prev) => ({ ...prev, images: problem || undefined }));
    setCropQueue((prev) => [...prev, ...accepted.slice(0, slots)]);
  };

  const handleCropped = (file) => {
    const original = cropQueue[0];
    setImages((prev) => [...prev, { key: nextKey(), kind: "new", url: URL.createObjectURL(file), file, original }]);
    setCropQueue((prev) => prev.slice(1));
    setErrors((prev) => ({ ...prev, images: undefined }));
  };

  const handleRecropped = (file) => {
    setImages((prev) =>
      prev.map((img) => {
        if (img.key !== recrop.key) return img;
        URL.revokeObjectURL(img.url);
        return { ...img, file, url: URL.createObjectURL(file) };
      })
    );
    setRecrop(null);
  };

  const removeImage = (key) => {
    const image = images.find((img) => img.key === key);
    setVariants((prev) => prev.map((v) => v.imageKey === (image?.publicId || key) ? { ...v, imageKey: "" } : v));
    setImages((prev) => {
      const target = prev.find((i) => i.key === key);
      if (target?.kind === "new") URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.key !== key);
    });
  };

  const makeMain = (key) => {
    setImages((prev) => {
      const target = prev.find((i) => i.key === key);
      return [target, ...prev.filter((i) => i.key !== key)];
    });
  };

  // ---------- variants & specs
  const toggleUseVariants = (on) => {
    setUseVariants(on);
    setErrors((prev) => ({ ...prev, variants: undefined }));

  };

  const addOption = (name) => {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean) return;
    if (clean.length > 20) return setErrors((p) => ({ ...p, variants: "Option names can have at most 20 characters" }));
    if (options.some((o) => o.toLowerCase() === clean.toLowerCase())) return;
    if (options.length >= 3) return setErrors((p) => ({ ...p, variants: "You can use at most 3 variant options" }));
    setOptions((prev) => [...prev, clean]);
    setVariants((prev) => prev.map((v) => ({ ...v, attrs: { ...v.attrs, [clean]: { value: "", hex: "" } } })));
    setCustomOption("");
    setErrors((p) => ({ ...p, variants: undefined }));
  };

  const removeOption = (name) => {
    setOptions((prev) => prev.filter((o) => o !== name));
    setVariants((prev) => prev.map((v) => {
      const attrs = { ...v.attrs }; delete attrs[name]; return { ...v, attrs };
    }));
    setErrors((p) => ({ ...p, variants: undefined }));
  };

  const addVariant = () => {
    if (!options.length) return setErrors((p) => ({ ...p, variants: "Choose at least one variant option" }));
    if (variants.length >= 30) return setErrors((p) => ({ ...p, variants: "A product can have at most 30 variants" }));
    setVariantPage(Math.ceil((variants.length + 1) / VARIANTS_PER_PAGE));
    setVariants((prev) => [...prev, { key: nextKey(), attrs: Object.fromEntries(options.map((o) => [o, { value: "", hex: "" }])), price: "", mrp: "", stock: "0", sku: "", imageKey: "" }]);
    setErrors((p) => ({ ...p, variants: undefined }));
  };

  const pickVariantImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !variantUploadTarget.current) return;
    let problem = "";
    if (!ALLOWED.includes(file.type)) problem = "Only JPG, PNG and WebP images are allowed";
    else if (file.size > MAX_RAW_FILE) problem = "Image is too large (max 20 MB before cropping)";
    else if (images.length + cropQueue.length >= MAX_IMAGES) problem = `You can add at most ${MAX_IMAGES} images`;
    if (problem) return setErrors((prev) => ({ ...prev, variants: problem }));
    setVariantCrop({ key: variantUploadTarget.current, file });
  };

  const handleVariantImage = (file) => {
    const key = nextKey();
    const target = variants.find((v) => v.key === variantCrop.key);
    if (target) {
      const alt = [form.name, ...options.map((o) => target.attrs[o]?.value)].filter(Boolean).join(" ").slice(0, 160);
      setImages((prev) => [...prev, { key, kind: "new", url: URL.createObjectURL(file), file, original: variantCrop.file, alt }]);
      setVariants((prev) => prev.map((v) => v.key === variantCrop.key ? { ...v, imageKey: key } : v));
    }
    setVariantCrop(null);
    setErrors((prev) => ({ ...prev, variants: undefined, images: undefined }));
  };

  const removeVariant = (key) => {
    setVariants((prev) => prev.filter((v) => v.key !== key));
    setVariantPage(Math.min(currentVariantPage, Math.max(1, Math.ceil((variants.length - 1) / VARIANTS_PER_PAGE))));
  };
  const patchVariant = (key, patch) => {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
    setErrors((prev) => ({ ...prev, variants: undefined }));
  };

  // fill price / MRP / stock into all rows at once (only the boxes you filled in)
  // "Generate variants": type the values of every option (Black, Silver / 128 GB, 256 GB)
  // and the form builds every combination. Combinations that already exist are skipped.
  const [genValues, setGenValues] = useState({});
  const generateVariants = () => {
    const lists = options.map((o) => [...new Set(String(genValues[o] || "").split(",").map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean))]);
    if (lists.some((l) => l.length === 0)) return setErrors((p) => ({ ...p, variants: "Enter at least one value for every option (separate values with commas)" }));
    if (lists.some((l) => l.some((v) => v.length > 30))) return setErrors((p) => ({ ...p, variants: "Option values can have at most 30 characters" }));

    let combos = [[]];
    lists.forEach((values) => { combos = combos.flatMap((c) => values.map((v) => [...c, v])); });

    const exists = (combo) => variants.some((v) => options.every((o, i) => (v.attrs[o]?.value || "").toLowerCase() === combo[i].toLowerCase()));
    const fresh = combos.filter((c) => !exists(c));
    const room = 30 - variants.length;
    if (fresh.length === 0) return setErrors((p) => ({ ...p, variants: "All of these combinations already exist" }));
    if (fresh.length > room) return setErrors((p) => ({ ...p, variants: `That makes ${fresh.length} new variants but only ${room} more are allowed (30 per product)` }));

    const rows = fresh.map((combo) => ({
      key: nextKey(),
      attrs: Object.fromEntries(options.map((o, i) => {
        const value = combo[i];
        const hex = isColourOption(o) ? COLOUR_NAMES.find(([name]) => name.toLowerCase() === value.toLowerCase())?.[1] || "" : "";
        return [o, { value, hex }];
      })),
      price: bulk.price, mrp: bulk.mrp, stock: bulk.stock === "" ? "0" : bulk.stock, sku: "", imageKey: "",
    }));
    setVariants((prev) => [...prev, ...rows]);
    setVariantPage(Math.ceil((variants.length + rows.length) / VARIANTS_PER_PAGE));
    setGenValues({});
    setErrors((p) => ({ ...p, variants: undefined }));
  };

  const applyBulk = () => {
    setVariants((prev) =>
      prev.map((v) => ({
        ...v,
        ...(bulk.price !== "" ? { price: bulk.price } : {}),
        ...(bulk.mrp !== "" ? { mrp: bulk.mrp } : {}),
        ...(bulk.stock !== "" ? { stock: bulk.stock } : {}),
      }))
    );
  };

  const template = categories.find((c) => c._id === form.category)?.specTemplate || [];
  const specRows = [...template.filter((name) => !specs.some((s) => s.name.toLowerCase() === name.toLowerCase())).map((name) => ({ key: `template-${name}`, name, value: "", template: true })), ...specs];
  const updateSpec = (key, field, value) => {
    setSpecs((prev) => prev.some((s) => s.key === key)
      ? prev.map((s) => (s.key === key ? { ...s, [field]: value } : s))
      : [...prev, { ...specRows.find((s) => s.key === key), [field]: value }]);
    setErrors((prev) => ({ ...prev, highlights: undefined }));
  };

  // ---------- submit
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    const found = validate(form, useVariants, options, variants, specs.filter((s) => !s.template || s.value.trim()), images);
    setErrors(found);
    showVariantError(found.variants);
    setFormError("");
    if (Object.keys(found).length) {
      setFormError("Please fix the highlighted fields and try again.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const body = new FormData();
    body.append("name", form.name.trim());
    for (const field of ["modelNumber", "shortDescription", "slug", "gstPercent", "costPrice", "warrantyPeriod", "warrantyType", "weightGrams", "deliveryCharge", "codAvailable", "isFeatured", "isNew", "isBestSeller", "videoUrl"]) body.append(field, String(form[field]));
    body.append("taxInclusive", "true");
    body.append("tags", JSON.stringify(form.tags.split(",").map((tag) => tag.trim()).filter(Boolean)));
    body.append("keyFeatures", JSON.stringify(form.keyFeatures.split("\n").map((item) => item.trim()).filter(Boolean)));
    body.append("boxContents", JSON.stringify(form.boxContents.split("\n").map((item) => item.trim()).filter(Boolean)));
    let imageCounter = 0;
    const tokenMap = new Map(images.map((img) => [img.publicId || img.key, img.kind === "existing" ? img.publicId : `new:${imageCounter++}`]));
    body.append("imageMeta", JSON.stringify(Object.fromEntries(images.map((img) => [tokenMap.get(img.publicId || img.key), img.alt || ""]))));
    body.append("description", form.description.trim());
    body.append("category", form.category);
    body.append("brand", form.brand);
    if (!useVariants) {
      body.append("price", form.price);
      body.append("mrp", form.mrp);
      body.append("stock", form.stock);
    }
    body.append("sku", form.sku.trim());
    body.append("isPublished", String(form.isPublished));
    body.append("variantOptions", JSON.stringify(useVariants ? options : []));
    body.append(
      "variants",
      JSON.stringify(
        useVariants
          ? variants.map((v) => ({
              ...(v._id ? { _id: v._id } : {}),
              attributes: options.map((o) => ({
                name: o,
                value: v.attrs[o].value.trim(),
                ...(isColourOption(o) && v.attrs[o].hex ? { hex: v.attrs[o].hex } : {}),
              })),
              price: Number(v.price),
              mrp: v.mrp === "" ? 0 : Number(v.mrp),
              stock: Number(v.stock),
              sku: v.sku.trim(),
              imageToken: tokenMap.get(v.imageKey) || "",
            }))
          : []
      )
    );
    body.append(
      "highlights",
      JSON.stringify(specs.filter((s) => !s.template || s.value.trim()).filter((s) => s.name.trim() || s.value.trim()).map((s) => ({ name: s.name.trim(), value: s.value.trim() })))
    );

    let newIndex = 0;
    const order = images.map((img) => {
      if (img.kind === "existing") return img.publicId;
      body.append("images", img.file);
      return `new:${newIndex++}`;
    });
    if (isEdit) body.append("imageOrder", JSON.stringify(order));

    try {
      setSaving(true);
      const data = await apiFetch(isEdit ? `/api/admin/products/${id}` : "/api/admin/products", {
        method: isEdit ? "PUT" : "POST",
        body,
      });
      navigate("/admin/products", { state: { message: data.message } });
    } catch (error) {
      if (handleAuthError(error)) return;
      setErrors(error.errors || {});
      showVariantError(error.errors?.variants || error.message);
      setFormError(error.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  if (checkingAuth) return <AdminPagePending active="Products" />;

  const fieldClass = (name) => `vx-field ${errors[name] ? "has-error" : ""}`;

  return (
    <div className="voltix-admin-layout">
      <AdminSidebar active="Products" />

      <main className="vx-main">
        <form onSubmit={handleSubmit} noValidate>
          <header className="vx-head">
            <div>
              <h1>{isEdit ? "Edit product" : "Add product"}</h1>
            </div>
            <div className="vx-head-actions">
              <button type="button" className="vx-btn" onClick={() => navigate("/admin/products")} disabled={saving}>Cancel</button>
              <button type="submit" className="vx-btn primary" disabled={saving || loading}>
                {saving ? "Saving..." : "Save product"}
              </button>
            </div>
          </header>

          {formError && <div className="vx-alert error" role="alert">{formError}</div>}
          {confirmRemoveAllVariants && <section className="vx-card" role="alert">
            <h2>Remove all variants?</h2>
            <p>All unsaved variant combinations in this form will be removed. You can cancel to keep them.</p>
            <div className="vx-modal-actions">
              <button type="button" className="vx-btn" onClick={() => setConfirmRemoveAllVariants(false)}>Cancel</button>
              <button type="button" className="vx-btn danger" onClick={() => { setVariants([]); setConfirmRemoveAllVariants(false); }}>Remove all variants</button>
            </div>
          </section>}

          {loading ? (
            <div className="vx-card"><div className="vx-empty">Loading product...</div></div>
          ) : (
            <div className="vx-form-grid">
              <div>
                {/* BASIC */}
                <section className="vx-card">
                  <h2>Basic information</h2>

                  <div className={fieldClass("name")}>
                    <label htmlFor="pf-name">Product name *</label>
                    <input id="pf-name" type="text" placeholder="e.g. Wireless Earbuds Pro" value={form.name} onChange={setField("name")} maxLength={150} />
                    {errors.name && <span className="vx-err">{errors.name}</span>}
                  </div>

                  <ProductExtraFields section="basic" form={form} setField={setField} errors={errors} />
                  <div className={fieldClass("description")}>
                    <label htmlFor="pf-desc">Full description</label>
                    <textarea id="pf-desc" placeholder="Describe the product in detail..." value={form.description} onChange={setField("description")} />
                    <span className="vx-hint">{form.description.length}/10000</span>
                    {errors.description && <span className="vx-err">{errors.description}</span>}
                  </div>

                  <div className="vx-row two">
                    <div className={fieldClass("category")}>
                      <label htmlFor="pf-cat">Category *</label>
                      <select id="pf-cat" value={form.category} onChange={setField("category")}>
                        <option value="">Select category</option>
                        {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                      </select>
                      {errors.category && <span className="vx-err">{errors.category}</span>}
                    </div>
                    <div className={fieldClass("brand")}>
                      <label htmlFor="pf-brand">Brand *</label>
                      <select id="pf-brand" value={form.brand} onChange={setField("brand")}>
                        <option value="">Select brand</option>
                        {brands.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                      </select>
                      {errors.brand && <span className="vx-err">{errors.brand}</span>}
                    </div>
                  </div>
                </section>

                {/* PRICING */}
                <section className="vx-card">
                  <h2>Pricing &amp; stock</h2>
                  <div className="vx-row four">
                    <div className={fieldClass("price")}>
                      <label htmlFor="pf-price">{useVariants ? "Price from (₹)" : "Price (₹) *"}</label>
                      <input id="pf-price" type="number" step="0.01" min="0" placeholder="0.00" value={useVariants ? derived.price : form.price} onChange={setField("price")} disabled={useVariants} />
                      {errors.price && <span className="vx-err">{errors.price}</span>}
                    </div>
                    <div className={fieldClass("mrp")}>
                      <label htmlFor="pf-mrp">MRP (₹)</label>
                      <input id="pf-mrp" type="number" step="0.01" min="0" placeholder="0.00" value={useVariants ? derived.mrp : form.mrp} onChange={setField("mrp")} disabled={useVariants} />
                      {errors.mrp && <span className="vx-err">{errors.mrp}</span>}
                    </div>
                    <div className={fieldClass("stock")}>
                      <label htmlFor="pf-stock">{useVariants ? "Total stock" : "Stock quantity *"}</label>
                      <input id="pf-stock" type="number" step="1" min="0" placeholder="0" value={useVariants ? derived.stock : form.stock} onChange={setField("stock")} disabled={useVariants} />
                      {errors.stock && <span className="vx-err">{errors.stock}</span>}
                    </div>
                    <div className={fieldClass("sku")}>
                      <label htmlFor="pf-sku">SKU</label>
                      <input id="pf-sku" type="text" placeholder="VX-XX-000" value={form.sku} onChange={setField("sku")} maxLength={30} />
                      {errors.sku && <span className="vx-err">{errors.sku}</span>}
                    </div>
                  </div>
                  <p className="vx-hint">Discount: <strong>{(() => { const price = Number(useVariants ? derived.price : form.price); const mrp = Number(useVariants ? derived.mrp : form.mrp); return mrp > price && price > 0 ? Math.round((mrp - price) / mrp * 100) : 0; })()}%</strong> · Stock: <strong>{Number(useVariants ? derived.stock : form.stock) <= 0 ? "Out of stock" : Number(useVariants ? derived.stock : form.stock) <= 10 ? "Low stock" : "In stock"}</strong></p>
                  <ProductExtraFields section="pricing" form={form} setField={setField} errors={errors} />
                </section>

                {/* VARIANTS */}
                <section className="vx-card">
                  <h2>Variants</h2>
                  <p className="vx-hint" style={{ margin: "-4px 0 14px" }}>
                    Create one sellable combination per row. Each combination has its own price, stock, SKU and optional image; shoppers choose these options on one product page.
                  </p>
                  <div className="vx-switch-row" style={{ marginBottom: 14 }}>
                    <span>Enable variants</span>
                    <button type="button" className={`vx-switch ${useVariants ? "on" : ""}`} role="switch" aria-checked={useVariants} aria-label="Product has variants" onClick={() => toggleUseVariants(!useVariants)} />
                  </div>

                  {useVariants && (
                    <>
                      <div className="vx-field" style={{ marginBottom: 12 }}>
                        <label>Variant options (max 3)</label>
                        <span className="vx-hint">Pick the attributes that genuinely differ, then add only the combinations you sell.</span>
                        <div className="vx-chip-row">
                          {PRESET_OPTIONS.map((name) => {
                            const on = options.some((o) => o.toLowerCase() === name.toLowerCase());
                            return (
                              <button key={name} type="button" className={`vx-opt-chip ${on ? "on" : ""}`} onClick={() => (on ? removeOption(options.find((o) => o.toLowerCase() === name.toLowerCase())) : addOption(name))} aria-pressed={on}>
                                {name}
                              </button>
                            );
                          })}
                          {options.filter((o) => !PRESET_OPTIONS.some((p) => p.toLowerCase() === o.toLowerCase())).map((o) => (
                            <button key={o} type="button" className="vx-opt-chip on" onClick={() => removeOption(o)} aria-pressed="true">{o} <Icon name="x" size={12} strokeWidth={3} /></button>
                          ))}
                          <input
                            type="text"
                            className="vx-opt-input"
                            placeholder="Other option (e.g. Connectivity)"
                            value={customOption}
                            maxLength={20}
                            onChange={(e) => setCustomOption(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(customOption); } }}
                          />
                          <button type="button" className="vx-btn" onClick={() => addOption(customOption)} disabled={!customOption.trim()}>Add</button>
                        </div>
                      </div>

                      {options.length > 0 && (
                        <div className="vx-bulk" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                          <strong style={{ fontSize: 13 }}>Generate all combinations</strong>
                          {options.map((o) => (
                            <label key={o} style={{ display: "grid", gap: 4, fontSize: 12 }}>
                              {o}
                              <input type="text" placeholder="Value 1, Value 2" value={genValues[o] || ""} onChange={(e) => setGenValues((g) => ({ ...g, [o]: e.target.value }))} />
                            </label>
                          ))}
                          <div><button type="button" className="vx-btn" onClick={generateVariants}>Generate variants</button></div>
                        </div>
                      )}

                      <div className="vx-variant-toolbar">
                        <button type="button" className="vx-btn primary" onClick={addVariant} disabled={!options.length || variants.length >= 30}>+ Add combination</button>
                        <span className="vx-hint">{variants.length} variant{variants.length === 1 ? "" : "s"}</span>
                        {variants.length > 0 && (
                          <button type="button" className="vx-btn" onClick={() => setConfirmRemoveAllVariants(true)}>Remove all variants</button>
                        )}
                      </div>

                      {variants.length > 0 && (
                        <>
                          <div className="vx-bulk">
                            <span>Fill all rows:</span>
                            <input type="number" min="0" step="0.01" placeholder="Price" value={bulk.price} onChange={(e) => setBulk((b) => ({ ...b, price: e.target.value }))} aria-label="Price for all" />
                            <input type="number" min="0" step="0.01" placeholder="MRP" value={bulk.mrp} onChange={(e) => setBulk((b) => ({ ...b, mrp: e.target.value }))} aria-label="MRP for all" />
                            <input type="number" min="0" step="1" placeholder="Stock" value={bulk.stock} onChange={(e) => setBulk((b) => ({ ...b, stock: e.target.value }))} aria-label="Stock for all" />
                            <button type="button" className="vx-btn" onClick={applyBulk}>Apply</button>
                          </div>

                          <div className="vx-variant-cards" ref={variantCardsTop}>
                            {visibleVariants.map((v, visibleIndex) => {
                              const rowIndex = variantStart + visibleIndex;
                              const image = images.find((img) => (img.publicId || img.key) === v.imageKey);
                              return <article className="vx-variant-card" key={v.key}>
                                <div className="vx-variant-card-head"><div><strong>Variant {rowIndex + 1}</strong><p>{options.map((o) => v.attrs[o]?.value).filter(Boolean).join(" / ") || ""}</p></div><button type="button" className="vx-x" onClick={() => removeVariant(v.key)} aria-label={`Remove variant ${rowIndex + 1}`}>×</button></div>
                                <div className="vx-variant-fields">
                                  {options.map((o) => <div className="vx-field" key={o}><label htmlFor={`${v.key}-${o}`}>{o}</label><div className="vx-variant-attribute">
                                    {isColourOption(o) && <input type="color" value={v.attrs[o]?.hex || NEUTRAL_HEX} aria-label={`Variant ${rowIndex + 1} colour swatch`} onChange={(e) => patchVariant(v.key, { attrs: { ...v.attrs, [o]: { value: nearestColourName(e.target.value), hex: e.target.value } } })} />}
                                    {isColourOption(o)
                                      ? <input id={`${v.key}-${o}`} type="text" maxLength={30} value={v.attrs[o]?.value || ""} placeholder={o} aria-label={`Variant ${rowIndex + 1} ${o}`} onChange={(e) => patchVariant(v.key, { attrs: { ...v.attrs, [o]: { ...v.attrs[o], value: e.target.value } } })} />
                                      : <input id={`${v.key}-${o}`} type="text" maxLength={30} value={v.attrs[o]?.value || ""} placeholder={`Enter ${o}`} aria-label={`Variant ${rowIndex + 1} ${o}`} onChange={(e) => patchVariant(v.key, { attrs: { ...v.attrs, [o]: { ...v.attrs[o], value: e.target.value } } })} />}
                                  </div></div>)}
                                  {[['price', 'Selling price (₹)', 'Variant price'], ['mrp', 'MRP (₹)', 'Variant MRP'], ['stock', 'Stock quantity', 'Variant stock'], ['sku', 'SKU', 'Variant SKU']].map(([field, label, aria]) => <div className="vx-field" key={field}><label htmlFor={`${v.key}-${field}`}>{label}</label><input id={`${v.key}-${field}`} type={field === 'sku' ? 'text' : 'number'} min={field === 'sku' ? undefined : 0} step={field === 'stock' ? 1 : '0.01'} maxLength={field === 'sku' ? 30 : undefined} value={v[field]} onChange={(e) => patchVariant(v.key, { [field]: e.target.value })} aria-label={aria} /></div>)}
                                </div>
                                <div className="vx-variant-image-panel"><div className="vx-variant-image-preview">{image ? <img src={image.url} alt={`Variant ${rowIndex + 1} preview`} /> : <span>Variant image</span>}</div><div className="vx-variant-image">
                                  <button type="button" className="vx-variant-image-button" aria-label={`Upload image for variant ${rowIndex + 1}`} onClick={() => { variantUploadTarget.current = v.key; variantFileInput.current?.click(); }}>{v.imageKey ? "Change image" : "+ Add image"}</button>
                                  <select className="vx-variant-image-select" value={v.imageKey || ""} onChange={(e) => patchVariant(v.key, { imageKey: e.target.value })} aria-label={`Select image for variant ${rowIndex + 1}`}><option value="">Use main image</option>{images.map((img, i) => <option key={img.key} value={img.publicId || img.key}>{i + 1}. {img.alt || "Product image"}</option>)}</select>
                                </div><span className="vx-variant-stock-status">{Number(v.stock) <= 0 ? "Out of stock" : Number(v.stock) <= 10 ? "Low stock" : "In stock"}</span></div>
                              </article>;
                            })}
                          </div>
                          <nav className="vx-variant-pagination" aria-label="Variant pages">
                            <span role="status">Showing {variantStart + 1}–{Math.min(variantStart + VARIANTS_PER_PAGE, variants.length)} of {variants.length} variants</span>
                            <Pagination pagination={{ currentPage: currentVariantPage, totalPages: variantTotalPages }} onChange={changeVariantPage} prevLabel="Previous" nextLabel="Next" />
                          </nav>
                        </>
                      )}

                      {errors.variants && <div className="vx-err" style={{ margin: "10px 0" }}>{errors.variants}</div>}
                    </>
                  )}
                </section>

                {/* SPECS */}
                <section className="vx-card">
                  <h2>Specifications</h2>
                  {specRows.map((s) => (
                    <div className="vx-pair" key={s.key}>
                      <input type="text" placeholder="Name (e.g. Battery life)" value={s.name} readOnly={s.template} maxLength={60} onChange={(e) => updateSpec(s.key, "name", e.target.value)} aria-label="Specification name" />
                      <input type="text" placeholder="Value (e.g. 24 hours with case)" value={s.value} maxLength={200} onChange={(e) => updateSpec(s.key, "value", e.target.value)} aria-label="Specification value" />
                      <button type="button" className="vx-x" onClick={() => setSpecs((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== s.key) : [{ key: nextKey(), name: "", value: "" }]))} aria-label="Remove specification" disabled={s.template} title={s.template ? "Category field" : "Remove specification"}>×</button>
                    </div>
                  ))}
                  {errors.highlights && <div className="vx-err" style={{ marginBottom: 10 }}>{errors.highlights}</div>}
                  <button type="button" className="vx-btn" onClick={() => setSpecs((prev) => [...prev, { key: nextKey(), name: "", value: "" }])} disabled={specs.length >= 15}>
                    + Add custom spec
                  </button>
                </section>
              </div>

              <div>
                {/* IMAGES */}
                <section className="vx-card">
                  <h2>Product images</h2>
                  <div
                    className={`vx-drop ${dragOver ? "over" : ""} ${images.length >= MAX_IMAGES ? "disabled" : ""}`}
                    onClick={() => images.length < MAX_IMAGES && fileInput.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      queueFiles(e.dataTransfer.files);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
                  >
                    <strong>Drag &amp; drop or browse</strong>
                    <small>JPG, PNG or WebP · max {MAX_IMAGES} images</small>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    hidden
                    onChange={(e) => {
                      queueFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  {errors.images && <div className="vx-err" style={{ marginTop: 8 }}>{errors.images}</div>}

                  {images.length > 0 && (
                    <div className="vx-img-grid">
                      {images.map((img, index) => (
                        <div className="vx-img-box" key={img.key}>
                          <img src={img.url} alt={`Product ${index + 1}`} />
                          <input type="text" aria-label={`Alt text for image ${index + 1}`} placeholder="Describe this image" value={img.alt || ""} maxLength={160} onChange={(e) => setImages((prev) => prev.map((item) => item.key === img.key ? { ...item, alt: e.target.value } : item))} />
                          {index === 0 && <span className="vx-img-main">Main</span>}
                          <div className="vx-img-actions">
                            {index !== 0 ? <button type="button" onClick={() => makeMain(img.key)}>Make main</button> : <span />}
                            {img.kind === "new" && img.original && <button type="button" onClick={() => setRecrop({ key: img.key, file: img.original })}>Crop</button>}
                            <button type="button" className="del" onClick={() => removeImage(img.key)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <ProductExtraFields section="details" form={form} setField={setField} errors={errors} />
                {/* VISIBILITY */}
                <section className="vx-card">
                  <h2>Visibility</h2>
                  <div className="vx-field"><label htmlFor="pf-status">Product status</label><select id="pf-status" value={form.isPublished ? "published" : "draft"} onChange={(e) => setForm((prev) => ({ ...prev, isPublished: e.target.value === "published" }))}><option value="draft">Draft</option><option value="published">Published</option></select></div>
                </section>
              </div>
            </div>
          )}
        </form>
      </main>

      <input ref={variantFileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickVariantImage} />
      {variantCrop && <ImageCropper key={`variant-${variantCrop.key}`} file={variantCrop.file} onCancel={() => setVariantCrop(null)} onDone={handleVariantImage} />}
      {recrop && (
        <ImageCropper key={`recrop-${recrop.key}`} file={recrop.file} onCancel={() => setRecrop(null)} onDone={handleRecropped} />
      )}

      {cropQueue.length > 0 && !recrop && !variantCrop && (
        <ImageCropper key={`${cropQueue[0].name}-${cropQueue[0].size}-${images.length}`} file={cropQueue[0]} onCancel={() => setCropQueue((prev) => prev.slice(1))} onDone={handleCropped} />
      )}
    </div>
  );
}

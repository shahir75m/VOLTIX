import { useCallback, useEffect, useRef, useState } from "react";

const STAGE = 320;          // crop window (px)
const OUTPUT_MAX = 800;     // final image is resized to at most 800 x 800
const MIN_SIDE = 300;       // smaller source images are rejected

// Square crop + resize before upload.
// Drag the picture to move it, use the slider to zoom. "Use image" returns a resized JPEG File.
export default function ImageCropper({ file, onCancel, onDone }) {
  const [src, setSrc] = useState("");
  const [natural, setNatural] = useState(null); // { w, h }
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const imgRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    setNatural(null);
    setZoom(1);
    setError("");
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const fit = natural ? Math.max(STAGE / natural.w, STAGE / natural.h) : 1;
  const scale = fit * zoom;

  const clamp = useCallback(
    (x, y, s) => {
      if (!natural) return { x: 0, y: 0 };
      const minX = STAGE - natural.w * s;
      const minY = STAGE - natural.h * s;
      return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
    },
    [natural]
  );

  const handleLoad = (event) => {
    const w = event.target.naturalWidth;
    const h = event.target.naturalHeight;
    if (w < MIN_SIDE || h < MIN_SIDE) {
      setError(`This image is too small. Please use an image of at least ${MIN_SIDE} × ${MIN_SIDE} pixels.`);
      return;
    }
    const s = Math.max(STAGE / w, STAGE / h);
    setNatural({ w, h });
    setOffset({ x: (STAGE - w * s) / 2, y: (STAGE - h * s) / 2 }); // centred
  };

  const handleImageError = () => setError("This file could not be read as an image.");

  const onPointerDown = (event) => {
    if (!natural) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (event) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    setOffset(clamp(drag.current.ox + dx, drag.current.oy + dy, scale));
  };

  const endDrag = () => {
    drag.current = null;
  };

  const changeZoom = (value) => {
    const next = Number(value);
    const nextScale = fit * next;
    // keep the centre of the crop window fixed while zooming
    const cx = (STAGE / 2 - offset.x) / scale;
    const cy = (STAGE / 2 - offset.y) / scale;
    setZoom(next);
    setOffset(clamp(STAGE / 2 - cx * nextScale, STAGE / 2 - cy * nextScale, nextScale));
  };

  const handleUse = () => {
    if (!natural || !imgRef.current || busy) return;
    setBusy(true);

    const sourceSize = STAGE / scale;
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const outSize = Math.max(1, Math.min(OUTPUT_MAX, Math.floor(sourceSize)));

    const canvas = document.createElement("canvas");
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // PNG transparency -> white
    ctx.fillRect(0, 0, outSize, outSize);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgRef.current, sx, sy, sourceSize, sourceSize, 0, 0, outSize, outSize);

    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (!blob) {
          setError("Could not process this image. Please try another one.");
          return;
        }
        const base = file.name.replace(/\.[^.]+$/, "") || "product";
        onDone(new File([blob], `${base}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9
    );
  };

  return (
    <div className="vx-modal-bg" role="dialog" aria-modal="true" aria-label="Crop image">
      <div className="vx-modal wide">
        <h3>Crop &amp; resize image</h3>
        <p>Drag to position the picture and use the slider to zoom. The image is saved as a square (up to {OUTPUT_MAX} × {OUTPUT_MAX}px).</p>

        {error ? (
          <div className="vx-alert error" role="alert">{error}</div>
        ) : (
          <>
            <div
              className="vx-crop-stage"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{ width: STAGE, height: STAGE }}
            >
              {src && (
                <img
                  ref={imgRef}
                  src={src}
                  alt="To crop"
                  onLoad={handleLoad}
                  onError={handleImageError}
                  draggable={false}
                  style={
                    natural
                      ? {
                          width: natural.w,
                          height: natural.h,
                          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        }
                      : { visibility: "hidden" }
                  }
                />
              )}
              <div className="vx-crop-frame" />
            </div>

            <div className="vx-crop-zoom">
              <span>Zoom</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(e) => changeZoom(e.target.value)}
                disabled={!natural}
                aria-label="Zoom"
              />
            </div>
          </>
        )}

        <div className="vx-modal-actions">
          <button type="button" className="vx-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          {!error && (
            <button type="button" className="vx-btn primary" onClick={handleUse} disabled={!natural || busy}>
              {busy ? "Processing..." : "Use image"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

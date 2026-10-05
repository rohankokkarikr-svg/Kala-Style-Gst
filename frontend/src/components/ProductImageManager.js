import React, { useState, useRef, useCallback, useEffect } from "react";
import { productAPI } from "../services/api";
import { apiCache } from "../utils/apiCache";
import toast from "react-hot-toast";
import {
  HiX, HiPhotograph, HiUpload, HiTrash, HiStar, HiCheck,
  HiArrowUp, HiArrowDown, HiRefresh,
} from "react-icons/hi";

function extractImages(prod) {
  if (!prod) return [];
  let list = [];
  if (Array.isArray(prod.images) && prod.images.length > 0) {
    list = prod.images.filter(Boolean);
  } else if (typeof prod.images === "string") {
    try {
      const p = JSON.parse(prod.images);
      if (Array.isArray(p)) list = p.filter(Boolean);
    } catch (_) {}
  }
  if (list.length === 0 && Array.isArray(prod.tags)) {
    const t = prod.tags.find(x => typeof x === "string" && x.startsWith("__IMAGES__:"));
    if (t) {
      try {
        const p = JSON.parse(t.replace("__IMAGES__:", ""));
        if (Array.isArray(p)) list = p.filter(Boolean);
      } catch (_) {}
    }
  }
  if (list.length === 0) {
    const fb = prod.image_url || prod.image;
    if (fb) list = [fb];
  }
  return [...new Set(list.filter(Boolean))];
}

export default function ProductImageManager({ product, onClose, onSaved }) {
  const fileInputRef = useRef();
  const [images, setImages] = useState(() => extractImages(product));
  const [primaryIdx, setPrimaryIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState(() => extractImages(product)[0] || "");

  useEffect(() => {
    setPreview(images[primaryIdx] || images[0] || "");
  }, [primaryIdx, images]);

  const uploadFile = async (file) => {
    if (!file?.type.startsWith("image/")) { toast.error("Only image files are allowed."); return null; }
    const fd = new FormData();
    fd.append("image", file);
    const tid = toast.loading("Uploading image\u2026");
    try {
      const { data } = await productAPI.uploadDirect(fd);
      if (data?.imageUrl) { toast.success("Image uploaded!", { id: tid }); return data.imageUrl; }
      throw new Error("no url");
    } catch {
      toast.error("Upload failed \u2014 please try again.", { id: tid }); return null;
    }
  };

  const handleFiles = useCallback(async (files) => {
    const toProcess = Array.from(files).slice(0, 10 - images.length);
    if (toProcess.length === 0) { toast.error("Maximum 10 images allowed."); return; }
    setUploading(true);
    const urls = [];
    for (const f of toProcess) { const u = await uploadFile(f); if (u) urls.push(u); }
    if (urls.length > 0) { setImages(prev => [...prev, ...urls]); toast.success(urls.length + " image(s) added!"); }
    setUploading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  const onDrop = useCallback((e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }, [handleFiles]);

  const removeImage = (idx) => {
    setImages(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (primaryIdx >= next.length) setPrimaryIdx(Math.max(0, next.length - 1));
      return next;
    });
  };

  const moveImage = (idx, dir) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= images.length) return;
    setImages(prev => {
      const a = [...prev]; [a[idx], a[ni]] = [a[ni], a[idx]];
      if (primaryIdx === idx) setPrimaryIdx(ni);
      else if (primaryIdx === ni) setPrimaryIdx(idx);
      return a;
    });
  };

  const handleSave = async () => {
    if (images.length === 0) { toast.error("Add at least one image before saving."); return; }
    setSaving(true);
    const ordered = [images[primaryIdx], ...images.filter((_, i) => i !== primaryIdx)];
    try {
      await productAPI.update(product.id, { image_url: ordered[0], images: ordered });
      apiCache.invalidateProducts();
      window.dispatchEvent(new CustomEvent("kala:sync:products_updated", { detail: { payload: { action: "update" } } }));
      toast.success("Product images saved! \uD83C\uDF89");
      if (onSaved) onSaved(ordered);
      onClose();
    } catch (err) {
      console.error("Save images error:", err);
      toast.error("Failed to save images. Please try again.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(6px)" }}>
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-dark-600/80 shadow-2xl" style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)" }}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-dark-700/60" style={{ background: "rgba(26,26,46,0.95)", backdropFilter: "blur(8px)" }}>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><HiPhotograph className="w-5 h-5 text-gold-400" /> Manage Product Images</h2>
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{product.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-dark-700 hover:bg-dark-600 flex items-center justify-center transition-colors"><HiX className="w-4 h-4 text-gray-300" /></button>
        </div>

        <div className="p-6 space-y-6">

          {/* Preview + thumbnail strip */}
          {images.length > 0 && (
            <div className="flex gap-4">
              <div className="flex flex-col gap-2 overflow-y-auto max-h-80 pr-1">
                {images.map((url, idx) => (
                  <button key={idx} onClick={() => setPreview(url)} className={"relative w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all duration-200 " + (preview === url ? "border-gold-500 shadow-lg shadow-gold-500/30" : "border-dark-600 hover:border-dark-400")}>
                    <img src={url} alt={"img-" + idx} className="w-full h-full object-cover" onError={e => { e.target.src = "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=200&auto=format&fit=crop"; }} />
                    {idx === primaryIdx && <span className="absolute top-0.5 left-0.5 bg-gold-500 rounded-full p-0.5"><HiStar className="w-2.5 h-2.5 text-dark-900" /></span>}
                  </button>
                ))}
              </div>
              <div className="flex-1 relative rounded-xl overflow-hidden bg-dark-800 border border-dark-600/60" style={{ minHeight: 280 }}>
                {preview ? (
                  <img src={preview} alt="preview" className="w-full h-full object-contain" style={{ maxHeight: 320 }} onError={e => { e.target.src = "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop"; }} />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500"><HiPhotograph className="w-16 h-16 opacity-30" /></div>
                )}
                <div className="absolute bottom-2 right-2 bg-dark-900/80 text-gold-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gold-500/30">{images.findIndex(u => u === preview) + 1} / {images.length}</div>
              </div>
            </div>
          )}

          {/* Image list with controls */}
          {images.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">All Images ({images.length}/10)</h3>
              <div className="space-y-2">
                {images.map((url, idx) => (
                  <div key={idx} className={"flex items-center gap-3 p-2.5 rounded-xl border transition-all " + (idx === primaryIdx ? "border-gold-500/50 bg-gold-500/5" : "border-dark-600/60 bg-dark-800/40 hover:border-dark-500")}>
                    <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 cursor-pointer border border-dark-600" onClick={() => setPreview(url)}>
                      <img src={url} alt={"img-" + idx} className="w-full h-full object-cover hover:scale-105 transition-transform" onError={e => { e.target.src = "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=200&auto=format&fit=crop"; }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate">{idx === primaryIdx ? <span className="inline-flex items-center gap-1 text-gold-400"><HiStar className="w-3 h-3" /> Primary Image</span> : "Image " + (idx + 1)}</p>
                      <p className="text-gray-500 text-[10px] truncate mt-0.5">{url.slice(0, 60)}&hellip;</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {idx !== primaryIdx ? (
                        <button onClick={() => { setPrimaryIdx(idx); toast.success("Set as primary image"); }} title="Set as primary" className="w-7 h-7 rounded-lg bg-gold-500/10 text-gold-400 hover:bg-gold-500/20 flex items-center justify-center transition-colors border border-gold-500/20"><HiStar className="w-3.5 h-3.5" /></button>
                      ) : (
                        <span className="w-7 h-7 rounded-lg bg-gold-500/20 text-gold-500 flex items-center justify-center border border-gold-500/30"><HiCheck className="w-3.5 h-3.5" /></span>
                      )}
                      <button onClick={() => moveImage(idx, -1)} disabled={idx === 0} title="Move up" className="w-7 h-7 rounded-lg bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600 flex items-center justify-center transition-colors disabled:opacity-30"><HiArrowUp className="w-3 h-3" /></button>
                      <button onClick={() => moveImage(idx, 1)} disabled={idx === images.length - 1} title="Move down" className="w-7 h-7 rounded-lg bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600 flex items-center justify-center transition-colors disabled:opacity-30"><HiArrowDown className="w-3 h-3" /></button>
                      <button onClick={() => removeImage(idx)} title="Remove" className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors border border-red-500/20"><HiTrash className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload drop zone */}
          {images.length < 10 && (
            <div onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop} onClick={() => !uploading && fileInputRef.current?.click()}
              className={"relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 " + (isDragging ? "border-gold-400 bg-gold-500/10 scale-[1.01]" : "border-dark-600 hover:border-gold-500/50 hover:bg-dark-800/60 bg-dark-800/30")}>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              {uploading ? (
                <div className="flex flex-col items-center gap-2"><HiRefresh className="w-8 h-8 text-gold-400 animate-spin" /><p className="text-gold-400 font-medium text-sm">Uploading&hellip;</p></div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-gold-500/10 flex items-center justify-center border border-gold-500/20 mb-1"><HiUpload className="w-6 h-6 text-gold-400" /></div>
                  <p className="text-white font-semibold text-sm">{images.length === 0 ? "Add Product Images" : "Add More Images"}</p>
                  <p className="text-gray-400 text-xs">Drag &amp; drop or click to browse &middot; JPEG, PNG, WebP &middot; Max 10MB each</p>
                  <p className="text-gray-600 text-[10px]">{10 - images.length} slot{10 - images.length !== 1 ? "s" : ""} remaining</p>
                </div>
              )}
            </div>
          )}

          {images.length >= 10 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-amber-400 text-xs text-center">Maximum of 10 images reached. Remove one to add another.</div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-dark-700/60" style={{ background: "rgba(26,26,46,0.97)", backdropFilter: "blur(8px)" }}>
          <p className="text-gray-500 text-xs">{images.length === 0 ? "No images \u2014 add at least one before saving" : images.length + " image" + (images.length !== 1 ? "s" : "") + " \u00B7 Image 1 is the primary"}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-sm px-4 py-2 border border-dark-500 rounded-lg hover:border-dark-400">Cancel</button>
            <button onClick={handleSave} disabled={saving || images.length === 0 || uploading} className="btn-primary text-sm px-5 py-2 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? <><HiRefresh className="w-4 h-4 animate-spin" /> Saving&hellip;</> : <><HiCheck className="w-4 h-4" /> Save Images</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

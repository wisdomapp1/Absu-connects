import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Check, Move } from 'lucide-react';

interface ImageCropperModalProps {
  isOpen: boolean;
  imageSrc: string;
  aspectRatio: '1:1' | '16:9';
  title?: string;
  fileName?: string;
  onCancel: () => void;
  onConfirm: (croppedFile: File, previewUrl: string) => void;
}

/**
 * Interactive pointer/touch + zoom canvas cropper supporting 1:1 (Page Profile) and 16:9 (Page Cover).
 */
export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  isOpen,
  imageSrc,
  aspectRatio,
  title,
  fileName = 'cropped-page-image.jpg',
  onCancel,
  onConfirm,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  useEffect(() => {
    if (!isOpen || !imageSrc) return;
    setImgLoaded(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setNaturalSize({
        width: img.naturalWidth || 800,
        height: img.naturalHeight || 800,
      });
      setImgLoaded(true);
    };
    img.src = imageSrc;
  }, [isOpen, imageSrc]);

  const frameWidth = aspectRatio === '16:9' ? 320 : 256;
  const frameHeight = aspectRatio === '16:9' ? 180 : 256;

  // Base cover scale so the image always fills the frame at zoom=1
  const baseScale = Math.max(frameWidth / naturalSize.width, frameHeight / naturalSize.height);
  const effectiveScale = baseScale * zoom;
  const displayedW = naturalSize.width * effectiveScale;
  const displayedH = naturalSize.height * effectiveScale;
  const maxPanX = Math.max(0, (displayedW - frameWidth) / 2);
  const maxPanY = Math.max(0, (displayedH - frameHeight) / 2);

  const clampOffset = useCallback(
    (nx: number, ny: number) => ({
      x: Math.max(-maxPanX, Math.min(maxPanX, nx)),
      y: Math.max(-maxPanY, Math.min(maxPanY, ny)),
    }),
    [maxPanX, maxPanY]
  );

  useEffect(() => {
    setOffset((prev) => clampOffset(prev.x, prev.y));
  }, [zoom, clampOffset]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.origX + dx, dragRef.current.origY + dy));
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  const handleConfirmCrop = async () => {
    const img = imgRef.current;
    if (!img || !imgLoaded || processing) return;
    setProcessing(true);

    try {
      const outW = aspectRatio === '16:9' ? 1280 : 720;
      const outH = aspectRatio === '16:9' ? 720 : 720;
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      // Map the frame coordinates cleanly to source image pixels
      const ratioToOutput = outW / frameWidth;
      const drawW = displayedW * ratioToOutput;
      const drawH = displayedH * ratioToOutput;
      const drawX = (outW - drawW) / 2 + offset.x * ratioToOutput;
      const drawY = (outH - drawH) / 2 + offset.y * ratioToOutput;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Could not encode cropped image'))),
          'image/jpeg',
          0.9
        );
      });

      const safeName = fileName.replace(/\.[^.]+$/, '') + '.jpg';
      const croppedFile = new File([blob], safeName, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      const previewUrl = URL.createObjectURL(blob);
      onConfirm(croppedFile, previewUrl);
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
              {title || (aspectRatio === '16:9' ? 'Crop Cover Photo (16:9)' : 'Crop Profile Picture (1:1)')}
            </h3>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Drag to reposition and adjust zoom
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
            aria-label="Cancel crop"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center gap-4 bg-slate-950/90">
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ width: frameWidth, height: frameHeight }}
            className={`relative overflow-hidden border-2 border-white/80 shadow-lg touch-none cursor-grab active:cursor-grabbing bg-slate-900 select-none ${
              aspectRatio === '1:1' ? 'rounded-2xl' : 'rounded-xl'
            }`}
          >
            {imgLoaded ? (
              <img
                src={imageSrc}
                alt="Crop preview"
                draggable={false}
                style={{
                  width: displayedW,
                  height: displayedH,
                  maxWidth: 'none',
                  transform: `translate(${(frameWidth - displayedW) / 2 + offset.x}px, ${
                    (frameHeight - displayedH) / 2 + offset.y
                  }px)`,
                }}
                className="pointer-events-none select-none block"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-white/70">
                Loading image...
              </div>
            )}

            <div className="pointer-events-none absolute bottom-2 right-2 bg-black/55 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1">
              <Move className="w-3 h-3" /> Drag
            </div>
          </div>

          <div className="w-full max-w-xs flex items-center gap-3 text-white">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, Number((z - 0.15).toFixed(2))))}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--color-primary)] cursor-pointer"
              aria-label="Zoom level"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, Number((z + 0.15).toFixed(2))))}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-end gap-2 bg-[var(--color-bg-card)]">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!imgLoaded || processing}
            onClick={handleConfirmCrop}
            className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
          >
            <Check className="w-4 h-4" />
            <span>{processing ? 'Applying...' : 'Apply Crop'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

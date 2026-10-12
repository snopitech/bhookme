import React, { useEffect, useRef, useState } from 'react';

// ============================================================
// PropertyGallery
// ------------------------------------------------------------
// Airbnb-style mosaic grid of property photos, with a fullscreen
// lightbox that supports tap-to-zoom, drag-to-pan, swipe navigation,
// and keyboard controls. Adapted from the eStore's ProductDetailPage
// zoom implementation.
// ============================================================

const ZOOM_STEPS = 5;
const MAX_ZOOM_SCALE = 2.5;
const DRAG_THRESHOLD_PX = 6;
const LIGHTBOX_SWIPE_THRESHOLD_PX = 60;
const MAIN_IMAGE_ENHANCE_FILTER = 'contrast(1.08) saturate(1.12) brightness(1.02)';

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

const getPanBounds = (container, scale) => {
  const rect = container.getBoundingClientRect();
  const maxX = Math.max(0, (rect.width * (scale - 1)) / 2);
  const maxY = Math.max(0, (rect.height * (scale - 1)) / 2);
  return { maxX, maxY };
};

export default function PropertyGallery({ images, title }) {
  const photos = Array.isArray(images) && images.length > 0 ? images : [];

  // ===== LIGHTBOX STATE =====
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // ===== ZOOM + PAN STATE =====
  const [zoomLevel, setZoomLevel] = useState(0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const imageContainerRef = useRef(null);

  // One ref tracks every pointer interaction:
  // - tap (no movement)    -> zoom in/out
  // - drag while zoomed    -> pan the image
  // - horizontal drag      -> swipe to previous/next image (only when
  //                           NOT zoomed - so panning still works when zoomed)
  const pointerRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
  });

  const isImageZoomed = zoomLevel > 0;
  const zoomScale = 1 + (zoomLevel / ZOOM_STEPS) * (MAX_ZOOM_SCALE - 1);

  // Reset zoom/pan when the image changes or lightbox closes.
  useEffect(() => {
    setZoomLevel(0);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  }, [lightboxIndex, isLightboxOpen]);

  // ===== LIGHTBOX NAVIGATION =====
  const openLightbox = (index = 0) => {
    if (photos.length === 0) return;
    setLightboxIndex(index);
    setIsLightboxOpen(true);
  };

  const closeLightbox = () => {
    setIsLightboxOpen(false);
    setZoomLevel(0);
    setPanOffset({ x: 0, y: 0 });
  };

  const lightboxPrev = () => {
    if (photos.length === 0) return;
    setLightboxIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  };

  const lightboxNext = () => {
    if (photos.length === 0) return;
    setLightboxIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
  };

  // ===== TAP-TO-ZOOM =====
  const applyTapZoom = (clientX, clientY) => {
    const nextLevel = zoomLevel >= ZOOM_STEPS ? 0 : zoomLevel + 1;

    if (nextLevel === 0) {
      setZoomLevel(0);
      setPanOffset({ x: 0, y: 0 });
      return;
    }

    const container = imageContainerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const tapX = clientX - rect.left;
      const tapY = clientY - rect.top;
      const nextScale = 1 + (nextLevel / ZOOM_STEPS) * (MAX_ZOOM_SCALE - 1);
      const dx = tapX - rect.width / 2;
      const dy = tapY - rect.height / 2;
      const bounds = getPanBounds(container, nextScale);
      setPanOffset({
        x: clampValue(-dx * nextScale, -bounds.maxX, bounds.maxX),
        y: clampValue(-dy * nextScale, -bounds.maxY, bounds.maxY),
      });
    }

    setZoomLevel(nextLevel);
  };

  // ===== UNIFIED POINTER HANDLERS =====

  const handlePointerDown = (e) => {
    pointerRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: panOffset.x,
      startPanY: panOffset.y,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // harmless
    }
  };

  const handlePointerMove = (e) => {
    const p = pointerRef.current;
    if (!p.active) return;

    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;

    if (!p.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      p.moved = true;
      setIsPanning(true);
    }

    // Pan the image only while zoomed in.
    if (p.moved && zoomLevel > 0) {
      const container = imageContainerRef.current;
      const bounds = container
        ? getPanBounds(container, zoomScale)
        : { maxX: Infinity, maxY: Infinity };
      setPanOffset({
        x: clampValue(p.startPanX + dx, -bounds.maxX, bounds.maxX),
        y: clampValue(p.startPanY + dy, -bounds.maxY, bounds.maxY),
      });
    }
  };

  const handlePointerUp = (e) => {
    const p = pointerRef.current;
    if (!p.active) return;
    p.active = false;
    setIsPanning(false);

    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;

    // Tap: no significant movement -> zoom
    if (!p.moved) {
      applyTapZoom(e.clientX, e.clientY);
      return;
    }

    // Swipe: horizontal movement while NOT zoomed -> previous/next image
    if (zoomLevel === 0) {
      if (dx > LIGHTBOX_SWIPE_THRESHOLD_PX) {
        lightboxPrev();
      } else if (dx < -LIGHTBOX_SWIPE_THRESHOLD_PX) {
        lightboxNext();
      }
    }
    // (If zoomed, movement was already handled as pan in handlePointerMove.)
  };

  const handlePointerCancel = () => {
    pointerRef.current.active = false;
    setIsPanning(false);
  };

  // ===== KEYBOARD (lightbox) + BODY SCROLL LOCK =====
  useEffect(() => {
    if (!isLightboxOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') lightboxPrev();
      else if (e.key === 'ArrowRight') lightboxNext();
    };

    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLightboxOpen]);

  // ===== EMPTY STATE =====
  if (photos.length === 0) {
    return (
      <div className="rounded-xl overflow-hidden mb-8 bg-gray-200 h-96 flex items-center justify-center text-gray-400">
        No photos yet
      </div>
    );
  }

  // ===== MOSAIC GRID (default view) =====
  const grid = photos.length === 1 ? (
    <div className="rounded-xl overflow-hidden mb-8 cursor-pointer" onClick={() => openLightbox(0)}>
      <img src={photos[0]} alt={title} className="w-full h-96 object-cover hover:opacity-95 transition" />
    </div>
  ) : (
    <div className="grid grid-cols-4 grid-rows-2 gap-2 rounded-xl overflow-hidden mb-8 h-96 relative">
      <div className="col-span-2 row-span-2 cursor-pointer" onClick={() => openLightbox(0)}>
        <img src={photos[0]} alt={title} className="w-full h-full object-cover hover:opacity-95 transition" />
      </div>
      {photos.slice(1, 5).map((url, i) => (
        <div key={i} className="col-span-1 row-span-1 cursor-pointer" onClick={() => openLightbox(i + 1)}>
          <img src={url} alt={`${title} ${i + 2}`} className="w-full h-full object-cover hover:opacity-95 transition" />
        </div>
      ))}
      {photos.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openLightbox(0); }}
          className="absolute bottom-4 right-4 bg-white px-4 py-2 rounded-lg shadow font-medium text-sm hover:bg-gray-50 transition"
        >
          Show all photos
        </button>
      )}
    </div>
  );

  // ===== LIGHTBOX (rendered when open) =====
  const lightbox = isLightboxOpen && photos[lightboxIndex] ? (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
      onClick={closeLightbox}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between p-3 sm:p-4 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs sm:text-sm text-gray-300">
          {lightboxIndex + 1} / {photos.length}
        </span>
        <button
          onClick={closeLightbox}
          aria-label="Close fullscreen view"
          className="p-2 rounded-full text-white hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center transition"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Image area */}
      <div
        ref={imageContainerRef}
        className="flex-1 relative flex items-center justify-center overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{
          cursor: zoomLevel === 0 ? 'zoom-in' : (isPanning ? 'grabbing' : 'grab'),
          touchAction: zoomLevel > 0 ? 'none' : 'auto',
        }}
      >
        {photos.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}
            className="hidden sm:flex absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full p-2.5 min-h-[44px] min-w-[44px] items-center justify-center transition"
            aria-label="Previous image"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        <img
          src={photos[lightboxIndex]}
          alt={`${title} - ${lightboxIndex + 1}`}
          className="max-w-full max-h-full object-contain px-3 sm:px-6"
          draggable={false}
          style={{
            transform: zoomLevel > 0
              ? `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`
              : 'translateX(0px)',
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.2s ease',
            filter: MAIN_IMAGE_ENHANCE_FILTER,
          }}
        />

        {/* Zoom hint / level indicator */}
        <div className="absolute top-3 right-3 bg-black/50 text-white text-[10px] sm:text-xs px-2 py-1 rounded-full flex items-center gap-1.5 pointer-events-none">
          {zoomLevel === 0 ? (
            <>
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              Tap to zoom
            </>
          ) : (
            <>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: ZOOM_STEPS }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${i < zoomLevel ? 'bg-white' : 'bg-white/30'}`}
                  />
                ))}
              </div>
              <span>{zoomLevel >= ZOOM_STEPS ? 'Drag • Tap to reset' : 'Drag • Tap to zoom in'}</span>
            </>
          )}
        </div>

        {photos.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); lightboxNext(); }}
            className="hidden sm:flex absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full p-2.5 min-h-[44px] min-w-[44px] items-center justify-center transition"
            aria-label="Next image"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Dot pagination */}
      {photos.length > 1 && (
        <div
          className="flex justify-center gap-1.5 pb-4 sm:pb-6 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label={`Go to image ${i + 1}`}
              className={`w-2 h-2 rounded-full transition ${i === lightboxIndex ? 'bg-white' : 'bg-white/30 hover:bg-white/50'}`}
            />
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      {grid}
      {lightbox}
    </>
  );
}
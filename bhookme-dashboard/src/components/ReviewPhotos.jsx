import React, { useEffect, useState } from 'react';

// Thumbnails for a review's photos. Tapping one opens it full size,
// with arrows / arrow keys to move between photos and Esc to close.
export default function ReviewPhotos({ urls = [], size = 'w-20 h-20' }) {
  const [openIndex, setOpenIndex] = useState(null);

  useEffect(() => {
    if (openIndex === null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenIndex(null);
      if (e.key === 'ArrowRight') setOpenIndex((i) => (i + 1) % urls.length);
      if (e.key === 'ArrowLeft') setOpenIndex((i) => (i - 1 + urls.length) % urls.length);
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [openIndex, urls.length]);

  if (!urls.length) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {urls.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpenIndex(i)}
            className={`${size} rounded-lg overflow-hidden bg-gray-100 border border-gray-200 hover:opacity-90`}
            aria-label={`Open photo ${i + 1}`}
          >
            <img src={url} alt={`Review photo ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Review photo"
          onClick={() => setOpenIndex(null)}
        >
          <img
            src={urls[openIndex]}
            alt={`Review photo ${openIndex + 1}`}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            aria-label="Close"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 text-gray-900 text-2xl leading-none"
          >
            ×
          </button>
          {urls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenIndex((i) => (i - 1 + urls.length) % urls.length);
                }}
                aria-label="Previous photo"
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-900 text-xl"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenIndex((i) => (i + 1) % urls.length);
                }}
                aria-label="Next photo"
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-900 text-xl"
              >
                ›
              </button>
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">
                {openIndex + 1} / {urls.length}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
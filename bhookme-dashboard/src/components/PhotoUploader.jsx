import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches the backend's 10MB limit
// JPEG/PNG/WebP only: on iPhones this makes the photo picker hand over
// JPEGs instead of HEIC files (which the server can't resize and most
// browsers can't display).
const ACCEPT = 'image/jpeg,image/png,image/webp';
const PARALLEL_UPLOADS = 3;

let nextId = 1;

// Uploads one file to /api/upload/image with progress reporting.
function uploadFile(file, folder, token, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    if (folder) form.append('folder', folder);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/upload/image`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error body
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.url) resolve(data.url);
      else reject(new Error(data?.message || `Upload failed (status ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('Could not reach the server.'));
    xhr.send(form);
  });
}

/**
 * Multi-photo uploader: pick or drop many photos, they upload in the background
 * (3 at a time, resized/compressed by the server), then can be reordered or removed.
 * The first photo is the cover.
 *
 *   <PhotoUploader value={urls} onChange={setUrls} folder="properties" max={30} />
 *
 * `value` is the list of uploaded photo URLs. `onUploadingChange(bool)` lets a form
 * disable its submit button while uploads are still running.
 */
export default function PhotoUploader({ value = [], onChange, folder, max = 30, onUploadingChange }) {
  const { token } = useAuth();
  const inputRef = useRef(null);
  const [pending, setPending] = useState([]); // { id, name, preview, progress, error }
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [notice, setNotice] = useState('');
  const urlsRef = useRef(value);

  useEffect(() => {
    urlsRef.current = value;
  }, [value]);

  const uploading = pending.some((p) => !p.error);
  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  // Free the local preview images when they're no longer shown.
  useEffect(
    () => () => {
      pending.forEach((p) => URL.revokeObjectURL(p.preview));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updatePending = (id, patch) =>
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addFiles = async (fileList) => {
    setNotice('');
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const room = max - urlsRef.current.length - pending.filter((p) => !p.error).length;
    if (room <= 0) {
      setNotice(`You can add up to ${max} photos.`);
      return;
    }

    const accepted = [];
    const skipped = [];
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) skipped.push(`${file.name} is not an image`);
      else if (file.size > MAX_FILE_BYTES) skipped.push(`${file.name} is over 10MB`);
      else accepted.push(file);
    });
    if (accepted.length > room) {
      skipped.push(`${accepted.length - room} photo(s) over the ${max}-photo limit`);
      accepted.length = room;
    }
    if (skipped.length) setNotice(`Skipped: ${skipped.join('; ')}.`);

    const jobs = accepted.map((file) => ({
      id: nextId++,
      name: file.name,
      preview: URL.createObjectURL(file),
      progress: 0,
      error: '',
      file,
    }));
    setPending((prev) => [...prev, ...jobs.map(({ file, ...rest }) => rest)]);

    // Upload a few at a time, adding each URL as soon as it finishes.
    let index = 0;
    const worker = async () => {
      while (index < jobs.length) {
        const job = jobs[index++];
        try {
          const url = await uploadFile(job.file, folder, token, (progress) => updatePending(job.id, { progress }));
          const next = [...urlsRef.current, url];
          urlsRef.current = next;
          onChange(next);
          URL.revokeObjectURL(job.preview);
          setPending((prev) => prev.filter((p) => p.id !== job.id));
        } catch (err) {
          updatePending(job.id, { error: err.message, progress: 0 });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, jobs.length) }, worker));
  };

  const removeUrl = (url) => onChange(value.filter((u) => u !== url));

  const dismissFailed = (id) =>
    setPending((prev) => {
      const job = prev.find((p) => p.id === id);
      if (job) URL.revokeObjectURL(job.preview);
      return prev.filter((p) => p.id !== id);
    });

  const move = (from, to) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const total = value.length + pending.filter((p) => !p.error).length;

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files?.length) return;
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={`flex flex-col items-center justify-center text-center border-2 border-dashed rounded-xl px-4 py-8 cursor-pointer transition ${
          dragOver ? 'border-rose-500 bg-rose-50' : 'border-gray-300 hover:border-gray-500 bg-gray-50'
        }`}
      >
        <span className="text-3xl mb-2" aria-hidden="true">📷</span>
        <p className="font-semibold text-sm">Drag photos here or click to choose</p>
        <p className="text-xs text-gray-500 mt-1">
          JPG, PNG or WebP, up to 10MB each, up to {max} photos. Large photos are resized automatically.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {notice && <p className="text-sm text-amber-700 mt-2">{notice}</p>}

      {(value.length > 0 || pending.length > 0) && (
        <>
          <p className="text-xs text-gray-500 mt-3 mb-2">
            {total} of {max} photos · drag to reorder · the first photo is the cover
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {value.map((url, i) => (
              <div
                key={url}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragIndex !== null) move(dragIndex, i);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={`relative group aspect-[4/3] rounded-lg overflow-hidden bg-gray-100 border cursor-move ${
                  dragIndex === i ? 'opacity-40 border-gray-400' : 'border-gray-200'
                }`}
              >
                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover pointer-events-none" />
                {i === 0 && (
                  <span className="absolute top-2 left-2 bg-white text-xs font-semibold px-2 py-0.5 rounded shadow">
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeUrl(url)}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/95 shadow text-sm font-bold hover:bg-white"
                >
                  ×
                </button>
                <div className="absolute bottom-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label="Move earlier"
                    className="w-7 h-7 rounded-full bg-white/95 shadow text-sm disabled:opacity-30"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === value.length - 1}
                    aria-label="Move later"
                    className="w-7 h-7 rounded-full bg-white/95 shadow text-sm disabled:opacity-30"
                  >
                    ›
                  </button>
                </div>
              </div>
            ))}

            {pending.map((p) => (
              <div key={p.id} className="relative aspect-[4/3] rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                <img src={p.preview} alt={p.name} className="w-full h-full object-cover opacity-50" />
                <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
                  {p.error ? (
                    <>
                      <p className="text-xs font-semibold text-red-600 bg-white/90 rounded px-2 py-1">{p.error}</p>
                      <button
                        type="button"
                        onClick={() => dismissFailed(p.id)}
                        className="mt-2 text-xs font-semibold underline bg-white/90 rounded px-2 py-0.5"
                      >
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <div className="w-3/4 h-1.5 bg-white/80 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500 transition-all" style={{ width: `${p.progress}%` }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
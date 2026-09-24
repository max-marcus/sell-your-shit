import { useRef, useState } from 'react';
import type { Item } from '@sell/core';
import { api } from '../api';

interface Props {
  item: Item;
  maxPhotos: number;
  onChange: (item: Item) => void;
}

export function PhotoManager({ item, maxPhotos, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = maxPhotos - item.photos.length;

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    const toUpload = list.slice(0, Math.max(0, remaining));
    if (toUpload.length === 0) {
      setError(`Photo limit reached (${maxPhotos}).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChange(await api.uploadPhotos(item.id, toUpload));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(photoId: string) {
    setBusy(true);
    try {
      onChange(await api.deletePhoto(item.id, photoId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= item.photos.length) return;
    const ids = item.photos.map((p) => p.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(next, 0, moved!);
    setBusy(true);
    try {
      onChange(await api.reorderPhotos(item.id, ids));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Photos</h2>
        <span className="hint" style={{ color: 'var(--muted)', fontSize: 12 }}>
          {item.photos.length} / {maxPhotos} · first photo is the cover
        </span>
      </div>

      {item.photos.length > 0 && (
        <div className="photo-grid" style={{ marginBottom: 14 }}>
          {item.photos.map((photo, index) => (
            <div key={photo.id} className="photo" style={{ backgroundImage: `url(${photo.url})` }}>
              <div className="overlay">
                <div className="row" style={{ gap: 4 }}>
                  <button
                    className="icon-btn"
                    title="Move left"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ‹
                  </button>
                  <button
                    className="icon-btn"
                    title="Move right"
                    disabled={busy || index === item.photos.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ›
                  </button>
                </div>
                <button className="icon-btn" title="Delete" disabled={busy} onClick={() => remove(photo.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={`dropzone ${dragging ? 'drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <span>
            <span className="spinner" /> Uploading…
          </span>
        ) : remaining > 0 ? (
          <span>Drag photos here or click to upload ({remaining} left)</span>
        ) : (
          <span>Photo limit reached</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = '';
        }}
      />
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

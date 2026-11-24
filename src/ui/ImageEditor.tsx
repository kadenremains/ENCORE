import { useEffect, useRef, useState } from 'react';
import { entityKey } from '../lib/db';
import { currentImage, fileToDataUrl, getOverride, removeOverride, setOverride, urlToDataUrl, useImagesVersion } from '../lib/images';
import type { EntityKind } from '../lib/types';
import { Field, Slider } from './controls';

export interface EntityRef {
  kind: EntityKind;
  name: string;
  artist: string;
}

/** Modal for replacing / cropping the artwork of one artist, album or song. */
export function ImageEditor({ entity, onClose }: { entity: EntityRef; onClose: () => void }) {
  useImagesVersion();
  const key = entityKey(entity.kind, entity.name, entity.artist);
  const existing = getOverride(key);
  const auto = currentImage(entity.kind, entity.name, entity.artist);
  const [src, setSrc] = useState<string>(existing?.src ?? '');
  const [zoom, setZoom] = useState(existing?.zoom ?? 1);
  const [x, setX] = useState(existing?.x ?? 50);
  const [y, setY] = useState(existing?.y ?? 50);
  const [url, setUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [linkNote, setLinkNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [fetching, setFetching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const shown = src || (auto && !auto.custom ? auto.src : '');
  const editingAuto = !src && !!shown;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const takeFile = async (f: File) => {
    setSrc(await fileToDataUrl(f));
    setZoom(1);
    setX(50);
    setY(50);
  };

  // drag on the preview to move the focal point
  const dragRef = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);

  const save = async () => {
    const finalSrc = src || shown;
    if (!finalSrc) return;
    await setOverride({ key, src: finalSrc, zoom, x, y });
    onClose();
  };

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal image-editor" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">{entity.kind === 'track' ? 'Song' : entity.kind === 'album' ? 'Album' : 'Artist'} image</div>
            <h3>{entity.name}</h3>
            {entity.kind !== 'artist' && <div className="muted">{entity.artist}</div>}
          </div>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="image-editor-body">
          <div
            ref={previewRef}
            className={`crop-preview ${dragOver ? 'drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) takeFile(f);
            }}
            onPointerDown={(e) => {
              if (!shown) return;
              (e.target as Element).setPointerCapture(e.pointerId);
              dragRef.current = { sx: e.clientX, sy: e.clientY, x, y };
            }}
            onPointerMove={(e) => {
              const d = dragRef.current;
              const el = previewRef.current;
              if (!d || !el) return;
              const k = 100 / (el.clientWidth * zoom);
              setX(Math.max(0, Math.min(100, d.x - (e.clientX - d.sx) * k)));
              setY(Math.max(0, Math.min(100, d.y - (e.clientY - d.sy) * k)));
            }}
            onPointerUp={() => (dragRef.current = null)}
          >
            {shown ? (
              <img src={shown} alt="" draggable={false} style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` }} />
            ) : (
              <div className="crop-empty">
                Drop an image here
                <br />
                <span className="muted">or use the buttons below</span>
              </div>
            )}
          </div>
          <div className="image-editor-side">
            <div className="row gap">
              <button className="btn primary" onClick={() => fileRef.current?.click()}>
                Upload image
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) takeFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            <Field label="…or paste an image URL">
              <div className="row gap">
                <input className="text-input" value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
                <button
                  className="btn"
                  disabled={!url || fetching}
                  onClick={async () => {
                    const link = url.trim();
                    if (!/^https?:\/\/[^\s]+$/i.test(link)) {
                      setLinkNote({ text: 'Paste a link that starts with https://', bad: true });
                      return;
                    }
                    setFetching(true);
                    setLinkNote(null);
                    // keep our own copy so exports + other devices don't depend on that website
                    const got = await urlToDataUrl(link);
                    setFetching(false);
                    if (got) {
                      setSrc(got.src);
                      setZoom(1);
                      setX(50);
                      setY(50);
                      setUrl('');
                      const small = Math.min(got.width, got.height);
                      setLinkNote(
                        small < 700
                          ? { text: `Saved, but it's only ${got.width}×${got.height}, so it may look soft in exports. On Google Images, open the picture and use “Copy image address” on the full-size version.`, bad: true }
                          : { text: `Saved a copy (${got.width}×${got.height}).` },
                      );
                    } else {
                      setSrc(link);
                      setUrl('');
                      setLinkNote({ text: "That site doesn't allow copying its pictures, so this may not show up in exports. Saving the picture and uploading it works every time.", bad: true });
                    }
                  }}
                >
                  {fetching ? '…' : 'Use'}
                </button>
              </div>
            </Field>
            {linkNote && <p className={`small ${linkNote.bad ? 'warn-text' : 'muted'}`}>{linkNote.text}</p>}
            {editingAuto && <p className="muted small">Adjusting the automatic image. Saving keeps your crop.</p>}
            <Field label="Zoom">
              <Slider value={zoom} min={1} max={4} step={0.01} onChange={setZoom} />
            </Field>
            <Field label="Horizontal focus">
              <Slider value={x} min={0} max={100} onChange={setX} suffix="%" />
            </Field>
            <Field label="Vertical focus">
              <Slider value={y} min={0} max={100} onChange={setY} suffix="%" />
            </Field>
            <p className="muted small">Tip: drag the image to reposition it.</p>
            <div className="row gap end">
              {existing && (
                <button
                  className="btn danger"
                  onClick={async () => {
                    await removeOverride(key);
                    onClose();
                  }}
                >
                  Reset to automatic
                </button>
              )}
              <button className="btn primary" onClick={save} disabled={!shown}>
                Save image
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

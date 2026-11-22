import type { CSSProperties } from 'react';
import { useEntityImage } from '../lib/images';
import type { EntityKind } from '../lib/types';
import type { ImageShape } from '../editor/model';

export const fmtNum = (n: number) => Math.round(n).toLocaleString();

export function compact(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return Math.round(n / 1000) + 'K';
  return fmtNum(n);
}

export const shapeRadius = (shape: ImageShape, size: number) => (shape === 'circle' ? '50%' : shape === 'rounded' ? Math.max(6, size * 0.12) : 0);

function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function Placeholder({ label, style }: { label: string; style?: CSSProperties }) {
  const hue = hashHue(label);
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <div
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 50) % 360} 70% 35%))`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.9)',
        fontWeight: 800,
        containerType: 'size',
        ...style,
      }}
    >
      <span style={{ fontSize: '38cqmin', lineHeight: 1 }}>{initials || '♪'}</span>
    </div>
  );
}

interface EntityImgProps {
  kind: EntityKind;
  name: string;
  artist: string;
  size?: number; // square size, omit to fill parent
  shape?: ImageShape;
  style?: CSSProperties;
  filter?: string;
  extraZoom?: number;
  focal?: { x: number; y: number };
}

/** Image for an artist/album/track, honoring user overrides (crop focal point + zoom). */
export function EntityImg({ kind, name, artist, size, shape = 'square', style, filter, extraZoom = 1, focal }: EntityImgProps) {
  const img = useEntityImage(kind, name, artist);
  const dim: CSSProperties = size ? { width: size, height: size, flex: `0 0 ${size}px` } : { width: '100%', height: '100%' };
  const radius = shapeRadius(shape, size ?? 200);
  if (!img) return <Placeholder label={kind === 'artist' ? name : name || artist} style={{ ...dim, borderRadius: radius, ...style }} />;
  const zoom = img.zoom * extraZoom;
  const fx = focal && !img.custom ? focal.x : img.x;
  const fy = focal && !img.custom ? focal.y : img.y;
  return (
    <div style={{ ...dim, borderRadius: radius, overflow: 'hidden', position: 'relative', background: 'rgba(127,127,127,0.2)', ...style }}>
      <img
        src={img.src}
        crossOrigin={img.src.startsWith('data:') ? undefined : 'anonymous'}
        alt=""
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${fx}% ${fy}%`,
          transform: zoom !== 1 ? `scale(${zoom})` : undefined,
          transformOrigin: `${fx}% ${fy}%`,
          filter,
          display: 'block',
        }}
      />
    </div>
  );
}

export function Movement({ rank, prevRank, size, up, down, neutral, accent }: { rank: number; prevRank: number | null | undefined; size: number; up: string; down: string; neutral: string; accent: string }) {
  const style: CSSProperties = { fontSize: size, fontWeight: 800, lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: size * 0.15, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  if (prevRank === undefined) return null;
  if (prevRank === null) return <span style={{ ...style, color: accent, fontSize: size * 0.8, letterSpacing: 1 }}>NEW</span>;
  const diff = prevRank - rank;
  if (diff === 0) return <span style={{ ...style, color: neutral }}>=</span>;
  return (
    <span style={{ ...style, color: diff > 0 ? up : down }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 10 10" style={{ transform: diff > 0 ? undefined : 'rotate(180deg)' }}>
        <path d="M5 1 L9.5 8.5 L0.5 8.5 Z" fill="currentColor" />
      </svg>
      {Math.abs(diff)}
    </span>
  );
}

export const GRAIN_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.2 -0.1'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`;

import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import type { Library } from '../lib/library';
import type { Project, Slide, Theme } from '../editor/model';
import { BlockView, type RenderCtx } from './blocks';
import { EntityImg, GRAIN_URL } from './primitives';
import { getStats } from '../lib/library';
import { resolveRange } from '../lib/range';

export function slideTheme(project: Project, slide: Slide): Theme {
  return { ...project.theme, ...(slide.theme ?? {}) };
}

export function backgroundCss(t: Theme): string {
  switch (t.bgType) {
    case 'solid':
      return t.bg1;
    case 'linear':
      return `linear-gradient(${t.angle}deg, ${t.bg1}, ${t.bg2})`;
    case 'radial':
      return `radial-gradient(120% 90% at 25% 15%, ${t.bg2}, ${t.bg1} 75%)`;
    case 'mesh':
      return [
        `radial-gradient(60% 45% at 10% 8%, ${t.bg2} 0%, transparent 70%)`,
        `radial-gradient(55% 40% at 95% 35%, ${t.bg3} 0%, transparent 70%)`,
        `radial-gradient(70% 45% at 30% 100%, ${t.bg2} 0%, transparent 70%)`,
        t.bg1,
      ].join(', ');
  }
}

interface Props {
  lib: Library;
  project: Project;
  slide: Slide;
  username: string;
  children?: ReactNode; // overlay (editor handles)
  style?: CSSProperties;
}

/** A slide rendered at its true pixel size (e.g. 1080×1920). Scale it with CSS outside. */
export const SlideCanvas = forwardRef<HTMLDivElement, Props>(function SlideCanvas({ lib, project, slide, username, children, style }, ref) {
  const theme = slideTheme(project, slide);
  const ctx: RenderCtx = { lib, project, theme, username };
  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: project.format.w,
        height: project.format.h,
        overflow: 'hidden',
        background: backgroundCss(theme),
        color: theme.text,
        fontFamily: "'Inter Variable', system-ui, sans-serif",
        ...style,
      }}
    >
      {(theme.bgImageSource === 'artist' || theme.bgImageSource === 'album') && <AutoBackground lib={lib} project={project} theme={theme} />}
      {theme.bgImage && (theme.bgImageSource ?? 'upload') === 'upload' && (
        <img
          src={theme.bgImage}
          alt=""
          style={{
            position: 'absolute',
            inset: theme.bgImageBlur ? -theme.bgImageBlur * 2 : 0,
            width: theme.bgImageBlur ? `calc(100% + ${theme.bgImageBlur * 4}px)` : '100%',
            height: theme.bgImageBlur ? `calc(100% + ${theme.bgImageBlur * 4}px)` : '100%',
            objectFit: 'cover',
            opacity: theme.bgImageOpacity,
            filter: theme.bgImageBlur ? `blur(${theme.bgImageBlur}px)` : undefined,
          }}
        />
      )}
      {theme.grain > 0 && <div style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN_URL, backgroundSize: '300px 300px', opacity: theme.grain, mixBlendMode: 'overlay', pointerEvents: 'none' }} />}
      {theme.frame && <Frame w={project.format.w} h={project.format.h} color={theme.text} />}
      {slide.blocks.map((b) => (
        <BlockView key={b.id} ctx={ctx} block={b} />
      ))}
      {children}
    </div>
  );
});

/** Your #1 album / artist art, blurred and dimmed behind everything. */
function AutoBackground({ lib, project, theme }: { lib: Library; project: Project; theme: Theme }) {
  const kind = theme.bgImageSource === 'artist' ? 'artist' : 'album';
  const top = getStats(lib, resolveRange(project.range)).top(kind, 1)[0];
  if (!top) return null;
  const bleed = theme.bgImageBlur * 2;
  return (
    <div style={{ position: 'absolute', inset: -bleed, opacity: theme.bgImageOpacity, filter: theme.bgImageBlur ? `blur(${theme.bgImageBlur}px)` : undefined }}>
      <EntityImg kind={kind} name={top.name} artist={top.artist} />
    </div>
  );
}

/** Thin inset frame with corner brackets, in the style of archival review cards. */
function Frame({ w, h, color }: { w: number; h: number; color: string }) {
  const inset = Math.round(Math.min(w, h) * 0.024);
  const arm = Math.round(Math.min(w, h) * 0.03);
  const stroke = Math.max(1.5, Math.min(w, h) / 600);
  const line = { position: 'absolute', background: color } as const;
  const corner = (key: string, style: CSSProperties, rot: number) => (
    <div key={key} style={{ position: 'absolute', width: arm, height: arm, transform: `rotate(${rot}deg)`, opacity: 0.45, ...style }}>
      <div style={{ ...line, left: 0, top: 0, width: '100%', height: stroke }} />
      <div style={{ ...line, left: 0, top: 0, width: stroke, height: '100%' }} />
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      <div style={{ position: 'absolute', inset, border: `${stroke}px solid ${color}`, opacity: 0.14 }} />
      {corner('tl', { left: inset, top: inset }, 0)}
      {corner('tr', { right: inset, top: inset }, 90)}
      {corner('br', { right: inset, bottom: inset }, 180)}
      {corner('bl', { left: inset, bottom: inset }, 270)}
    </div>
  );
}

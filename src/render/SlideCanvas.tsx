import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import type { Library } from '../lib/library';
import type { Project, Slide, Theme } from '../editor/model';
import { BlockView, type RenderCtx } from './blocks';
import { GRAIN_URL } from './primitives';
import { ACCOUNT_BG_KEY, bigAvatar, getOverride, reportBroken, useEntityImage, useImagesVersion, useWorkingPicture } from '../lib/images';
import { useApp } from '../store';
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
      <BackgroundPicture lib={lib} project={project} theme={theme} />
      {theme.grain > 0 && <div style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN_URL, backgroundSize: '300px 300px', opacity: theme.grain, mixBlendMode: 'overlay', pointerEvents: 'none' }} />}
      {theme.frame && <Frame w={project.format.w} h={project.format.h} color={theme.text} />}
      {slide.blocks.map((b) => (
        <BlockView key={b.id} ctx={ctx} block={b} />
      ))}
      {children}
    </div>
  );
});

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


/** The picture a theme's background currently resolves to (any source), or undefined. */
export function useBackgroundSrc(lib: Library, project: Project, theme: Theme): string | undefined {
  useImagesVersion(); // "My picture" / custom images can change or sync in
  const avatar = useApp((st) => st.user?.image);
  const src = theme.bgImageSource;
  const kind = src === 'artist' ? 'artist' : 'album';
  const top = src === 'artist' || src === 'album' ? getStats(lib, resolveRange(project.range)).top(kind, 1)[0] : undefined;
  const auto = useEntityImage(kind, top?.name ?? '', top?.artist ?? '');
  const chosen = src === 'artist' || src === 'album' ? (top ? auto?.src : undefined) : src === 'mine' ? getOverride(ACCOUNT_BG_KEY)?.src : src === 'avatar' ? bigAvatar(avatar) : theme.bgImage;
  // one that doesn't load is left out, so the theme's colours show instead of a broken picture
  return useWorkingPicture(chosen);
}

/** CSS for placing the background picture: focus point + zoom. */
export function bgPlacement(theme: Theme) {
  const x = theme.bgImageX ?? 50;
  const y = theme.bgImageY ?? 50;
  const z = theme.bgImageZoom ?? 1;
  return { objectPosition: `${x}% ${y}%`, transform: z !== 1 ? `scale(${z})` : undefined, transformOrigin: `${x}% ${y}%` };
}

function BackgroundPicture({ lib, project, theme }: { lib: Library; project: Project; theme: Theme }) {
  const src = useBackgroundSrc(lib, project, theme);
  if (!src) return null;
  const blur = theme.bgImageBlur;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: theme.bgImageOpacity }}>
      <img
        src={src}
        alt=""
        crossOrigin={src.startsWith('data:') ? undefined : 'anonymous'}
        onError={() => reportBroken(src)}
        style={{
          position: 'absolute',
          inset: blur ? -blur * 2 : 0,
          width: blur ? `calc(100% + ${blur * 4}px)` : '100%',
          height: blur ? `calc(100% + ${blur * 4}px)` : '100%',
          objectFit: 'cover',
          filter: blur ? `blur(${blur}px)` : undefined,
          ...bgPlacement(theme),
        }}
      />
    </div>
  );
}

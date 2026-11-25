import { reportBroken, useWorkingPicture } from '../lib/images';

/** Your Last.fm profile picture, or your initial when there's none (or it doesn't load). */
export function UserAvatar({ src, name, big }: { src?: string; name: string; big?: boolean }) {
  const ok = useWorkingPicture(src);
  if (ok) return <img src={ok} alt="" onError={() => reportBroken(ok)} />;
  return <span className={big ? 'avatar big' : 'avatar'}>{name[0]?.toUpperCase() ?? '?'}</span>;
}

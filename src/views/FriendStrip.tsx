import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { routePath } from '../router';
import { Placeholder, fmtNum } from '../render/primitives';
import { cachedAllArtists, friendLibrary, historyState, useFriends, type Friend } from '../lib/friends';
import { artistKey } from '../lib/compare';
import { findEntity } from '../lib/library';
import type { EntityKind } from '../lib/types';

export function FriendAvatar({ f, size = 30 }: { f: { name: string; image?: string }; size?: number }) {
  return f.image ? (
    <img className="friend-avatar" src={f.image} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <Placeholder label={f.name} style={{ width: size, height: size, borderRadius: '50%', fontSize: size * 0.4 }} />
  );
}

/** Overview: your friends (tap one for their stats), and the way to the Friends page. */
export function FriendStrip() {
  const demo = useApp((s) => s.demo);
  const list = useFriends((s) => s.list);
  if (demo) return null;
  return (
    <div className="friend-strip">
      <a className="btn small" href={routePath({ name: 'friends' })}>
        ⇄ Friends
      </a>
      {list.slice(0, 6).map((f) => (
        <a key={f.name} className="friend-chip" href={routePath({ name: 'friend', who: f.name })} title={`${f.name}’s stats`}>
          <FriendAvatar f={f} size={26} />
          <span>{f.name}</span>
        </a>
      ))}
    </div>
  );
}

/**
 * On an artist / album / song page: how many times your recent friends have played it. Artists use
 * their all-time top list (fetched when you compared); albums and songs need their full history.
 */
export function VsFriends({ kind, name, artist, mine }: { kind: EntityKind; name: string; artist: string; mine: number }) {
  const list = useFriends((s) => s.list);
  const fixes = useApp((s) => s.albumPrefs.fixes);
  const [rows, setRows] = useState<{ f: Friend; plays: number }[]>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const out: { f: Friend; plays: number }[] = [];
      for (const f of list.slice(0, 5)) {
        if (await historyState(f.name)) {
          const lib = await friendLibrary(f.name, fixes);
          if (!lib) continue;
          const idx = findEntity(lib, kind, name, artist);
          let plays = 0;
          if (idx >= 0) {
            const col = kind === 'artist' ? lib.artist : kind === 'album' ? lib.album : lib.track;
            for (let i = 0; i < lib.n; i++) if (col[i] === idx) plays++;
          }
          out.push({ f, plays });
        } else if (kind === 'artist') {
          const top = await cachedAllArtists(f.name);
          if (!top) continue;
          const k = artistKey(name);
          out.push({ f, plays: top.find((a) => artistKey(a.name) === k)?.plays ?? 0 });
        }
      }
      if (live) setRows(out);
    })();
    return () => {
      live = false;
    };
  }, [list, fixes, kind, name, artist]);
  if (!rows.length) return null;
  return (
    <div className="vs-friends">
      <span className="muted small">All time · you {fmtNum(mine)}</span>
      {rows.map(({ f, plays }) => (
        <a key={f.name} className="friend-chip" href={routePath({ name: 'friend', who: f.name })}>
          <FriendAvatar f={f} size={20} />
          <span>
            {f.name} {plays ? fmtNum(plays) : '—'}
          </span>
        </a>
      ))}
    </div>
  );
}

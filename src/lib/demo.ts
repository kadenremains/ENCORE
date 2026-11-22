import type { StoredScrobble } from './types';

// [artist, album, tracks]
const CATALOG: [string, string, string[]][] = [
  ['Frank Ocean', 'Blonde', ['Nikes', 'Ivy', 'Pink + White', 'Self Control', 'Nights', 'White Ferrari']],
  ['SZA', 'SOS', ['Kill Bill', 'Snooze', 'Good Days', 'Saturn', 'Nobody Gets Me']],
  ['Kendrick Lamar', 'GNX', ['luther', 'squabble up', 'tv off', 'wacced out murals', 'reincarnated']],
  ['Tyler, The Creator', 'CHROMAKOPIA', ['St. Chroma', 'Noid', 'Darling, I', 'Like Him', 'Sticky']],
  ['Radiohead', 'In Rainbows', ['Weird Fishes/Arpeggi', 'Nude', 'Reckoner', 'House of Cards', '15 Step']],
  ['Charli xcx', 'BRAT', ['360', 'Von dutch', 'Apple', 'Sympathy is a knife', 'Guess']],
  ['Mitski', 'Be the Cowboy', ['Nobody', 'Washing Machine Heart', 'Two Slow Dancers', 'Geyser']],
  ['Daft Punk', 'Random Access Memories', ['Get Lucky', 'Instant Crush', 'Touch', 'Giorgio by Moroder']],
  ['Steve Lacy', 'Gemini Rights', ['Bad Habit', 'Static', 'Helmet', 'Mercury']],
  ['Phoebe Bridgers', 'Punisher', ['Kyoto', 'Garden Song', 'I Know the End', 'Motion Sickness']],
  ['Bon Iver', 'For Emma, Forever Ago', ['Skinny Love', 'Re: Stacks', 'Flume', 'Blindsided']],
  ['Tame Impala', 'Currents', ['Let It Happen', 'The Less I Know the Better', 'Eventually', 'New Person, Same Old Mistakes']],
  ['Beyoncé', 'Renaissance', ['CUFF IT', 'ALIEN SUPERSTAR', 'VIRGO\'S GROOVE', 'BREAK MY SOUL']],
  ['Fleetwood Mac', 'Rumours', ['Dreams', 'The Chain', 'Go Your Own Way', 'Songbird']],
  ['Lorde', 'Melodrama', ['Green Light', 'Supercut', 'Liability', 'Writer in the Dark']],
  ['Kanye West', 'My Beautiful Dark Twisted Fantasy', ['Runaway', 'POWER', 'Devil In A New Dress', 'All Of The Lights']],
  ['Clairo', 'Charm', ['Sexy to Someone', 'Juna', 'Add Up My Love', 'Echo']],
  ['Fred again..', 'Actual Life 3', ['Delilah (pull me out of this)', 'Clara (the night is dark)', 'Kammy (like i do)']],
  ['Sabrina Carpenter', 'Short n\' Sweet', ['Espresso', 'Please Please Please', 'Taste', 'Juno']],
  ['The Weeknd', 'After Hours', ['Blinding Lights', 'Save Your Tears', 'After Hours', 'Faith']],
  ['Bjork', 'Homogenic', ['Joga', 'Bachelorette', 'Hunter', 'All Is Full of Love']],
  ['Mac Miller', 'Swimming', ['Self Care', 'Ladders', 'Small Worlds', '2009']],
  ['Chappell Roan', 'The Rise and Fall of a Midwest Princess', ['Good Luck, Babe!', 'Pink Pony Club', 'HOT TO GO!', 'Casual']],
  ['Bladee', 'Eversince', ['Rain', 'Every Moment Special', 'Bluebird', 'Missing Person']],
  ['Kali Uchis', 'Isolation', ['After the Storm', 'Tyrant', 'Dead to Me', 'Feel Like a Fool']],
  ['Arctic Monkeys', 'AM', ['Do I Wanna Know?', 'R U Mine?', '505', 'Arabella']],
  ['Jai Paul', 'Leak 04-13 (Bait Ones)', ['Str8 Outta Mumbai', 'Jasmine', 'BTSTU']],
  ['Caroline Polachek', 'Desire, I Want to Turn Into You', ['Welcome to My Island', 'Bunny Is a Rider', 'Sunset', 'Billions']],
];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemo(): StoredScrobble[] {
  const r = rng(42);
  const now = new Date();
  const start = new Date(now.getFullYear() - 2, 0, 12);
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const hourWeights = [3, 2, 1, 0.5, 0.3, 0.3, 0.8, 2, 4, 5, 5, 5, 6, 6, 5, 5, 6, 7, 8, 9, 9, 8, 7, 5];
  const hourTotal = hourWeights.reduce((a, b) => a + b, 0);
  // every artist gets a base popularity plus a "phase" so the charts move over time
  const artists = CATALOG.map(([name, album, tracks], i) => ({
    name,
    album,
    tracks,
    base: 1 / (i + 1.5) ** 0.85,
    phase: r() * Math.PI * 2,
    period: 120 + r() * 400,
    trackW: tracks.map(() => 0.3 + r() ** 2 * 3),
  }));
  const out: StoredScrobble[] = [];
  for (let d = 0; d <= days; d++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
    const weekday = date.getDay();
    let n = Math.round((weekday === 0 || weekday === 6 ? 38 : 50) * (0.4 + r() * 1.2));
    if (r() < 0.06) n = 0;
    if (r() < 0.03) n *= 3;
    const weights = artists.map((a) => a.base * (1.2 + Math.sin(d / a.period * Math.PI * 2 + a.phase)) ** 2);
    const wTotal = weights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < n; k++) {
      let x = r() * wTotal;
      let ai = 0;
      while (x > weights[ai] && ai < weights.length - 1) x -= weights[ai++];
      const a = artists[ai];
      const tt = a.trackW.reduce((s, v) => s + v, 0);
      let y = r() * tt;
      let ti = 0;
      while (y > a.trackW[ti] && ti < a.tracks.length - 1) y -= a.trackW[ti++];
      let h = r() * hourTotal;
      let hour = 0;
      while (h > hourWeights[hour] && hour < 23) h -= hourWeights[hour++];
      const ts = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, Math.floor(r() * 60), Math.floor(r() * 60)).getTime() / 1000);
      if (ts * 1000 > now.getTime()) continue;
      out.push({ ts, ar: a.name, al: a.album, tr: a.tracks[ti] });
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

import type { StoredScrobble } from './types';

/**
 * Demo listening history from January 2012 to today: real albums with their real release dates
 * (nothing is played before it came out), so the artwork lookups find the right covers.
 * Taste drifts over the years, new releases get a burst of plays when they drop, there are a
 * couple of long breaks (for "skip breaks") and a few standalone singles (for the singles setting).
 */
interface Release {
  album: string;
  released: string; // yyyy-mm-dd
  tracks: string[]; // biggest songs first
}
interface Artist {
  name: string;
  /** how much this listener likes them (relative) */
  love: number;
  /** when this listener found them (yyyy-mm); never before their first release */
  since?: string;
  releases: Release[];
}

const CATALOG: Artist[] = [
  {
    name: 'Frank Ocean',
    love: 2.6,
    releases: [
      { album: 'channel ORANGE', released: '2012-07-10', tracks: ['Thinkin Bout You', 'Pyramids', 'Super Rich Kids', 'Lost', 'Sweet Life', 'Bad Religion', 'Pink Matter'] },
      { album: 'Blonde', released: '2016-08-20', tracks: ['Nikes', 'Ivy', 'Pink + White', 'Self Control', 'Nights', 'White Ferrari', 'Solo'] },
      { album: 'Chanel', released: '2017-03-10', tracks: ['Chanel'] },
    ],
  },
  {
    name: 'Kendrick Lamar',
    love: 2.0,
    releases: [
      { album: 'good kid, m.A.A.d city', released: '2012-10-22', tracks: ['Money Trees', 'Swimming Pools (Drank)', 'Bitch, Don’t Kill My Vibe', 'Backseat Freestyle', 'Poetic Justice', 'm.A.A.d city'] },
      { album: 'To Pimp a Butterfly', released: '2015-03-15', tracks: ['Alright', 'King Kunta', 'These Walls', 'i', 'The Blacker the Berry'] },
      { album: 'DAMN.', released: '2017-04-14', tracks: ['HUMBLE.', 'DNA.', 'LOVE.', 'LOYALTY.', 'ELEMENT.'] },
      { album: 'Mr. Morale & The Big Steppers', released: '2022-05-13', tracks: ['N95', 'Die Hard', 'Count Me Out', 'Rich Spirit', 'United In Grief'] },
      { album: 'GNX', released: '2024-11-22', tracks: ['luther', 'squabble up', 'tv off', 'wacced out murals', 'reincarnated'] },
    ],
  },
  {
    name: 'Tame Impala',
    love: 1.6,
    releases: [
      { album: 'Lonerism', released: '2012-10-05', tracks: ['Feels Like We Only Go Backwards', 'Elephant', 'Mind Mischief', 'Apocalypse Dreams'] },
      { album: 'Currents', released: '2015-07-17', tracks: ['The Less I Know the Better', 'Let It Happen', 'Eventually', 'New Person, Same Old Mistakes'] },
      { album: 'The Slow Rush', released: '2020-02-14', tracks: ['Borderline', 'Lost in Yesterday', 'Breathe Deeper'] },
    ],
  },
  {
    name: 'Arctic Monkeys',
    love: 1.5,
    releases: [
      { album: 'Favourite Worst Nightmare', released: '2007-04-23', tracks: ['505', 'Fluorescent Adolescent', 'Brianstorm'] },
      { album: 'AM', released: '2013-09-09', tracks: ['Do I Wanna Know?', 'R U Mine?', 'Why’d You Only Call Me When You’re High?', 'Arabella', 'I Wanna Be Yours', 'Snap Out of It'] },
      { album: 'Tranquility Base Hotel & Casino', released: '2018-05-11', tracks: ['Four Out of Five', 'Star Treatment'] },
    ],
  },
  {
    name: 'Lana Del Rey',
    love: 1.4,
    releases: [
      { album: 'Born to Die', released: '2012-01-27', tracks: ['Video Games', 'Summertime Sadness', 'Born to Die', 'Blue Jeans', 'National Anthem'] },
      { album: 'Norman Fucking Rockwell!', released: '2019-08-30', tracks: ['Mariners Apartment Complex', 'Venice Bitch', 'Norman fucking Rockwell', 'Doin’ Time'] },
      { album: 'Did you know that there’s a tunnel under Ocean Blvd', released: '2023-03-24', tracks: ['A&W', 'Kintsugi', 'The Grants'] },
    ],
  },
  {
    name: 'Kanye West',
    love: 1.3,
    releases: [
      { album: 'My Beautiful Dark Twisted Fantasy', released: '2010-11-22', tracks: ['Runaway', 'POWER', 'Devil In A New Dress', 'All Of The Lights'] },
      { album: 'Yeezus', released: '2013-06-18', tracks: ['Black Skinhead', 'Bound 2', 'Blood On The Leaves'] },
      { album: 'The Life of Pablo', released: '2016-02-14', tracks: ['Ultralight Beam', 'Father Stretch My Hands Pt. 1', 'Real Friends', 'Famous'] },
    ],
  },
  {
    name: 'The Weeknd',
    love: 1.2,
    releases: [
      { album: 'Kiss Land', released: '2013-09-10', tracks: ['Kiss Land', 'Belong to the World', 'Wanderlust'] },
      { album: 'Beauty Behind the Madness', released: '2015-08-28', tracks: ['The Hills', 'Can’t Feel My Face', 'Often'] },
      { album: 'Starboy', released: '2016-11-25', tracks: ['Starboy', 'I Feel It Coming', 'Party Monster', 'Die For You'] },
      { album: 'After Hours', released: '2020-03-20', tracks: ['Blinding Lights', 'Save Your Tears', 'After Hours', 'Faith'] },
    ],
  },
  {
    name: 'Radiohead',
    love: 1.1,
    releases: [
      { album: 'OK Computer', released: '1997-05-21', tracks: ['Karma Police', 'Paranoid Android', 'No Surprises', 'Let Down'] },
      { album: 'In Rainbows', released: '2007-10-10', tracks: ['Weird Fishes/Arpeggi', 'Nude', 'Reckoner', 'House of Cards', '15 Step'] },
      { album: 'A Moon Shaped Pool', released: '2016-05-08', tracks: ['Daydreaming', 'True Love Waits', 'Burn the Witch', 'Present Tense'] },
    ],
  },
  {
    name: 'Daft Punk',
    love: 0.9,
    releases: [
      { album: 'Discovery', released: '2001-03-12', tracks: ['One More Time', 'Digital Love', 'Harder, Better, Faster, Stronger'] },
      { album: 'Random Access Memories', released: '2013-05-17', tracks: ['Get Lucky', 'Instant Crush', 'Touch', 'Giorgio by Moroder', 'Lose Yourself to Dance'] },
    ],
  },
  {
    name: 'Bon Iver',
    love: 0.9,
    releases: [
      { album: 'For Emma, Forever Ago', released: '2008-02-19', tracks: ['Skinny Love', 'Re: Stacks', 'Flume', 'Blindsided'] },
      { album: 'Bon Iver, Bon Iver', released: '2011-06-17', tracks: ['Holocene', 'Perth', 'Towers'] },
      { album: '22, A Million', released: '2016-09-30', tracks: ['8 (circle)', '33 “GOD”', '29 #Strafford APTS'] },
    ],
  },
  {
    name: 'Fleetwood Mac',
    love: 0.8,
    releases: [{ album: 'Rumours', released: '1977-02-04', tracks: ['Dreams', 'The Chain', 'Go Your Own Way', 'Songbird', 'Never Going Back Again'] }],
  },
  {
    name: 'Björk',
    love: 0.6,
    releases: [
      { album: 'Homogenic', released: '1997-09-22', tracks: ['Jóga', 'Bachelorette', 'Hunter', 'All Is Full of Love'] },
      { album: 'Vespertine', released: '2001-08-27', tracks: ['Hidden Place', 'Pagan Poetry', 'Cocoon'] },
    ],
  },
  {
    name: 'Mac Miller',
    love: 1.3,
    since: '2013-06',
    releases: [
      { album: 'Watching Movies with the Sound Off', released: '2013-06-18', tracks: ['S.D.S.', 'Objects in the Mirror', 'Watching Movies'] },
      { album: 'The Divine Feminine', released: '2016-09-16', tracks: ['Dang!', 'Stay', 'My Favorite Part'] },
      { album: 'Swimming', released: '2018-08-03', tracks: ['Self Care', 'Ladders', 'Small Worlds', '2009'] },
      { album: 'Circles', released: '2020-01-17', tracks: ['Good News', 'Blue World', 'Circles'] },
    ],
  },
  {
    name: 'Lorde',
    love: 1.2,
    releases: [
      { album: 'Pure Heroine', released: '2013-09-27', tracks: ['Royals', 'Tennis Court', 'Team', 'Ribs', '400 Lux'] },
      { album: 'Melodrama', released: '2017-06-16', tracks: ['Green Light', 'Supercut', 'Liability', 'Writer in the Dark', 'Perfect Places'] },
      { album: 'Virgin', released: '2025-06-27', tracks: ['What Was That', 'Man of the Year', 'Hammer'] },
    ],
  },
  {
    name: 'Childish Gambino',
    love: 0.9,
    releases: [
      { album: 'Because the Internet', released: '2013-12-10', tracks: ['3005', 'Sweatpants', 'Telegraph Ave. ("Oakland" by Lloyd)'] },
      { album: '"Awaken, My Love!"', released: '2016-12-02', tracks: ['Redbone', 'Me and Your Mama', 'Terrified'] },
    ],
  },
  {
    name: 'Beyoncé',
    love: 1.1,
    releases: [
      { album: 'BEYONCÉ', released: '2013-12-13', tracks: ['Drunk in Love', 'Partition', 'XO', 'Pretty Hurts'] },
      { album: 'Lemonade', released: '2016-04-23', tracks: ['Formation', 'Hold Up', 'Sorry', 'All Night'] },
      { album: 'RENAISSANCE', released: '2022-07-29', tracks: ['CUFF IT', 'ALIEN SUPERSTAR', 'VIRGO’S GROOVE', 'BREAK MY SOUL'] },
      { album: 'COWBOY CARTER', released: '2024-03-29', tracks: ['TEXAS HOLD ’EM', 'II MOST WANTED', '16 CARRIAGES'] },
    ],
  },
  {
    name: 'Charli xcx',
    love: 1.2,
    since: '2014-08',
    releases: [
      { album: 'SUCKER', released: '2014-12-15', tracks: ['Boom Clap', 'Break the Rules', 'Doing It'] },
      { album: 'how i’m feeling now', released: '2020-05-15', tracks: ['claws', 'forever', 'anthems'] },
      { album: 'BRAT', released: '2024-06-07', tracks: ['360', 'Von dutch', 'Apple', 'Sympathy is a knife', 'Club classics', 'B2b'] },
    ],
  },
  {
    name: 'Tyler, The Creator',
    love: 2.0,
    since: '2015-01',
    releases: [
      { album: 'Wolf', released: '2013-04-02', tracks: ['IFHY', 'Answer', 'Treehome95'] },
      { album: 'Flower Boy', released: '2017-07-21', tracks: ['See You Again', 'Who Dat Boy', '911 / Mr. Lonely', 'Boredom', 'Glitter'] },
      { album: 'IGOR', released: '2019-05-17', tracks: ['EARFQUAKE', 'A BOY IS A GUN*', 'NEW MAGIC WAND', 'I THINK', 'RUNNING OUT OF TIME'] },
      { album: 'CALL ME IF YOU GET LOST', released: '2021-06-25', tracks: ['WUSYANAME', 'LUMBERJACK', 'SWEET / I THOUGHT YOU WANTED TO DANCE', 'RUNITUP'] },
      { album: 'CHROMAKOPIA', released: '2024-10-28', tracks: ['St. Chroma', 'Noid', 'Darling, I', 'Like Him', 'Sticky'] },
    ],
  },
  {
    name: 'Mitski',
    love: 1.3,
    since: '2016-07',
    releases: [
      { album: 'Puberty 2', released: '2016-06-17', tracks: ['Your Best American Girl', 'Happy', 'Once More to See You'] },
      { album: 'Be the Cowboy', released: '2018-08-17', tracks: ['Nobody', 'Washing Machine Heart', 'Two Slow Dancers', 'Geyser'] },
      { album: 'The Land Is Inhospitable and So Are We', released: '2023-09-15', tracks: ['My Love Mine All Mine', 'Bug Like an Angel', 'Heaven'] },
    ],
  },
  {
    name: 'SZA',
    love: 2.2,
    releases: [
      { album: 'Ctrl', released: '2017-06-09', tracks: ['Love Galore', 'The Weekend', 'Broken Clocks', 'Supermodel', 'Drew Barrymore', 'Garden (Say It Like Dat)'] },
      { album: 'SOS', released: '2022-12-09', tracks: ['Kill Bill', 'Snooze', 'Good Days', 'Nobody Gets Me', 'Shirt', 'Low', 'Blind'] },
      { album: 'SOS Deluxe: LANA', released: '2024-12-20', tracks: ['Saturn', '30 for 30', 'Drive'] },
    ],
  },
  {
    name: 'Phoebe Bridgers',
    love: 1.1,
    since: '2018-02',
    releases: [
      { album: 'Stranger in the Alps', released: '2017-09-22', tracks: ['Motion Sickness', 'Funeral', 'Scott Street'] },
      { album: 'Punisher', released: '2020-06-18', tracks: ['Kyoto', 'Garden Song', 'I Know the End', 'Moon Song'] },
    ],
  },
  {
    name: 'Kali Uchis',
    love: 1.0,
    releases: [
      { album: 'Isolation', released: '2018-04-06', tracks: ['After the Storm', 'Tyrant', 'Dead to Me', 'Feel Like a Fool'] },
      { album: 'Sin Miedo (del Amor y Otros Demonios) ∞', released: '2020-11-18', tracks: ['telepatía', 'fue mejor'] },
      { album: 'Red Moon in Venus', released: '2023-03-03', tracks: ['Moonlight', 'I Wish you Roses', 'Fantasy'] },
    ],
  },
  {
    name: 'Steve Lacy',
    love: 1.0,
    releases: [
      { album: 'Dark Red', released: '2017-02-20', tracks: ['Dark Red'] },
      { album: 'Apollo XXI', released: '2019-05-24', tracks: ['Playground', 'N Side', 'Like Me'] },
      { album: 'Gemini Rights', released: '2022-07-15', tracks: ['Bad Habit', 'Static', 'Helmet', 'Mercury'] },
    ],
  },
  {
    name: 'Clairo',
    love: 1.0,
    releases: [
      { album: 'Immunity', released: '2019-08-02', tracks: ['Bags', 'Sofia', 'North'] },
      { album: 'Sling', released: '2021-07-16', tracks: ['Blouse', 'Amoeba'] },
      { album: 'Charm', released: '2024-07-12', tracks: ['Sexy to Someone', 'Juna', 'Add Up My Love', 'Echo'] },
    ],
  },
  {
    name: 'Caroline Polachek',
    love: 0.8,
    releases: [
      { album: 'Pang', released: '2019-10-18', tracks: ['So Hot You’re Hurting My Feelings', 'Door', 'Pang'] },
      { album: 'Desire, I Want to Turn Into You', released: '2023-02-14', tracks: ['Welcome to My Island', 'Bunny Is a Rider', 'Sunset', 'Billions'] },
    ],
  },
  {
    name: 'Jai Paul',
    love: 0.6,
    releases: [{ album: 'Leak 04-13 (Bait Ones)', released: '2019-06-01', tracks: ['Str8 Outta Mumbai', 'Jasmine (Demo)', 'BTSTU (Demo)'] }],
  },
  {
    name: 'Fred again..',
    love: 1.0,
    releases: [
      { album: 'Actual Life (April 14 - December 17 2020)', released: '2021-04-16', tracks: ['Marea (we’ve lost dancing)', 'Kyle (i found you)'] },
      { album: 'Actual Life 3 (January 1 - September 9 2022)', released: '2022-10-28', tracks: ['Delilah (pull me out of this)', 'Clara (the night is dark)', 'Kammy (like i do)'] },
      { album: 'ten days', released: '2024-09-06', tracks: ['places to be', 'adore u', 'ten'] },
    ],
  },
  {
    name: 'Chappell Roan',
    love: 1.4,
    releases: [
      { album: 'The Rise and Fall of a Midwest Princess', released: '2023-09-22', tracks: ['Pink Pony Club', 'HOT TO GO!', 'Casual', 'Red Wine Supernova', 'Femininomenon'] },
      { album: 'Good Luck, Babe!', released: '2024-04-05', tracks: ['Good Luck, Babe!'] },
    ],
  },
  {
    name: 'Sabrina Carpenter',
    love: 1.1,
    since: '2024-04',
    releases: [
      { album: 'emails i can’t send', released: '2022-07-15', tracks: ['Nonsense', 'because i liked a boy', 'Fast Times'] },
      { album: 'Short n’ Sweet', released: '2024-08-23', tracks: ['Espresso', 'Please Please Please', 'Taste', 'Juno'] },
    ],
  },
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

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
};

/** Weighted pick: index into `w` for a random `x` in [0, sum of w). */
function pick(w: number[], x: number) {
  let i = 0;
  while (x > w[i] && i < w.length - 1) x -= w[i++];
  return i;
}

const START = new Date(2012, 0, 9);
// two long stretches away from music (for the "skip breaks" setting)
const BREAKS: [string, string][] = [
  ['2015-06-14', '2015-07-26'],
  ['2019-08-03', '2019-09-15'],
];
const HOURS = [3, 2, 1, 0.5, 0.3, 0.3, 0.8, 2, 4, 5, 5, 5, 6, 6, 5, 5, 6, 7, 8, 9, 9, 8, 7, 5];

export function generateDemo(): StoredScrobble[] {
  const r = rng(2012);
  const now = Date.now();
  const nowDate = new Date();
  const totalDays = Math.floor((nowDate.getTime() - START.getTime()) / 86400000);
  const hourTotal = HOURS.reduce((a, b) => a + b, 0);
  const breaks = BREAKS.map(([a, b]) => [day(a), day(b)]);

  const artists = CATALOG.map((a) => {
    const first = Math.min(...a.releases.map((x) => day(x.released)));
    return {
      ...a,
      from: Math.max(first, a.since ? day(`${a.since}-01`) : 0),
      phase: r() * Math.PI * 2,
      period: 300 + r() * 900, // days per swing in how much they're played
      releases: a.releases.map((x) => ({ ...x, at: day(x.released), trackW: x.tracks.map((_, i) => 1 / (i + 1) ** 0.7 * (0.6 + r() * 0.8)) })),
    };
  });

  const out: StoredScrobble[] = [];
  for (let d = 0; d <= totalDays; d++) {
    const date = new Date(START.getFullYear(), START.getMonth(), START.getDate() + d);
    const t0 = date.getTime();
    if (breaks.some(([a, b]) => t0 >= a && t0 <= b)) continue;
    // listening grows over the years: ~14 a day in 2012 to ~45 now
    const years = d / 365;
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    let n = Math.round((14 + years * 2.3) * (weekend ? 0.8 : 1) * (0.4 + r() * 1.2));
    if (r() < 0.05) n = 0;
    if (r() < 0.03) n = Math.round(n * 2.6);
    if (!n) continue;

    // who's in rotation today: affection x a slow swing x a burst after new releases
    const albumW: { a: number; r: number; w: number }[] = [];
    for (let ai = 0; ai < artists.length; ai++) {
      const a = artists[ai];
      if (t0 < a.from) continue;
      const swing = (1.15 + Math.sin((d / a.period) * Math.PI * 2 + a.phase)) ** 2;
      for (let ri = 0; ri < a.releases.length; ri++) {
        const rel = a.releases[ri];
        if (t0 < rel.at) continue;
        const age = (t0 - rel.at) / 86400000;
        const burst = age < 150 ? 1 + 5 * Math.exp(-age / 35) : 1;
        // older records fade to a steady "classic" level
        const fade = 0.35 + 0.65 * Math.exp(-Math.max(0, age) / 900);
        const single = rel.tracks.length === 1 ? 0.35 : 1;
        albumW.push({ a: ai, r: ri, w: a.love * swing * burst * fade * single });
      }
    }
    if (!albumW.length) continue;
    const weights = albumW.map((x) => x.w);
    const wTotal = weights.reduce((s, v) => s + v, 0);

    for (let k = 0; k < n; k++) {
      const choice = albumW[pick(weights, r() * wTotal)];
      const a = artists[choice.a];
      const rel = a.releases[choice.r];
      const tt = rel.trackW.reduce((s, v) => s + v, 0);
      const ti = pick(rel.trackW, r() * tt);
      const hour = pick(HOURS, r() * hourTotal);
      const ts = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, Math.floor(r() * 60), Math.floor(r() * 60)).getTime() / 1000);
      if (ts * 1000 > now) continue;
      out.push({ ts, ar: a.name, al: rel.album, tr: rel.tracks[ti] });
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

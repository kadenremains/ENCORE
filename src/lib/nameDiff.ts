/**
 * What sets two nearly identical names apart ("trompe l’oeil" / "Trompe l'oeil"), for Clean up to
 * point out: a curly apostrophe or a capital letter is easy to miss.
 */

export interface NameDiff {
  /** `b`, cut into runs that are the same as in `a` or differ, and markers where something of `a`'s is missing */
  parts: ({ text: string; differs: boolean } | { missing: string })[];
  /** the kinds of difference, in words: "capitals", "curly apostrophe, not straight", … */
  kinds: string[];
}

const APOSTROPHES = "'‘’‛`´′";
const QUOTES = '"“”„″';
const DASHES = '-‐‑‒–—―−';
/** these look alike in most fonts, so they're named in words */
const NAMES: Record<string, string> = {
  "'": 'straight apostrophe',
  '‘': 'curly apostrophe',
  '’': 'curly apostrophe',
  '‛': 'reversed apostrophe',
  '`': 'backtick',
  '´': 'accent mark',
  '′': 'prime mark',
  '"': 'straight quotes',
  '“': 'curly quotes',
  '”': 'curly quotes',
  '„': 'low quotes',
  '″': 'double prime',
  '-': 'hyphen',
  '‐': 'hyphen',
  '‑': 'hyphen',
  '‒': 'figure dash',
  '–': 'en dash',
  '—': 'em dash',
  '―': 'bar',
  '−': 'minus sign',
  '.': 'period',
  ',': 'comma',
};
const named = (c: string) => NAMES[c] ?? c;
const base = (c: string) => c.normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** What changing `x` (in a) into `y` (in b) is, in words. */
function kindOf(x: string | null, y: string | null): string {
  if (x !== null && y !== null) {
    if (x.toLowerCase() === y.toLowerCase()) return 'capitals';
    const alike = (set: string) => set.includes(x) && set.includes(y);
    if (alike(APOSTROPHES) || alike(QUOTES) || alike(DASHES)) {
      const [here, there] = [named(y), named(x)];
      if (here === there) return 'punctuation';
      // "straight apostrophe, not curly"; "hyphen, not en dash"
      const noun = (n: string) => n.split(' ').pop();
      return noun(here) === noun(there) ? `${here}, not ${there.split(' ')[0]}` : `${here}, not ${there}`;
    }
    if (base(x).toLowerCase() === base(y).toLowerCase()) return 'accent';
    return 'spelling';
  }
  const c = (x ?? y)!;
  if (/\s/.test(c)) return 'spacing';
  if (/[\p{P}\p{S}]/u.test(c)) return x !== null ? `no ${named(c)}` : `extra ${named(c)}`;
  return 'spelling';
}

/**
 * How `b` differs from `a`, character by character. Null when they're the same, or when they differ
 * by more than a few characters besides capitals (then it's a different name, not a look-alike, and
 * highlighting would just be noise).
 */
export function nameDiff(a: string, b: string, most = 4): NameDiff | null {
  if (a === b) return null;
  const x = Array.from(a);
  const y = Array.from(b);
  if (Math.abs(x.length - y.length) > most || x.length > 300 || y.length > 300) return null;
  // longest common subsequence (letters matched ignoring capitals, so a capital doesn't count as a
  // change of letter), then walk it back into same / removed / added
  const n = x.length;
  const m = y.length;
  const lx = x.map((c) => c.toLowerCase());
  const ly = y.map((c) => c.toLowerCase());
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = lx[i] === ly[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  type Op = { op: 'same' | 'case' | 'del' | 'add'; c: string };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && lx[i] === ly[j]) {
      ops.push({ op: x[i] === y[j] ? 'same' : 'case', c: y[j] });
      i++;
      j++;
    } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) ops.push({ op: 'add', c: y[j++] });
    else ops.push({ op: 'del', c: x[i++] });
  }
  const changed = ops.filter((o) => o.op === 'add' || o.op === 'del').length;
  if (changed > most * 2 || ops.every((o) => o.op === 'same')) return null;

  // runs of b, and what each difference is (a removed character next to an added one is a swap)
  const parts: NameDiff['parts'] = [];
  const kinds = new Set<string>();
  const push = (text: string, differs: boolean) => {
    const last = parts[parts.length - 1];
    if (last && 'text' in last && last.differs === differs) last.text += text;
    else parts.push({ text, differs });
  };
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    if (o.op === 'same') push(o.c, false);
    else if (o.op === 'case') {
      kinds.add('capitals');
      push(o.c, true);
    } else if (o.op === 'del' && ops[k + 1]?.op === 'add') {
      kinds.add(kindOf(o.c, ops[k + 1].c));
      push(ops[k + 1].c, true);
      k++;
    } else if (o.op === 'add' && ops[k + 1]?.op === 'del') {
      kinds.add(kindOf(ops[k + 1].c, o.c));
      push(o.c, true);
      k++;
    } else if (o.op === 'add') {
      kinds.add(kindOf(null, o.c));
      push(o.c, true);
    } else {
      kinds.add(kindOf(o.c, null));
      parts.push({ missing: o.c });
    }
  }
  return { parts, kinds: [...kinds] };
}

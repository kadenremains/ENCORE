import { useApp } from '../store';
import { rangeLabel, resolveRange } from './range';
import { fetchFriendInfo, friendLibrary, historyState, markViewed, quickLists } from './friends';
import { PERIOD_LABEL, compare, nearestPeriod, sideFromLibrary, sideFromTop, type Comparison, type Side } from './compare';
import type { RangeSpec, UserInfo } from './types';

export interface ComparisonResult {
  cmp: Comparison;
  me: Side;
  them: Side;
  /** from their full history (exact range) or Last.fm's top lists (nearest period) */
  full: boolean;
  note: string;
  info: UserInfo;
}

/**
 * Compare you with someone for a range: their downloaded history if there is one (exact), else
 * Last.fm's top lists for the nearest period. Used by the Compare page and "You vs." wrappeds.
 */
export async function runComparison(name: string, spec: RangeSpec): Promise<ComparisonResult> {
  const { lib, user, username, apiKey, albumPrefs } = useApp.getState();
  if (!lib) throw new Error('Your history isn’t loaded yet.');
  const info = await fetchFriendInfo(name, apiKey);
  const range = resolveRange(spec);
  const label = rangeLabel(spec, range, lib.n ? lib.ts[0] : undefined);
  const myName = user?.name ?? username;
  let result: ComparisonResult;
  const hist = await historyState(info.name);
  const theirLib = hist ? await friendLibrary(info.name, albumPrefs.fixes) : null;
  if (theirLib) {
    const me = sideFromLibrary(lib, range, myName, user?.image);
    const them = sideFromLibrary(theirLib, range, info.name, info.image);
    result = { cmp: compare(me, them), me, them, full: true, note: label, info };
  } else {
    const p = nearestPeriod(range);
    const q = await quickLists(info.name, p.period, apiKey);
    const me = sideFromLibrary(lib, p.window, myName, user?.image);
    const them = sideFromTop(info.name, q, info.image);
    result = { cmp: compare(me, them), me, them, full: false, note: p.exact ? PERIOD_LABEL[p.period] : `${PERIOD_LABEL[p.period]} (Last.fm’s nearest to ${label})`, info };
  }
  await markViewed(info.name);
  return result;
}

import { create } from 'zustand';
import { getPrefs, setPrefs } from './prefs';

/**
 * First-run "pick your look". Shown once per browser; a signed-in account remembers the choice
 * in its synced settings, so it never shows again on that account's other devices.
 */
const KEY = 'sw.lookChosen';
let chosenThisVisit = false; // if the browser won't let us store anything, at least once per visit

function chosenHere() {
  try {
    return localStorage.getItem(KEY) === '1' || chosenThisVisit;
  } catch {
    return chosenThisVisit;
  }
}

export const useLook = create<{ chosen: boolean; accountChecked: boolean }>(() => ({ chosen: false, accountChecked: false }));

/** Call once at startup (before anything else writes to storage). */
export function initLook() {
  try {
    // browsers that used Encore before the picker existed already have their look
    if (localStorage.getItem('sw.lookInit') === null) {
      if (localStorage.getItem('sw.username') || localStorage.getItem('sw.demo') === '1') localStorage.setItem(KEY, '1');
      localStorage.setItem('sw.lookInit', '1');
    }
  } catch {
    /* storage blocked */
  }
  useLook.setState({ chosen: chosenHere() || getPrefs().lookChosen });
}

/** The look is settled: picked here, or the signed-in account already has one. */
export function markLookChosen(fromAccount = false) {
  chosenThisVisit = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage blocked */
  }
  useLook.setState({ chosen: true });
  if (!fromAccount && !getPrefs().lookChosen) setPrefs({ lookChosen: true });
}

/** For signed-in browsers: we've heard back from the account (or given up waiting). */
export function lookAccountChecked() {
  useLook.setState({ accountChecked: true });
}

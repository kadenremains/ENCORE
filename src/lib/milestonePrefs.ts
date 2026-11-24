import { bumpSettings } from './changes';

/** Records → Milestones: which play counts count, and whose. Synced with your settings. */
export interface MilestonePrefs {
  step: string;
  custom: number;
  artist: string;
  order: 'newest' | 'oldest';
}

export const MILESTONE_KEY = 'sw.milestones';

export const STEP_OPTIONS: { value: string; label: string }[] = [
  { value: 'classic', label: 'Classic (1, 100, 1K, 5K, 10K…)' },
  { value: '100', label: 'Every 100' },
  { value: '500', label: 'Every 500' },
  { value: '1000', label: 'Every 1,000' },
  { value: '5000', label: 'Every 5,000' },
  { value: '10000', label: 'Every 10,000' },
  { value: '25000', label: 'Every 25,000' },
  { value: '50000', label: 'Every 50,000' },
  { value: '100000', label: 'Every 100,000' },
  { value: 'custom', label: 'Custom interval…' },
];

const DEFAULTS: MilestonePrefs = { step: 'classic', custom: 2000, artist: '', order: 'newest' };

export function loadMilestonePrefs(): MilestonePrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(MILESTONE_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveMilestonePrefs(p: MilestonePrefs) {
  try {
    localStorage.setItem(MILESTONE_KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
  bumpSettings();
}

import { DEFAULT_MODE, saveKey } from './modes.js';

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const dayBefore = (d, n = 1) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);

export function playedDays(history = []) {
  return new Set(history.map((h) => h.day).filter(Boolean));
}

export function currentStreak(history = [], nocount = {}, today = new Date()) {
  const days = playedDays(history);
  let d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(dayKey(d))) d = dayBefore(d);
  let n = 0;
  while (days.has(dayKey(d)) || nocount[dayKey(d)]) {
    if (days.has(dayKey(d))) n += 1;
    d = dayBefore(d);
  }
  return n;
}

export function bestStreak(history = [], nocount = {}) {
  const played = playedDays(history);
  const allDays = [...new Set([...played, ...Object.keys(nocount)])].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of allDays) {
    const t = new Date(`${d}T12:00:00`);
    if (!(prev && (t - prev) / 864e5 < 1.5)) run = 0;
    if (played.has(d)) run += 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

export function hammerOffer(calendar = {}, history = [], today = new Date()) {
  const hammers = calendar.hammers || 0;
  const todayStr = dayKey(today);
  if (hammers <= 0 || calendar.asked === todayStr) return null;

  const played = playedDays(history);
  const nc = calendar.nocount || {};
  if (played.has(todayStr)) return null;

  // Find missed days in the last 7 days
  const missed = [];
  let d = dayBefore(today);
  for (let i = 1; i <= 7; i++) {
    const key = dayKey(d);
    if (played.has(key)) break;
    if (!nc[key]) missed.push(key);
    d = dayBefore(d);
  }

  // Must have a played day before the gap
  const lastPlayed = dayKey(d);
  if (!played.has(lastPlayed)) return null;
  if (missed.length === 0 || missed.length > hammers) return null;

  return {
    missed: missed.reverse(),
    hammersNeeded: missed.length,
  };
}

// Asking once suppresses repeat prompts, but does not revoke the offered repair.
// Revalidate the exact dates on confirmation so a stale offer cannot spend items.
export function useHammer(calendar, history, missed, today = new Date()) {
  if (!Array.isArray(missed) || !missed.length) return false;
  const offer = hammerOffer({ ...calendar, asked: null }, history, today);
  if (!offer || missed.length !== offer.missed.length || missed.some((day, i) => day !== offer.missed[i])) return false;
  calendar.nocount = calendar.nocount || {};
  offer.missed.forEach(day => { calendar.nocount[day] = true; });
  calendar.hammers -= offer.hammersNeeded;
  calendar.asked = dayKey(today);
  return true;
}

export function freshSave(mode = DEFAULT_MODE) {
  const today = dayKey();
  return {
    version: mode.version,
    recommended: null,
    learned: [],
    review: [],
    rounds: 0,
    settings: { sound: true, motion: true, volume: 0.8 },
    history: [],
    calendar: {
      hammers: 1,
      nocount: {},
      asked: null,
    },
    quests: {
      day: today,
      list: [],
      rewarded: false,
      doneDays: {},
    },
    stats: {
      problems: 0,
      firstTry: 0,
      misses: 0,
      perfects: 0,
      maxCombo: 0,
      reviewSolved: 0,
      playMs: 0,
      flags: {},
    },
    bonus: {
      last: null,
      run: 0,
      stickers: {},
      total: 0,
    },
    trophies: {
      got: {},
    },
  };
}

export function loadSave(storage, mode = DEFAULT_MODE) {
  const base = freshSave(mode);
  try {
    const raw = storage?.getItem(saveKey(mode));
    if (!raw) return base;
    const value = JSON.parse(raw);
    if (value?.version !== mode.version) return base;

    const known = new Set(mode.questions.map((q) => q.id));
    for (const key of ['learned', 'review']) {
      base[key] = [...new Set((Array.isArray(value[key]) ? value[key] : []).filter((id) => known.has(id)))];
    }
    base.recommended = mode.levels.some((l) => l.id === value.recommended) ? value.recommended : null;
    base.rounds = Number.isSafeInteger(value.rounds) && value.rounds >= 0 ? value.rounds : 0;

    if (typeof value.settings?.sound === 'boolean') base.settings.sound = value.settings.sound;
    if (typeof value.settings?.motion === 'boolean') {
      base.settings.motion = value.settings.motion;
    } else if (typeof value.settings?.motion === 'number' && Number.isFinite(value.settings.motion)) {
      base.settings.motion = Math.max(0, Math.min(1, value.settings.motion));
    }
    if (typeof value.settings?.volume === 'number' && Number.isFinite(value.settings.volume)) {
      base.settings.volume = Math.max(0, Math.min(1, value.settings.volume));
    }

    // History
    if (Array.isArray(value.history)) {
      base.history = value.history.filter((h) => h && typeof h.day === 'string').slice(-1000);
    }

    // Calendar
    if (value.calendar && typeof value.calendar === 'object') {
      base.calendar.hammers = Number.isInteger(value.calendar.hammers) ? Math.max(0, Math.min(3, value.calendar.hammers)) : 1;
      base.calendar.nocount = (typeof value.calendar.nocount === 'object' && value.calendar.nocount) ? { ...value.calendar.nocount } : {};
      base.calendar.asked = typeof value.calendar.asked === 'string' ? value.calendar.asked : null;
    }

    // Quests
    if (value.quests && typeof value.quests === 'object') {
      base.quests.day = typeof value.quests.day === 'string' ? value.quests.day : dayKey();
      base.quests.list = Array.isArray(value.quests.list) ? value.quests.list : [];
      base.quests.rewarded = Boolean(value.quests.rewarded);
      base.quests.doneDays = (typeof value.quests.doneDays === 'object' && value.quests.doneDays) ? { ...value.quests.doneDays } : {};
    }

    // Stats
    if (value.stats && typeof value.stats === 'object') {
      for (const k of ['problems', 'firstTry', 'misses', 'perfects', 'maxCombo', 'reviewSolved', 'playMs']) {
        if (Number.isSafeInteger(value.stats[k])) base.stats[k] = Math.max(0, value.stats[k]);
      }
      if (value.stats.flags && typeof value.stats.flags === 'object') {
        base.stats.flags = { ...value.stats.flags };
      }
    }

    // Daily login bonus
    if (value.bonus && typeof value.bonus === 'object') {
      base.bonus = {
        last: typeof value.bonus.last === 'string' ? value.bonus.last : null,
        run: Number.isSafeInteger(value.bonus.run) && value.bonus.run >= 0 ? value.bonus.run : 0,
        stickers: (typeof value.bonus.stickers === 'object' && value.bonus.stickers) ? { ...value.bonus.stickers } : {},
        total: Number.isSafeInteger(value.bonus.total) && value.bonus.total >= 0 ? value.bonus.total : 0,
      };
    }

    // Trophies
    if (value.trophies && typeof value.trophies === 'object' && value.trophies.got) {
      base.trophies.got = { ...value.trophies.got };
    }
  } catch {
    /* Storage may be blocked, missing, or corrupt. */
  }
  return base;
}

export const STICKERS = ['star', 'heart', 'flower', 'note', 'clover', 'hanamaru', 'crown'];

export function claimLogin(bonus, calendar = {}, today = new Date()) {
  const b = bonus || { last: null, run: 0, stickers: {}, total: 0 };
  const key = dayKey(today);
  if (b.last === key) return null;
  const nc = calendar.nocount || {};
  let y = dayBefore(today);
  while (nc[dayKey(y)] && dayKey(y) !== b.last) y = dayBefore(y);
  b.run = b.last === dayKey(y) ? b.run + 1 : 1;
  const slot = ((b.run - 1) % 7) + 1;
  const type = STICKERS[slot - 1];
  b.stickers = b.stickers || {};
  b.stickers[key] = type;
  b.last = key;
  b.total = (b.total || 0) + 1;
  return { run: b.run, slot, type, total: b.total };
}

export const stickerOn = (bonus, key) => (bonus?.stickers || {})[key] || null;
export const bonusState = (save) => save?.bonus || { last: null, run: 0, stickers: {}, total: 0 };

export function persistSave(storage, save, mode = DEFAULT_MODE) {
  if (!storage) return false;
  try {
    storage.setItem(saveKey(mode), JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function resetAllSaves(storage) {
  if (!storage) return;
  try {
    const toRemove = [];
    if (typeof storage.length === 'number' && typeof storage.key === 'function') {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith('softie-idioms')) {
          toRemove.push(key);
        }
      }
    } else if (typeof storage.keys === 'function') {
      for (const key of storage.keys()) {
        if (typeof key === 'string' && key.startsWith('softie-idioms')) {
          toRemove.push(key);
        }
      }
    }
    for (const key of toRemove) {
      try {
        if (typeof storage.removeItem === 'function') storage.removeItem(key);
        else if (typeof storage.delete === 'function') storage.delete(key);
      } catch { /* ignore */ }
    }
  } catch {
    /* Storage may be blocked or unavailable */
  }
}


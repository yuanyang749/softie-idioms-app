// Daily quests for Idioms泡泡: 2 easy + 1 challenging quest per day.
// Deterministic per day via day-hash. Separated cleanly per mode save.

export const QUEST_DEFS = [
  { id: 'play1', tier: 'easy', metric: 'play', goal: 1, text: () => '完成 1 轮成语练习' },
  { id: 'combo5', tier: 'easy', metric: 'combo', goal: 5, text: () => '达成 5 连击' },
  { id: 'first5', tier: 'easy', metric: 'firstTry', goal: 5, text: () => '独立答对 5 道题' },
  { id: 'review1', tier: 'easy', metric: 'review', goal: 1, text: () => '复习攻克 1 个生词', need: (ctx) => (ctx.reviewCount || 0) > 0 },
  { id: 'play2', tier: 'hard', metric: 'play', goal: 2, text: () => '累计完成 2 轮练习' },
  { id: 'combo8', tier: 'hard', metric: 'combo', goal: 8, text: () => '达成 8 连击' },
  { id: 'first8', tier: 'hard', metric: 'firstTry', goal: 8, text: () => '独立答对 8 道题' },
  { id: 'review2', tier: 'hard', metric: 'review', goal: 2, text: () => '复习攻克 2 个生词', need: (ctx) => (ctx.reviewCount || 0) >= 2 },
  { id: 'perfect1', tier: 'hard', metric: 'perfect', goal: 1, text: () => '独立全对通关一轮（100 分）' },
  { id: 'energy300', tier: 'hard', metric: 'energy', goal: 300, text: () => '快乐能量达到 300', need: (ctx) => !ctx.mode || ctx.mode === 'children' },
  { id: 'energy1000', tier: 'hard', metric: 'energy', goal: 1000, text: () => '快乐能量达到 1,000', need: (ctx) => ctx.mode === 'adult' },
];

export const QUEST_MAP = Object.fromEntries(QUEST_DEFS.map((q) => [q.id, q]));

function hashDay(day) {
  let h = 2166136261;
  for (const ch of day) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFrom(seed) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1e6) / 1e6;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickDailyQuests(day, ctx = {}) {
  const rng = rngFrom(hashDay(`${day}-${ctx.mode || 'children'}`));
  const available = QUEST_DEFS.filter((q) => !q.need || q.need(ctx));
  const easy = shuffle(available.filter((q) => q.tier === 'easy'), rng);
  const hard = shuffle(available.filter((q) => q.tier === 'hard'), rng);

  // Pick 2 easy with different metrics, and 1 hard with different metric
  for (const h of hard) {
    for (let i = 0; i < easy.length; i++) {
      for (let j = i + 1; j < easy.length; j++) {
        const set = [easy[i], easy[j], h];
        if (new Set(set.map((q) => q.metric)).size === 3) {
          return set.map((q) => ({ id: q.id, goal: q.goal, prog: 0, done: false }));
        }
      }
    }
  }

  // Fallback defaults
  return [
    { id: 'play1', goal: 1, prog: 0, done: false },
    { id: 'combo5', goal: 5, prog: 0, done: false },
    { id: 'first8', goal: 8, prog: 0, done: false },
  ];
}

export function ensureDailyQuests(questState, day, ctx = {}) {
  if (questState.day === day && Array.isArray(questState.list) && questState.list.length === 3) {
    return false;
  }
  questState.day = day;
  questState.list = pickDailyQuests(day, ctx);
  questState.rewarded = false;
  questState.doneDays = questState.doneDays || {};
  return true;
}

export function questText(q) {
  const def = QUEST_MAP[q.id];
  return def ? def.text() : '';
}

// Events:
// { type: 'solve', firstTry: boolean, review: boolean, combo: number, energy: number }
// { type: 'round', score: number, solved: number, total: number, firstTryCount: number }
export function feedQuestEvent(questState, ev) {
  const newlyDone = [];
  for (const q of questState.list || []) {
    if (q.done) continue;
    const def = QUEST_MAP[q.id];
    if (!def) continue;

    const before = q.prog;
    switch (def.metric) {
      case 'play':
        if (ev.type === 'round') q.prog += 1;
        break;
      case 'combo':
        if (ev.type === 'solve' && ev.combo) q.prog = Math.max(q.prog, Math.min(q.goal, ev.combo));
        break;
      case 'firstTry':
        if (ev.type === 'solve' && ev.firstTry) q.prog += 1;
        break;
      case 'review':
        if (ev.type === 'solve' && ev.review && ev.firstTry) q.prog += 1;
        break;
      case 'perfect':
        if (ev.type === 'round' && ev.score >= 100 && ev.solved === ev.total && ev.firstTryCount === ev.total) q.prog += 1;
        break;
      case 'energy':
        if (ev.type === 'solve') q.prog = Math.max(q.prog, ev.energy || 0);
        break;
      default:
        break;
    }
    q.prog = Math.min(q.goal, q.prog);
    if (q.prog >= q.goal && before < q.goal) {
      q.done = true;
      newlyDone.push(q);
    }
  }
  return newlyDone;
}

export function isAllQuestsDone(questState) {
  return Array.isArray(questState.list) && questState.list.length > 0 && questState.list.every((q) => q.done);
}

export function claimQuestReward(questState) {
  if (!isAllQuestsDone(questState) || questState.rewarded) return false;
  questState.rewarded = true;
  questState.doneDays = questState.doneDays || {};
  questState.doneDays[questState.day] = true;
  return true;
}

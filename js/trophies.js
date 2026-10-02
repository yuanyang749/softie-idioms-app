// Idioms Trophies and Achievements.
// Pure functions, isolated per mode save.

export const TROPHY_CATEGORIES = [
  { id: 'streak', name: '持之以恒' },
  { id: 'learned', name: '学富五车' },
  { id: 'combo', name: '行云流水' },
  { id: 'perfect', name: '百发百中' },
  { id: 'problems', name: '勤学不辍' },
  { id: 'review', name: '温故知新' },
  { id: 'secret', name: '奇遇彩蛋' },
];

export const RANK_NAMES = {
  bronze: '铜牌',
  silver: '银牌',
  gold: '金牌',
  rainbow: '彩虹',
  secret: '奇遇',
};

const SERIES_DEFS = [
  {
    key: 'streak',
    cat: 'streak',
    title: '连续打卡',
    metric: 'streak',
    steps: [
      { need: 3, rank: 'bronze', name: '初露锋芒', desc: '连续打卡 3 天' },
      { need: 7, rank: 'silver', name: '习惯成自然', desc: '连续打卡 7 天' },
      { need: 14, rank: 'gold', name: '风雨无阻', desc: '连续打卡 14 天' },
      { need: 30, rank: 'rainbow', name: '坚持不懈', desc: '连续打卡 30 天' },
    ],
  },
  {
    key: 'stickers',
    cat: 'streak',
    title: '登录印章',
    metric: 'stickers',
    steps: [
      { need: 1, rank: 'bronze', name: '印章 1 枚', desc: '在打卡日历上收集 1 枚印章' },
      { need: 7, rank: 'silver', name: '印章 7 枚', desc: '在打卡日历上收集 7 枚特别印章' },
      { need: 14, rank: 'gold', name: '印章 14 枚', desc: '在打卡日历上收集 14 枚特别印章' },
      { need: 30, rank: 'rainbow', name: '印章 30 枚', desc: '在打卡日历上收集 30 枚特别印章' },
    ],
  },
  {
    key: 'learned',
    cat: 'learned',
    title: '成语积累',
    metric: 'learnedCount',
    steps: [
      { need: 10, rank: 'bronze', name: '初识词韵', desc: '认识并掌握 10 个成语' },
      { need: 30, rank: 'silver', name: '触类旁通', desc: '认识并掌握 30 个成语' },
      { need: 60, rank: 'gold', name: '出口成章', desc: '认识并掌握 60 个成语' },
      { need: 100, rank: 'rainbow', name: '学富五车', desc: '认识并掌握 100 个成语' },
    ],
  },
  {
    key: 'combo',
    cat: 'combo',
    title: '连击神准',
    metric: 'maxCombo',
    steps: [
      { need: 5, rank: 'bronze', name: '行云流水', desc: '达成 5 连击' },
      { need: 10, rank: 'silver', name: '连珠妙语', desc: '达成 10 连击' },
      { need: 15, rank: 'gold', name: '一气呵成', desc: '达成 15 连击' },
    ],
  },
  {
    key: 'perfect',
    cat: 'perfect',
    title: '满分全对',
    metric: 'perfects',
    steps: [
      { need: 1, rank: 'bronze', name: '首战全胜', desc: '独立全对通关 1 轮' },
      { need: 3, rank: 'silver', name: '十全十美', desc: '独立全对通关 3 轮' },
      { need: 10, rank: 'gold', name: '无懈可击', desc: '独立全对通关 10 轮' },
    ],
  },
  {
    key: 'problems',
    cat: 'problems',
    title: '答题总数',
    metric: 'problems',
    steps: [
      { need: 50, rank: 'bronze', name: '小试身手', desc: '累计答对 50 道成语题' },
      { need: 150, rank: 'silver', name: '日积月累', desc: '累计答对 150 道成语题' },
      { need: 300, rank: 'gold', name: '百炼成钢', desc: '累计答对 300 道成语题' },
      { need: 500, rank: 'rainbow', name: '博古通今', desc: '累计答对 500 道成语题' },
    ],
  },
  {
    key: 'review',
    cat: 'review',
    title: '温故知新',
    metric: 'reviewSolved',
    steps: [
      { need: 1, rank: 'bronze', name: '吃一堑长一智', desc: '在复习馆重新答对 1 道错题' },
      { need: 5, rank: 'silver', name: '查漏补缺', desc: '复习馆累计攻克 5 道生词' },
      { need: 15, rank: 'gold', name: '温故知新', desc: '复习馆累计攻克 15 道生词' },
    ],
  },
  {
    key: 'secret',
    cat: 'secret',
    title: '奇遇彩蛋',
    steps: [
      { id: 'secret-first', metric: 'flag:firstPlay', need: 1, rank: 'secret', name: '启程之印', desc: '完成任意模式的首轮挑战' },
      { id: 'secret-advanced', metric: 'flag:advanced', need: 1, rank: 'secret', name: '更上一层', desc: '完成最高难度的一轮练习' },
      { id: 'secret-night', metric: 'flag:night', need: 1, rank: 'secret', name: '秉烛夜读', desc: '在 22:00 至次日 06:00 之间完成一轮研习' },
      { id: 'secret-weekend', metric: 'flag:weekend', need: 1, rank: 'secret', name: '偷得浮生', desc: '在周六或周日研习成语' },
      { id: 'secret-speed', metric: 'flag:speedy', need: 1, rank: 'secret', name: '对答如流', desc: '在 5 秒内迅速独立选对成语' },
      { id: 'secret-energy', metric: 'flag:energy', need: 1, rank: 'secret', name: '能量绽放', desc: '单轮快乐能量达到 1,000' },
      { id: 'secret-hammer', metric: 'flag:hammerUsed', need: 1, rank: 'secret', name: '逆转时光', desc: '使用补签锤成功挽救一次打卡连击' },
    ],
  },
];

export const TROPHIES = [];
export const TROPHY_MAP = {};

for (const series of SERIES_DEFS) {
  for (const step of series.steps) {
    const id = step.id || `${series.key}-${step.need}`;
    const t = {
      id,
      series: series.key,
      cat: series.cat,
      name: step.name,
      desc: step.desc,
      rank: step.rank,
      need: step.need,
      metric: step.metric || series.metric,
    };
    TROPHIES.push(t);
    TROPHY_MAP[id] = t;
  }
}

export function extractTrophyMetrics(save, extraFlags = {}) {
  const stats = save.stats || {};
  const m = {
    streak: save.streak || 0,
    stickers: save.bonus?.total || 0,
    learnedCount: Array.isArray(save.learned) ? save.learned.length : 0,
    maxCombo: stats.maxCombo || 0,
    perfects: stats.perfects || 0,
    problems: stats.problems || 0,
    reviewSolved: stats.reviewSolved || 0,
    daysPlayed: save.daysPlayed || 0,
  };

  const flags = { ...(stats.flags || {}), ...extraFlags };
  for (const [k, v] of Object.entries(flags)) {
    if (v) m[`flag:${k}`] = 1;
  }
  return m;
}

export function evaluateTrophies(trophyState, metrics, at = Date.now()) {
  trophyState.got = trophyState.got || {};
  const newlyEarned = [];

  for (const t of TROPHIES) {
    if (trophyState.got[t.id]) continue;
    const val = metrics[t.metric] || 0;
    if (val >= t.need) {
      trophyState.got[t.id] = at;
      newlyEarned.push(t);
    }
  }

  return newlyEarned;
}

export function getEarnedTrophiesCount(trophyState) {
  if (!trophyState?.got) return 0;
  // Preserve old award records in the save, but count the current catalogue.
  return TROPHIES.filter(t => trophyState.got[t.id]).length;
}

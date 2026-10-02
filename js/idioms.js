// Pure gameplay logic shared by audience modes; content and copy live in modes.js.
import { DEFAULT_MODE } from './modes.js';

// Visually/semantically related distractors; none are accepted as alternate answers.
const CONFUSABLE = {
  心: '必思意', 意: '义忆音', 一: '二十百', 二: '三两十', 三: '二五山', 五: '午无四',
  六: '大八文', 七: '十九八', 八: '人入九', 九: '丸久十', 十: '千土士', 千: '干于十',
  万: '方力百', 百: '白自千', 清: '晴情青', 晴: '睛清情', 睛: '晴精青', 精: '睛情清',
  情: '晴清请', 请: '清晴情', 义: '意仪议', 益: '意溢易', 已: '己巳以', 己: '已记纪',
  再: '在才又', 在: '再左有', 往: '住住来', 张: '长帐涨', 志: '知至治', 至: '志致到',
  致: '至知志', 生: '声升身', 声: '生升身', 身: '深生申', 神: '伸申审',
  而: '耳儿尔', 耳: '而儿目', 目: '日木月', 手: '首毛牛', 首: '手自头',
  水: '永冰木', 木: '本末未', 未: '末木朱', 末: '未本木', 日: '目白月',
  云: '去运会', 山: '出仙川', 花: '化华草', 画: '话化划', 话: '画活化',
  持: '待特诗', 待: '持侍时', 恒: '桓但垣', 泄: '泻世池', 懈: '解蟹角',
  锲: '契刻切', 舍: '合余会', 孜: '仔子孝', 倦: '卷圈券', 寝: '侵浸眠',
  循: '盾寻巡', 序: '予宇舒', 融: '容溶熔', 贯: '惯灌串', 通: '同痛过',
  拙: '绌出屈', 折: '拆析斤', 挠: '绕饶浇', 懦: '儒需弱',
  茅: '矛芽苗', 塞: '赛寒寨', 豁: '谷活害', 然: '燃热染', 焕: '换唤涣',
  惟: '唯维推', 肖: '消宵削', 栩: '羽许翊', 匠: '巨医匹', 弦: '玄舷线',
  犹: '优尤忧', 绸: '稠调周', 缪: '谬缭缕', 夷: '姨胰平', 惧: '具俱慎',
  磊: '垒雷石', 宏: '洪红弘', 竽: '芋于宇', 椟: '读犊柜', 珠: '株朱球',
  株: '珠朱树', 蛙: '娃洼哇', 蛇: '它虫龙', 雕: '凋碉鸟', 炭: '碳岸灰',
};
const COMMON = [...'天地人和风雨春秋山水花鸟学思知礼友书海星光明快乐勤奋'];

export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function optionsFor(q, step, rng = Math.random, mode = DEFAULT_MODE) {
  const index = q.blanks[step];
  const answer = q.word[index];
  const authored = q.distractors?.[step] || [];
  const candidates = [...new Set([...authored, ...(CONFUSABLE[answer] || ''), ...shuffle(COMMON, rng)])].filter((c) => c !== answer);
  // Do not offer a character that makes another bank idiom fit the same pattern.
  const safe = candidates.filter((c) => !mode.questions.some((other) => other.word === q.word.slice(0, index) + c + q.word.slice(index + 1)));
  return shuffle([answer, ...safe.slice(0, 3)], rng);
}

export function makeRound(level, { mode = DEFAULT_MODE, count = mode.rules.roundSize, seen = [], rng = Math.random } = {}) {
  const pool = mode.questions.filter((q) => q.level === level);
  return [...shuffle(pool.filter((q) => !seen.includes(q.id)), rng), ...shuffle(pool.filter((q) => seen.includes(q.id)), rng)].slice(0, count);
}

export function placementRound(rng = Math.random, mode = DEFAULT_MODE) {
  return mode.levels.flatMap((l) => makeRound(l.id, { count: mode.rules.placementPerLevel, rng, mode }));
}

export function recommendedLevel(results, mode = DEFAULT_MODE) {
  // A small, non-diagnostic check: pass each earlier level before moving up.
  let recommended = mode.levels[0].id;
  for (let i = 0; i < mode.levels.length - 1; i++) {
    if (results.filter((r) => r.level === mode.levels[i].id && r.firstTry).length < mode.rules.placementPerLevel) break;
    recommended = mode.levels[i + 1].id;
  }
  return recommended;
}

export function recordAnswer(save, q, firstTry, { demo = false, placement = false } = {}) {
  if (demo || placement) return;
  if (!save.learned.includes(q.id)) save.learned.push(q.id);
  if (firstTry) save.review = save.review.filter((id) => id !== q.id);
  else if (!save.review.includes(q.id)) save.review.push(q.id);
}

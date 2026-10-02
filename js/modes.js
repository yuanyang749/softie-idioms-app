import { CHILDREN_QUESTIONS } from './content/children.js';
import { ADULT_QUESTIONS } from './content/adult.js';

// An audience is not a difficulty. New audiences supply a bank, levels, rules and
// interface copy here; the rendering, answer flow, audio and FX stay shared.
export const MODES = {
  children: {
    id: 'children', label: '儿童模式', theme: 'children', version: 1,
    questions: CHILDREN_QUESTIONS,
    levels: [
      { id: 1, name: '萌芽', label: '常用成语 · 单字 · 每题 30 秒', color: 'mint', seconds: 30 },
      { id: 2, name: '成长', label: '读懂情境 · 单字 · 每题 24 秒', color: 'blue', seconds: 24 },
      { id: 3, name: '绽放', label: '进阶挑战 · 双字 · 每题 20 秒', color: 'violet', seconds: 20 },
    ],
    rules: { roundSize: 8, placementPerLevel: 2, demoPerLevel: 2 },
    copy: {
      titleLead: '成语', titleAccent: '泡泡', tagline: '软乎乎的文字游乐场', eyebrow: '小小成语，大大能量',
      stationSuffix: '小站', stationStart: '从「{name}」出发', stageReady: '泡泡小队，准备好啦',
      intro: '选对一个字，让快乐冒个泡。', placement: '测测我的起点',
      levelHeading: '也可以，自己选一站', footer: '不用赶时间，答错也没关系。',
      ready: '让软乎乎把选中的字送过去吧。', wrong: '差一点点，再看看情境吧。',
      correct: '气泡命中！这个字选对了。', finished: '成语收集成功！一起读懂它。',
      resultTitle: '每一点进步\n都值得庆祝。', learned: '今天又认识了一个成语',
      home: '回到文字游乐场', disclaimer: '三个难度是游戏分组，不代表年级或语文成绩。测验只是帮助你选择起点，所有难度都可以直接玩。',
      logoBits: ['妙', '趣'],
    },
  },
  adult: {
    id: 'adult', label: '成人模式', theme: 'adult', version: 1,
    questions: ADULT_QUESTIONS,
    levels: [
      { id: 1, name: '职场社交', label: '沟通进退 · 单字 · 每题 18 秒', color: 'mint', seconds: 18 },
      { id: 2, name: '文史典故', label: '名士典章 · 单字 · 每题 15 秒', color: 'blue', seconds: 15 },
      { id: 3, name: '进阶哲理', label: '思辨内省 · 双字 · 每题 12 秒', color: 'violet', seconds: 12 },
    ],
    rules: { roundSize: 8, placementPerLevel: 2, demoPerLevel: 2 },
    copy: {
      titleLead: '成语', titleAccent: '泡泡', tagline: '成语快闪 · 文字深呼吸', eyebrow: '字里乾坤，处世哲思',
      stationSuffix: '研习', stationStart: '从「{name}」出发', stageReady: '泡泡小队，准备好啦',
      intro: '在方寸文字之间，寻觅处世哲思与文化底蕴。', placement: '测测我的认知起点',
      levelHeading: '也可以，自选研习站', footer: '思维敏捷，方寸之间见真章。',
      ready: '让软乎乎把选中的字送过去吧。', wrong: '差一点点，再推敲一下语境吧。',
      correct: '气泡命中！字义精准契合。', finished: '成语研习完成！温故而知新。',
      resultTitle: '每一次推敲\n都有新的收获。', learned: '今天又掌握了一个成语',
      home: '回到文字游乐场', disclaimer: '三个梯度由浅入深，涵盖职场、文史与哲理。测试只为帮助你推荐起点，所有模块均可直接研习。',
      logoBits: ['风', '雅'],
    },
  },
};

export const DEFAULT_MODE = MODES.children;
export function getMode(id) { return MODES[id] || DEFAULT_MODE; }
export function saveKey(mode) { return `softie-idioms:${mode.id}:v${mode.version}`; }

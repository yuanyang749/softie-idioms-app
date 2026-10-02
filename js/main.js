import { startClock, onFrame, centerOf, tween, wait, lerp, rand, easeOutBack, easeInCubic, easeOutQuint } from './core.js';
import { AudioEngine } from './audio.js';
import { FX } from './fx.js';
import { Backdrop } from './bg.js';
import { mountSofties, softieSVG, bounce, bubbleHit } from './softie.js';
import { MODES, getMode, saveKey } from './modes.js';
import { makeRound, placementRound, recommendedLevel, optionsFor, recordAnswer, shuffle } from './idioms.js';
import { loadSave, persistSave, resetAllSaves, dayKey, currentStreak, bestStreak, hammerOffer, useHammer, playedDays, STICKERS, claimLogin, stickerOn, bonusState } from './storage.js';
import { ensureDailyQuests, questText, feedQuestEvent, isAllQuestsDone, claimQuestReward } from './quests.js';
import { TROPHIES, extractTrophyMetrics, evaluateTrophies, getEarnedTrophiesCount, RANK_NAMES } from './trophies.js';
import { energyAt, musicAt, crowdAt, correctParticles, celebrationParticles, finaleParticles, gainEnergy, displayEnergy } from './choreography.js';
import { questionSeconds, countdown } from './timer.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let storage;
try { storage = window.localStorage; } catch { /* Private browser storage can be blocked. */ }
const params = new URLSearchParams(location.search);
const activeModeId = params.get('mode') || storage?.getItem('softie-idioms:active-mode');
let mode = getMode(activeModeId);
let copy = mode.copy;
let saved = loadSave(storage, mode);
try { if (!storage?.getItem(saveKey(mode))) saved.settings.motion = !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* Use default settings. */ }
const audio = new AudioEngine();
const fx = new FX($('#fx'), 300);
const fxBack = new FX($('#fx-back'), 520);
// This is the original 2D backdrop, not a 3D scene or WebGPU renderer.
const bg = new Backdrop($('#bg'), $('#rays-fallback'));
const homeActors = mountSofties($('#home-softies'));
const actors = mountSofties($('#play-softies'));
const resultActors = mountSofties($('#result-softies'));
const S = { screen: 'home', run: 0, questions: [], qi: 0, step: 0, ready: false, phase: 'answer', demo: false, kind: 'level', level: mode.levels[0].id, firstTry: true, misses: 0, combo: 0, peak: 0, energy: 0, E: .02, flash: 0, shake: 0, results: [], stepMisses: 0, earnedTrophies: [], bonusOpen: false, pendingLoginBonus: null };
Object.assign(S, { visualE: .02, shownEnergy: 0, energyUnit: 0, idleAt: 0 });
const timers = new Set();
let pendingHammer = null;
let bonusTimer = 0;
const motionValue = () => {
  if (typeof saved.settings.motion === 'boolean') return saved.settings.motion ? 1 : 0;
  if (typeof saved.settings.motion === 'number' && Number.isFinite(saved.settings.motion)) {
    return Math.max(0, Math.min(1, saved.settings.motion));
  }
  return 1;
};
const reduced = () => motionValue() <= 0.001;
const paused = () => document.hidden || S.screen === 'settings' || $('#leave-dialog').open;
const activeQuestion = () => S.questions[S.qi];
const levelInfo = (level) => mode.levels.find((l) => l.id === level);

let lastClickSoundTime = 0;
function playClickSound(type = 'bubble') {
  if (!saved.settings?.sound || audio.muted) return;
  const now = performance.now();
  if (now - lastClickSoundTime < 30) return;
  lastClickSoundTime = now;
  audio.unlock();
  const t = audio.now();
  switch (type) {
    case 'primary':
      audio.play('pop', t, { v: 0.22, f: 540 });
      audio.play('blip', t + 0.025, { m: 84, v: 0.14 });
      audio.play('bell', t + 0.05, { m: 91, v: 0.09, dur: 0.5 });
      break;
    case 'tab':
      audio.play('pop', t, { v: 0.18, f: 640 });
      audio.play('blip', t + 0.02, { m: 81, v: 0.11 });
      break;
    case 'back':
      audio.play('pop', t, { v: 0.15, f: 430 });
      break;
    case 'toggle-on':
      audio.play('pop', t, { v: 0.18, f: 560 });
      audio.play('blip', t + 0.025, { m: 84, v: 0.12 });
      break;
    case 'toggle-off':
      audio.play('pop', t, { v: 0.14, f: 420 });
      break;
    case 'softie':
      audio.play('pop', t, { v: 0.2, f: 600 });
      audio.jump(0.7);
      break;
    case 'bubble':
    default:
      audio.play('pop', t, { v: 0.16, f: 490 + Math.random() * 80 });
      audio.play('blip', t + 0.02, { m: 76 + Math.floor(Math.random() * 5), v: 0.08 });
      break;
  }
}

function startHomeMusic() {
  if (!saved.settings?.sound || audio.muted || S.screen === 'play') return;
  audio.unlock();
  audio.setLevel(0, 102);
  audio.key = 0;
  audio.setReach?.(false);
  audio.startMusic();
}

function persist() { $('#storage-note').hidden = persistSave(storage, saved, mode); }
function later(fn, ms) {
  const run = S.run;
  const id = setTimeout(() => { timers.delete(id); if (run === S.run) fn(); }, ms);
  timers.add(id);
}
function cancelRun() {
  S.run += 1;
  timers.forEach(clearTimeout); timers.clear();
  $('#bubble-layer').replaceChildren(); $('#cutins').replaceChildren();
  $('#show-actors').replaceChildren();
  document.body.classList.remove('reach');
  audio.setReach(false);
  S.ready = false; S.flash = 0; S.shake = 0;
  S.earnedTrophies = [];
  $('#question-card').style.transform = '';
}
function showScreen(screen) {
  S.screen = screen;
  document.body.dataset.screen = screen;
  for (const el of $$('.screen')) el.hidden = el.id !== screen;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function applySettings() {
  const m = motionValue();
  const isReduced = reduced();
  document.body.classList.toggle('reduced', isReduced);
  document.body.classList.toggle('motion-enabled', !isReduced);
  audio.setMuted(!saved.settings.sound);
  audio.setVolume(saved.settings.volume);
  if (!saved.settings.sound) {
    audio.stopMusic();
  } else if (S.screen === 'home' || S.screen === 'settings') {
    startHomeMusic();
  }
  fx.reduced = fxBack.reduced = isReduced;
  fx.motion = fxBack.motion = m;
  if ($('#sound-setting')) $('#sound-setting').checked = saved.settings.sound;
  if ($('#sound-toggle-text')) $('#sound-toggle-text').textContent = saved.settings.sound ? '开启' : '关闭';
  if ($('#sound-toggle-btn')) {
    $('#sound-toggle-btn').classList.toggle('off', !saved.settings.sound);
    $('#sound-toggle-btn').setAttribute('aria-pressed', String(saved.settings.sound));
  }
  if ($('#motion-setting')) {
    $('#motion-setting').value = Math.round(m * 100);
    $('#motion-setting').style.setProperty('--v', m);
    $('#motion-setting').checked = !isReduced;
  }
  if ($('#motion-val')) $('#motion-val').textContent = `${Math.round(m * 100)}%`;
  $('#open-settings')?.setAttribute('title', isReduced ? '游戏设置 · 动效已减少' : '游戏设置');
  $('#open-settings')?.setAttribute('aria-label', isReduced ? '游戏设置 · 动效已减少' : '游戏设置');
  if ($('#volume-setting')) {
    $('#volume-setting').value = Math.round(saved.settings.volume * 100);
    $('#volume-setting').style.setProperty('--v', saved.settings.volume);
  }
  if ($('#volume-value')) $('#volume-value').textContent = `${Math.round(saved.settings.volume * 100)}%`;
  if (isReduced) {
    fx.parts = []; fxBack.parts = [];
    for (const a of document.getAnimations()) a.cancel();
    S.shake = 0; S.flash = 0;
    $('#cutins').replaceChildren(); $('#show-actors').replaceChildren();
  }
  setShowLevel();
}

function setMotion(v, { persist: shouldPersist = true } = {}) {
  const m = Math.max(0, Math.min(1, Number(v)));
  saved.settings.motion = m;
  const isReduced = m <= 0.001;
  fx.reduced = fxBack.reduced = isReduced;
  fx.motion = fxBack.motion = m;
  document.body.classList.toggle('reduced', isReduced);
  document.body.classList.toggle('motion-enabled', !isReduced);
  const sl = $('#motion-setting');
  if (sl) {
    sl.value = Math.round(m * 100);
    sl.style.setProperty('--v', m);
    sl.checked = !isReduced;
  }
  const valEl = $('#motion-val');
  if (valEl) valEl.textContent = `${Math.round(m * 100)}%`;
  $('#open-settings')?.setAttribute('title', isReduced ? '游戏设置 · 动效已减少' : '游戏设置');
  $('#open-settings')?.setAttribute('aria-label', isReduced ? '游戏设置 · 动效已减少' : '游戏设置');
  if (isReduced) {
    fx.parts = []; fxBack.parts = [];
    for (const a of document.getAnimations()) a.cancel();
    S.shake = 0; S.flash = 0;
    $('#cutins').replaceChildren(); $('#show-actors').replaceChildren();
  }
  if (shouldPersist) persist();
}

let lastSliderFx = 0;
function motionSliderFx(v) {
  const t = performance.now();
  if (t - lastSliderFx < 70) return;
  lastSliderFx = t;
  const sl = $('#motion-setting');
  if (!sl || !sl.getBoundingClientRect) return;
  const rect = sl.getBoundingClientRect();
  const x = rect.left + 16 + (rect.width - 32) * v;
  const y = rect.top + rect.height / 2;
  if (saved.settings?.sound && !audio.muted) {
    audio.unlock();
    audio.play('blip', audio.now(), { m: 60 + Math.round(v * 24), v: 0.05 + 0.08 * v });
  }
  if (v <= 0.001) return;
  if (fx && fx.burst) {
    fx.burst(x, y, { count: Math.round(2 + 26 * v), speed: 160 + 520 * v, kinds: ['confetti', 'spark'], up: 120, life: 0.5 });
  }
  if (v > 0.5 && fx && fx.ring) {
    fx.ring(x, y, { color: v > 0.85 ? '#ffd23f' : '#ff7ab6', radius: 20 + 50 * v, width: 5 });
  }
}
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function updateDailyQuests(event) {
  // Settle completed old saves before replacing yesterday's task list.
  let rewards = claimQuestReward(saved.quests) ? 1 : 0;
  const changed = ensureDailyQuests(saved.quests, dayKey(), { mode: mode.id, reviewCount: saved.review.length });
  if (event) feedQuestEvent(saved.quests, event);
  if (claimQuestReward(saved.quests)) rewards += 1;
  if (rewards) {
    saved.calendar.hammers = Math.min(3, (saved.calendar.hammers || 0) + rewards);
    audio.jingle();
  }
  if (changed || rewards) persist();
}

const HAMMER_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#302238" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"><path d="M44.5 40 L55.5 40 L57 97 L43 97Z" fill="#3b6bff"/><path d="M44 60 L56 57 M44 74 L56 71 M44 88 L56 85" fill="none" stroke-width="2.6"/><rect x="13" y="12" width="74" height="30" rx="13" fill="#ff7ab6"/><rect x="5" y="8" width="15" height="38" rx="6" fill="#ffd23f"/><rect x="80" y="8" width="15" height="38" rx="6" fill="#ffd23f"/><path d="M28 20 Q50 15 72 20" fill="none" stroke="#fff" stroke-width="3" opacity=".85"/></g></svg>`;

const TROPHY_COL = {
  bronze: ['#eea36b', '#b8672b'],
  silver: ['#eef1f7', '#9aa6bf'],
  gold: ['#ffd23f', '#d99400'],
  rainbow: ['#ff9ccc', '#7a4bff'],
  secret: ['#c7a8ff', '#7a4bff'],
  none: ['#eceaf3', '#b9bbd8']
};

function trophySvg(rank = 'gold') {
  const [c0, c1] = TROPHY_COL[rank] || TROPHY_COL.gold;
  const rb = rank === 'rainbow';
  const fill = rb ? 'url(#tg-rb)' : c0;
  return `<svg viewBox="-20 -20 40 40" aria-hidden="true">${rb ? '<defs><linearGradient id="tg-rb" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ff7ab6"/><stop offset=".4" stop-color="#ffd23f"/><stop offset=".7" stop-color="#3fdcb0"/><stop offset="1" stop-color="#8fb4ff"/></linearGradient></defs>' : ''}<g stroke="#302238" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M-10.5 -12 C-18 -12 -18 -1 -8 1 M10.5 -12 C18 -12 18 -1 8 1" fill="none" stroke-width="2.6"/><path d="M-11 -16 H11 V-7 C11 2 5.5 6.5 0 6.5 C-5.5 6.5 -11 2 -11 -7Z" fill="${fill}"/><path d="M-3 6.5 L3 6.5 L4.2 11.5 L-4.2 11.5Z" fill="${c1}"/><rect x="-9.5" y="11.5" width="19" height="5.5" rx="2" fill="${fill}"/><path d="M0 -12.5 L1.6 -8.8 L5.6 -8.5 L2.6 -5.9 L3.5 -2 L0 -4.1 L-3.5 -2 L-2.6 -5.9 L-5.6 -8.5 L-1.6 -8.8Z" fill="#fff" stroke-width="1.2"/></g></svg>`;
}

function checkTrophies() {
  const earned = evaluateTrophies(saved.trophies, extractTrophyMetrics({
    ...saved, streak: bestStreak(saved.history, saved.calendar.nocount),
  }), Date.now());
  S.earnedTrophies.push(...earned);
  return earned;
}

function showEarnedTrophies() {
  if (!S.earnedTrophies.length) return;
  $('#tg-list').innerHTML = S.earnedTrophies.map(t => `<div class="tg-item rank-${t.rank}">
    <div class="tg-item-icon">${trophySvg(t.rank)}</div>
    <div class="tg-item-info"><b>${t.name}</b><small>${t.desc}</small></div>
  </div>`).join('');
  S.earnedTrophies = [];
  audio.jingle();
  $('#trophy-got-dialog').showModal();
}

function updateActionBadges() {
  const calDot = $('#cal-dot');
  if (calDot) {
    const todayStr = dayKey();
    const playedToday = playedDays(saved.history).has(todayStr);
    calDot.hidden = playedToday;
  }

  const bonusDot = $('#bonus-dot');
  if (bonusDot) {
    bonusDot.hidden = Boolean(saved.bonus?.last === dayKey());
  }

  const questDot = $('#quest-dot');
  if (questDot) {
    const allDone = isAllQuestsDone(saved.quests);
    const hasUnclaimed = allDone && !saved.quests?.rewarded;
    questDot.hidden = allDone && Boolean(saved.quests?.rewarded);
    questDot.classList.toggle('reward-ready', hasUnclaimed);
  }
}

function renderQuests() {
  updateDailyQuests();
  const allDone = isAllQuestsDone(saved.quests);
  const card = $('#quests');
  if (card) card.classList.toggle('all-done', allDone);
  const dialog = $('#quests-dialog');
  if (dialog) dialog.classList.toggle('all-done', allDone);

  const rewardEl = $('#quest-reward');
  const rewardText = $('#quest-reward-text');
  if (allDone) {
    if (rewardEl) rewardEl.classList.add('claimed');
    if (rewardText) rewardText.textContent = '今日委托全部达成！奖励已结算';
  } else {
    if (rewardEl) rewardEl.classList.remove('claimed');
    if (rewardText) rewardText.textContent = '全部达成领金锤';
  }

  const list = $('#quest-list');
  if (list && saved.quests.list) {
    list.innerHTML = saved.quests.list.map((q) => {
      const pct = Math.min(100, Math.round((q.prog / q.goal) * 100));
      return `<li class="${q.done ? 'done' : ''}">
        <span class="qchk">${q.done ? '✓' : ''}</span>
        <span class="qt">${questText(q)}</span>
        <span class="qp">${q.prog}/${q.goal}</span>
        <div class="qbar"><div class="qbar-fill" style="width:${pct}%"></div></div>
      </li>`;
    }).join('');
  }
  updateActionBadges();
}

function renderCalendar() {
  const calTitle = $('#cal-title');
  if (calTitle) calTitle.textContent = `${calYear} 年 ${calMonth + 1} 月`;

  const streak = currentStreak(saved.history, saved.calendar.nocount);
  const best = bestStreak(saved.history, saved.calendar.nocount);
  const todayStr = dayKey();
  const playedToday = playedDays(saved.history).has(todayStr);

  const badges = [];
  if (streak >= 1) badges.push(`<span class="cal-badge${streak >= 3 ? ' hot' : ''}">连续研习 <b>${streak}</b> 天${playedToday ? '' : ' (今日待打卡)'}</span>`);
  else badges.push(`<span class="cal-badge">从今天开启打卡</span>`);
  if (best >= 2) badges.push(`<span class="cal-badge best">最高 <b>${best}</b> 天</span>`);
  if (saved.bonus?.total) badges.push(`<span class="cal-badge stk">特别印章 <b>${saved.bonus.total}</b> 枚</span>`);
  badges.push(`<span class="cal-badge hmr" title="补签金锤"><i class="hmr-icon" aria-hidden="true">${HAMMER_SVG}</i> <b>${saved.calendar.hammers || 0}</b> 把</span>`);
  if ($('#cal-badges')) $('#cal-badges').innerHTML = badges.join('');

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const nocount = saved.calendar.nocount || {};
  const questDoneDays = saved.quests?.doneDays || {};

  let html = '';
  for (let i = 0; i < firstDay; i++) {
    html += '<span class="cal-day blank"></span>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayRecords = (saved.history || []).filter((h) => h.day === dStr);
    const cls = ['cal-day'];
    if (dStr === todayStr) cls.push('today');
    const isNocount = !dayRecords.length && nocount[dStr];
    if (isNocount) cls.push('nocount');
    const sticker = saved.bonus?.stickers?.[dStr];
    const stk = sticker ? `<span class="stk">${stickerSvg(sticker)}</span>` : '';

    if (dayRecords.length > 0) {
      cls.push('played');
      const bestScore = Math.max(...dayRecords.map((h) => h.score || 0));
      const star = questDoneDays[dStr] ? '<span class="qd-star" aria-label="今日委托达成">★</span>' : '';
      html += `<button type="button" class="${cls.join(' ')}" data-day="${dStr}" aria-label="${dStr} 挑战 ${dayRecords.length} 次 最高 ${bestScore} 分"><span class="n">${d}</span>${stampSvg(bestScore)}<span class="sc">${bestScore}</span>${stk}${star}</button>`;
    } else if (isNocount) {
      html += `<span class="${cls.join(' ')}"><span class="n">${d}</span><span class="nc-label">补签</span>${stk}</span>`;
    } else {
      html += `<span class="${cls.join(' ')}"><span class="n">${d}</span>${stk}</span>`;
    }
  }

  if ($('#cal-grid')) $('#cal-grid').innerHTML = html;

  const now = new Date();
  if ($('#cal-next')) {
    $('#cal-next').disabled = calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth >= now.getMonth());
  }
  updateActionBadges();
}

function checkHammer() {
  const offer = hammerOffer(saved.calendar, saved.history);
  if (offer && offer.hammersNeeded > 0) {
    const dialog = $('#hammer-dialog');
    const msg = $('#hammer-msg');
    if (dialog && msg && !dialog.open) {
      pendingHammer = { ...offer, day: dayKey(), mode: mode.id };
      msg.innerHTML = `你缺席了 <b>${offer.missed.length}</b> 天，是否消耗 <b>${offer.hammersNeeded}</b> 把补签金锤接续连续打卡纪录？`;
      dialog.showModal();
      saved.calendar.asked = dayKey();
      persist();
    }
  }
}

// 日历打卡成绩花丸手绘印章 (Hanamaru score stamp)
function stampSvg(score) {
  const gold = score >= 100;
  const col = gold ? '#ff4f6d' : '#ff7ab6';
  return `<svg class="cal-score-stamp" viewBox="-20 -20 40 40" aria-hidden="true"><path d="M-2 -15 C10 -16 16 -6 14 4 C12 13 1 17 -8 13 C-16 9 -16 -4 -8 -11 C-3 -15 5 -14 9 -10" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"/>${gold ? '<path d="M0 -19 l2 4 4 .5 -3 3 .8 4 -3.8 -2 -3.8 2 .8 -4 -3 -3 4 -.5z" fill="#ffd23f" stroke="#302238" stroke-width="1.2" stroke-linejoin="round"/>' : ''}</svg>`;
}

// 每日签到印章图案 (hand-cut paper shapes)
function stickerSvg(type) {
  const k = '#1b1d4d';
  const shapes = {
    star: `<path d="M0 -17 L5 -6 L17 -5 L8 3 L11 15 L0 9 L-11 15 L-8 3 L-17 -5 L-5 -6Z" fill="#ffd23f" stroke="${k}" stroke-width="2.5" stroke-linejoin="round"/>`,
    heart: `<path d="M0 15 C-20 2 -15 -14 -6 -13 C-2 -13 0 -9 0 -7 C0 -9 2 -13 6 -13 C15 -14 20 2 0 15Z" fill="#ff7ab6" stroke="${k}" stroke-width="2.5"/>`,
    flower: `${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-9" rx="6.5" ry="9" transform="rotate(${a})" fill="#8fb4ff" stroke="${k}" stroke-width="2.2"/>`).join('')}<circle r="6" fill="#ffd23f" stroke="${k}" stroke-width="2.2"/>`,
    note: `<path d="M-4 9 V-13 L12 -16 V5" fill="none" stroke="${k}" stroke-width="3.5" stroke-linejoin="round"/><ellipse cx="-9" cy="10" rx="6.5" ry="5" fill="#3fdcb0" stroke="${k}" stroke-width="2.5"/><ellipse cx="7" cy="6" rx="6.5" ry="5" fill="#3fdcb0" stroke="${k}" stroke-width="2.5"/>`,
    clover: `${[0, 90, 180, 270].map((a) => `<circle cx="0" cy="-7.5" r="7" transform="rotate(${a})" fill="#6fd66f" stroke="${k}" stroke-width="2.2"/>`).join('')}<path d="M2 6 Q6 12 5 17" stroke="${k}" stroke-width="2.5" fill="none"/>`,
    hanamaru: `<path d="M-2 -15 C10 -16 16 -6 14 4 C12 13 1 17 -8 13 C-16 9 -16 -4 -8 -11 C-3 -15 5 -14 9 -10" fill="none" stroke="#ff4f6d" stroke-width="3.5" stroke-linecap="round"/><path d="M-6 -1 Q0 -9 6 -1 Q0 7 -6 -1Z" fill="#ffb3d6" stroke="#ff4f6d" stroke-width="2"/>`,
    crown: `<g stroke="${k}" stroke-width="1.8"><circle cx="-14" cy="3" r="7.5" fill="#ffd23f"/><circle cx="-14" cy="3" r="5" fill="#fff3c4"/><circle cx="14" cy="3" r="7.5" fill="#ffd23f"/><circle cx="14" cy="3" r="5" fill="#fff3c4"/><ellipse cy="4" rx="12.5" ry="10.5" fill="#ffd23f"/><ellipse cy="5.5" rx="10" ry="7.5" fill="#fff3e4"/><circle cx="-4.5" cy="5" r="2.6" fill="#fff" stroke-width="1"/><circle cx="-4.5" cy="5" r="1.9" fill="#ff97bf" stroke-width="1"/><circle cx="4.5" cy="5" r="2.6" fill="#fff" stroke-width="1"/><circle cx="4.5" cy="5" r="1.9" fill="#ff97bf" stroke-width="1"/><path d="M-2 9 Q0 10.5 2 9" fill="none" stroke-width="1.2" stroke-linecap="round"/><path d="M-9 -4 L-9 -14 L-4.5 -9 L0 -16 L4.5 -9 L9 -14 L9 -4Z" fill="#ff97bf" stroke-linejoin="round"/></g>`,
  };
  return `<svg viewBox="-20 -20 40 40" aria-hidden="true">${shapes[type] || shapes.star}</svg>`;
}

function openBonus(res, { isManual = false } = {}) {
  const dialog = $('#bonus-dialog');
  if (!dialog) return;
  S.pendingLoginBonus = null;
  S.bonusOpen = true;

  const runEl = $('#bonus-run');
  if (runEl) {
    runEl.innerHTML = res.run >= 2 ? `连续<b>${res.run}</b>天签到` : '今日签到奖励';
  }

  const slots = [];
  for (let i = 1; i <= 7; i++) {
    const got = i <= res.slot;
    const isToday = i === res.slot;
    const type = STICKERS[i - 1];
    const stampingCls = (isToday && !isManual) ? ' stamping' : '';
    const todayCls = isToday ? ' today' : '';
    const bigCls = i === 7 ? ' big' : '';
    const gotCls = got ? ' got' : '';
    slots.push(`<div class="bonus-slot${gotCls}${todayCls}${stampingCls}${bigCls}"><span class="d">第${i}天</span>${got ? stickerSvg(type) : (i === 7 ? '？' : i)}</div>`);
  }
  const gridEl = $('#bonus-grid');
  if (gridEl) gridEl.innerHTML = slots.join('');

  const noteEl = $('#bonus-note');
  if (noteEl) {
    noteEl.textContent = res.slot === 7
      ? '恭喜连续签到 7 天！特别印章已达成！'
      : `再签到 ${7 - res.slot} 天即可获得特别印章`;
  }

  const okBtn = $('#bonus-ok');
  if (okBtn) okBtn.textContent = isManual ? '我知道啦' : '立即领取';

  audio.unlock();
  dialog.showModal();

  if (!isManual && !S.reduced) {
    setTimeout(() => {
      if (!S.bonusOpen) return;
      const el = $('#bonus-grid .today');
      if (!el) return;
      const c = centerOf(el);
      audio.play('blip', audio.now(), { m: 84, v: 0.12 });
      audio.unit(res.slot === 7 ? 1 : 0.4);
      fx.burst(c.x, c.y, {
        count: res.slot === 7 ? 60 : 24,
        kinds: ['star', 'confetti', ...(res.slot === 7 ? ['coin', 'heart'] : [])],
        speed: res.slot === 7 ? 700 : 380,
        up: 150,
      });
      if (homeActors[2]) bounce(homeActors[2], { big: res.slot === 7, audio });
    }, 700);
  }

  okBtn?.focus({ preventScroll: true });
}

function closeBonus() {
  const dialog = $('#bonus-dialog');
  if (dialog?.open) dialog.close();
  S.bonusOpen = false;
  playClickSound('primary');
  renderCalendar();
  updateActionBadges();
  persist();

  const newlyEarned = checkTrophies();
  if (newlyEarned.length) {
    persist();
    if ($('#trophy-badge')) $('#trophy-badge').textContent = `${getEarnedTrophiesCount(saved.trophies)} / ${TROPHIES.length}`;
    setTimeout(() => {
      showEarnedTrophies();
    }, 280);
  }
}

function claimAndOpenBonus() {
  const res = S.pendingLoginBonus || claimLogin(saved.bonus, saved.calendar, new Date());
  if (res) {
    S.pendingLoginBonus = res;
    persist();
    openBonus(res, { isManual: false });
  }
}

function checkLoginBonus() {
  if (S.demo || S.screen !== 'home' || S.bonusOpen) return;
  if (saved.bonus?.last === dayKey()) return;
  const hammerDialog = $('#hammer-dialog');
  if (hammerDialog?.open) return;
  const guideDialog = $('#guide-dialog');
  if (guideDialog?.open) return;
  const settingsDialog = $('#settings-dialog');
  if (settingsDialog?.open) return;

  clearTimeout(bonusTimer);
  bonusTimer = setTimeout(() => {
    if (S.demo || S.screen !== 'home' || S.bonusOpen) return;
    if (saved.bonus?.last === dayKey()) return;
    const h = $('#hammer-dialog');
    if (h?.open) return;
    claimAndOpenBonus();
  }, 500);
}

function renderTrophiesModal(filter = 'all') {
  const dialog = $('#trophy-dialog');
  if (!dialog) return;
  $$('.tr-filter button').forEach(button => button.classList.toggle('active', button.dataset.f === filter));

  const earned = getEarnedTrophiesCount(saved.trophies);
  if ($('#trophy-count')) $('#trophy-count').textContent = `${earned} / ${TROPHIES.length}`;

  const container = $('#tr-list');
  if (!container) return;

  const got = saved.trophies?.got || {};
  let list = TROPHIES;
  if (filter === 'got') list = TROPHIES.filter((t) => got[t.id]);
  else if (filter === 'next') list = TROPHIES.filter((t) => !got[t.id]);

  container.innerHTML = list.map((t) => {
    const isGot = Boolean(got[t.id]);
    return `<div class="tr-card rank-${t.rank} ${isGot ? 'got' : 'locked'}">
      <div class="tr-card-icon">${isGot ? trophySvg(t.rank) : '<svg viewBox="-16 -16 32 32" class="tr-lock-svg"><rect x="-7" y="-2" width="14" height="12" rx="2.5" fill="#e2d8ce" stroke="#302238" stroke-width="2"/><path d="M-4.5 -2 V-7 C-4.5 -9.5 4.5 -9.5 4.5 -7 V-2" fill="none" stroke="#302238" stroke-width="2.2" stroke-linecap="round"/><circle cx="0" cy="4" r="1.3" fill="#302238"/></svg>'}</div>
      <div class="tr-card-info">
        <b>${t.name} <small>(${RANK_NAMES[t.rank] || ''})</small></b>
        <small>${t.desc}</small>
      </div>
      <span class="tr-card-status">${isGot ? '已达成' : '未解锁'}</span>
    </div>`;
  }).join('');
}

function showDayLog(dateStr) {
  const records = (saved.history || []).filter((h) => h.day === dateStr);
  if (!records.length) return;
  const dialog = $('#day-log-dialog');
  if (!dialog) return;
  if ($('#day-title')) $('#day-title').textContent = `${dateStr} 研习记录`;
  if ($('#day-list')) {
    $('#day-list').innerHTML = records.map((r, i) => {
      const modeName = MODES[r.mode]?.label || '成语练习';
      const levelName = r.kind === 'review' ? '错题复习' : MODES[r.mode]?.levels?.find((l) => l.id === r.level)?.name || '';
      const count = r.total == null ? `${r.solved ?? 0} 题` : `${r.solved}/${r.total} 题`;
      const duration = r.timeMs == null ? '' : ` · 用时 ${Math.round(r.timeMs / 1000)} 秒`;
      return `<li>
        <div><span>第 ${i + 1} 轮 · ${modeName} ${levelName}</span>
          <small>答对 ${count} · 独立答对 ${r.firstTry ?? 0} · 差一点 ${r.misses ?? 0} · ${r.combo ?? 0} 连击${duration}</small></div>
        <b class="dl-score">${r.score} 分</b>
      </li>`;
    }).join('');
  }
  dialog.showModal();
}

function refreshHome() {
  $('#levels').innerHTML = mode.levels.map((l) => {
    const total = mode.questions.filter((q) => q.level === l.id).length;
    const learned = mode.questions.filter((q) => q.level === l.id && saved.learned.includes(q.id)).length;
    return `<button class="level-card${saved.recommended === l.id ? ' recommended' : ''}" data-level="${l.id}"><span class="level-icon" aria-hidden="true">${softieSVG(l.color)}</span><span><strong>${l.name}${saved.recommended === l.id ? '<em>推荐起点</em>' : ''}</strong><small>${l.label}</small></span><span class="level-count" aria-label="已认识 ${learned} 道，共 ${total} 道"><b>${learned}</b> / ${total}</span></button>`;
  }).join('');
  $('#start-label').textContent = saved.recommended ? copy.stationStart.replace('{name}', levelInfo(saved.recommended).name) : copy.placement;
  $('#start-note').textContent = saved.recommended ? `每轮 ${mode.rules.roundSize} 题 · 每题 ${questionSeconds(mode, saved.recommended)} 秒` : `先玩 ${mode.levels.length * mode.rules.placementPerLevel} 题，找到适合你的难度`;
  $('#review-count').textContent = saved.review.length;
  $('#start-review').disabled = !saved.review.length;
  $('#retest').hidden = !saved.recommended;
  $('#home-progress').textContent = saved.learned.length ? `已经认识 ${saved.learned.length} / ${mode.questions.length} 个成语 · 完成 ${saved.rounds} 轮` : copy.footer;

  // Re-evaluate existing progress after catalogue updates without dropping old records.
  const newlyEarned = evaluateTrophies(saved.trophies, extractTrophyMetrics({
    ...saved, streak: bestStreak(saved.history, saved.calendar.nocount),
  }), Date.now());
  if (newlyEarned.length) persist();
  const earned = getEarnedTrophiesCount(saved.trophies);
  if ($('#trophy-badge')) $('#trophy-badge').textContent = `${earned} / ${TROPHIES.length}`;

  renderQuests();
  renderCalendar();
  checkHammer();
  checkLoginBonus();
}
function home() {
  cancelRun(); S.demo = false; S.E = .02;
  setShowLevel();
  fx.parts = []; fxBack.parts = [];
  if (saved.settings?.sound && !audio.muted) {
    startHomeMusic();
  } else {
    audio.stopMusic();
  }
  $('#open-settings').disabled = false;
  refreshHome(); showScreen('home'); $('#start-placement').focus({ preventScroll: true });
}
function start(kind = 'level', level = saved.recommended || mode.levels[0].id) {
  cancelRun(); audio.unlock();
  updateDailyQuests();
  let questions;
  if (kind === 'placement') questions = placementRound(Math.random, mode);
  else if (kind === 'review') questions = shuffle(mode.questions.filter((q) => saved.review.includes(q.id))).slice(0, mode.rules.roundSize);
  else if (kind === 'demo') questions = mode.levels.flatMap((l) => makeRound(l.id, { mode, count: mode.rules.demoPerLevel }));
  else questions = makeRound(level, { mode, seen: saved.learned });
  if (!questions.length) { home(); return; }
  Object.assign(S, { questions, kind, level, qi: 0, step: 0, combo: 0, peak: 0, misses: 0, playMs: 0, energy: 0, shownEnergy: 0, energyUnit: 0, E: .08, results: [], demo: kind === 'demo', phase: 'answer', demoSlipped: false });
  actors.forEach((a) => { a.hidden = true; });
  $('#open-settings').disabled = S.demo;
  $('#play-title').textContent = S.demo ? '跟着气泡小队玩一轮' : kind === 'placement' ? '测测起点 · 不用紧张' : kind === 'review' ? '再练一练' : `${levelInfo(level).name}${copy.stationSuffix}`;
  $('#demo-banner').hidden = !S.demo;
  $('#exit-game').hidden = S.demo;
  $('#pips').innerHTML = questions.map(() => '<span class="pip"></span>').join('');
  audio.key = 0; audio.startMusic(); audio.jingle();
  showScreen('play'); setupQuestion();
}
function updateEnergy() {
  $('#energy-value').textContent = S.energy ? displayEnergy(S.shownEnergy) : '0';
  $('#energy-fill').style.width = `${Math.min(100, S.energy / 3 * 100)}%`;
  $('#combo').textContent = S.combo;
  $('#combo-mult').textContent = `能量 ×${(1 + Math.min(1, S.combo / 20)).toFixed(2)}`;
  $('#combo-fill').style.transform = `scaleX(${Math.min(1, S.combo / 20)})`;
  $('#combo-box').classList.toggle('hot', S.combo >= 5);
  $('#combo-box').setAttribute('aria-label', `${S.combo} 连击，能量倍率 ${(1 + Math.min(1, S.combo / 20)).toFixed(2)}`);
  $('#hud-solved').textContent = S.results.filter((r) => r.completed).length;
  $('#hud-total').textContent = S.questions.length;
  $('#hud-misses').textContent = S.misses;
}
function setupQuestion() {
  const q = activeQuestion();
  Object.assign(S, { step: 0, firstTry: true, stepMisses: 0, questionMisses: S.misses, phase: 'answer', ready: true });
  S.timeLeft = questionSeconds(mode, q.level) * 1000; S.clockAt = performance.now(); S.lastTick = null;
  $('#next-question').disabled = false;
  updateTimer();
  S.E = energyAt(S.qi, S.questions.length);
  const music = musicAt(S.E);
  audio.setLevel(music.level, music.bpm);
  setShowLevel();
  audio.key = S.qi === S.questions.length - 1 ? 2 : 0;
  $('#question-number').textContent = `${String(S.qi + 1).padStart(2, '0')} / ${String(S.questions.length).padStart(2, '0')}`;
  $('#level-tag').textContent = `${levelInfo(q.level).name} · ${q.blanks.length === 1 ? '单字' : '双字'}填空`;
  $('#blank-count').textContent = `选${q.blanks.length === 1 ? '一个' : '两个'}字`;
  const [before, after] = q.context.split('____');
  $('#context').replaceChildren(document.createTextNode(before), Object.assign(document.createElement('em'), { textContent: '（　　　　）' }), document.createTextNode(after));
  $('#word-slots').innerHTML = [...q.word].map((char, i) => `<div class="word-cell${q.blanks.includes(i) ? ' blank' : ''}" data-index="${i}" aria-label="${q.blanks.includes(i) ? `第 ${i + 1} 字待填` : char}">${q.blanks.includes(i) ? '?' : char}</div>`).join('');
  $('#feedback').textContent = copy.ready;
  $('#stamp').replaceChildren();
  $('#answer-area').hidden = false; $('#explanation').hidden = true; $('#hint').hidden = true;
  $('#show-hint').disabled = S.demo; $('#skip-question').hidden = S.kind !== 'placement';
  $$('.pip').forEach((p, i) => {
    p.classList.toggle('now', i === S.qi); p.classList.toggle('done', i < S.qi);
    p.style.setProperty('--pip-color', ['#5278ff', '#52dfb5', '#ff6b8b', '#ffcf3f'][Math.min(3, Math.floor(energyAt(i, S.questions.length) * 4.5))]);
    p.classList.toggle('rainbow', i < S.qi && energyAt(i, S.questions.length) > .85);
  });
  $('#pips').setAttribute('aria-label', `已完成 ${S.qi} 题，共 ${S.questions.length} 题`);
  updateEnergy(); renderChoices();
  if (!reduced()) {
    const card = $('#question-card');
    card.animate(S.E < .4 ? [{ opacity: 0, transform: 'translateX(60px) rotate(3deg)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 0, transform: 'translateY(-100px) rotate(-8deg) scale(.8)' }, { opacity: 1, transform: 'scale(1.04,.96)', offset: .75 }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'ease-out' });
    if (S.E > .35) { const c = centerOf(card); fx.puff(c.x - c.w / 2, c.y + c.h / 2, 5); fx.puff(c.x + c.w / 2, c.y + c.h / 2, 5); audio.land(); }
    if (S.E > .22) cutin(S.qi === S.questions.length - 1 ? '最后一题！' : `第 ${S.qi + 1} 题`);
  }
  if (S.demo) scheduleDemo();
}
function renderChoices() {
  const q = activeQuestion();
  const blank = q.blanks[S.step];
  $$('.word-cell').forEach((el, i) => el.classList.toggle('active', i === blank));
  $('#word-slots').setAttribute('aria-label', [...q.word].map((char, i) => q.blanks.indexOf(i) >= S.step && q.blanks.includes(i) ? `第${i + 1}字空缺` : char).join('，'));
  $('#choices').innerHTML = optionsFor(q, S.step, Math.random, mode).map((char, i) => `<button class="choice" data-char="${char}" aria-label="选 ${char}，快捷键 ${i + 1}"><small aria-hidden="true">${i + 1}</small>${char}</button>`).join('');
  $('#choices').classList.remove('busy');
  const team = actors.filter((a) => !a.hidden);
  actors.forEach((a) => a.classList.toggle('active-actor', a === team[(S.qi + S.step) % team.length]));
  $('#actor-caption').textContent = q.blanks.length > 1 ? `第 ${S.step + 1} 个空格 · 气泡接力中` : copy.stageReady;
  if (S.step > 0 && S.E > .4) { audio.setReach(true); document.body.classList.add('reach'); $('#actor-caption').textContent = '再一个字，就完整啦！'; }
}
async function choose(button, automated = false) {
  if (!S.ready || S.screen !== 'play' || S.phase !== 'answer' || paused() || (S.demo && !automated) || button.disabled) return;
  const run = S.run; const q = activeQuestion(); const step = S.step;
  const valid = () => S.run === run && S.screen === 'play' && activeQuestion() === q;
  const correct = button.dataset.char === q.word[q.blanks[step]];
  const slot = $$('.word-cell')[q.blanks[step]];
  S.ready = false; $('#choices').classList.add('busy');
  audio.unlock(); audio.keyTap(S.combo);
  try {
    await bubbleHit($('.active-actor'), button, slot, { correct, reduced: reduced(), layer: $('#bubble-layer'), fx, audio, valid, motion: () => !reduced() });
    if (!valid()) return;
    if (correct) {
      slot.textContent = button.dataset.char;
      slot.setAttribute('aria-label', button.dataset.char);
      slot.classList.remove('active', 'blank'); slot.classList.add('ok'); button.classList.add('picked');
      S.combo += 1; S.peak = Math.max(S.peak, S.combo);
      const prevEnergy = S.energy;
      S.energy = gainEnergy(S.energy, S.qi, step, q.blanks.length, S.questions.length, S.combo);
      updateEnergy();
      const c = centerOf(slot);
      if (step + 1 < q.blanks.length) audio.correct(S.combo, S.E);
      if (!reduced()) {
        slot.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
        correctParticles(fx, fxBack, S.E, c.x, c.y);
        if (S.E > .5) S.shake = Math.max(S.shake, 2 + 3 * S.E);
        if (S.E > .12) fx.text(c.x, c.y - 30, `+${Math.max(1, Math.round(10 ** S.energy - 10 ** prevEnergy))}`, { color: '#8fd3ff', size: 16 + 10 * S.E, vy: -120 });
        actors.filter((a) => !a.hidden).forEach((a) => bounce(a, { big: S.E > .7 }));
      }
      S.step += 1; S.stepMisses = 0; $('#hint').hidden = true;
      $('#feedback').textContent = copy.correct;
      if (S.combo > 0 && S.combo % 5 === 0) cutin(`${S.combo} 连击！`);
      if (S.step >= q.blanks.length) completeQuestion();
      else { renderChoices(); S.ready = true; if (S.demo) scheduleDemo(); }
    } else {
      S.firstTry = false; S.misses += 1; S.combo = 0; S.stepMisses += 1;
      audio.wrong(S.E); updateEnergy();
      if (!reduced()) {
        const actor = $('.active-actor'); const c = centerOf(actor);
        actor.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.4,.55) rotate(-12deg)' }, { transform: 'translateY(-18px) scale(.8,1.2)' }, { transform: 'none' }], { duration: 620, easing: 'ease-out' });
        fx.burst(c.x, c.y - 20, { count: 10, kinds: ['star'], speed: 220, up: 60 });
        fx.ring(c.x, c.y, { color: '#fff', radius: 60, width: 7 });
        if (S.E > .5) { S.shake = Math.max(S.shake, 8); S.flash = Math.max(S.flash, .12); }
      }
      button.disabled = true; button.classList.add('rejected');
      $('#feedback').textContent = `${copy.wrong} 这个字不是「${button.dataset.char}」。`;
      slot.classList.remove('bad'); void slot.offsetWidth; slot.classList.add('bad');
      $('#choices').classList.remove('busy'); S.ready = true;
      if (S.stepMisses >= 2) hint();
      if (S.demo) scheduleDemo();
    }
  } catch (err) {
    if (valid()) { S.ready = true; $('#choices').classList.remove('busy'); $('#feedback').textContent = '气泡没跟上，再点一次试试。'; }
    console.error(err);
  }
}
function hint() {
  if (!S.ready || S.phase !== 'answer') return;
  S.firstTry = false;
  $('#hint').textContent = `想一想：${activeQuestion().meaning}`; $('#hint').hidden = false;
  $('#feedback').textContent = '用了提示也没关系，读懂意思最重要。';
  if (S.stepMisses >= 3) $$('.choice').find((b) => b.dataset.char === activeQuestion().word[activeQuestion().blanks[S.step]])?.classList.add('hint-choice');
}
function completeQuestion(skipped = false, timedOut = false) {
  const q = activeQuestion();
  S.phase = 'explain'; S.ready = false;
  const firstTry = S.firstTry && !skipped;
  S.results.push({ id: q.id, level: q.level, firstTry, completed: !skipped });
  recordAnswer(saved, q, firstTry, { demo: S.demo, placement: S.kind === 'placement' });
  if (!S.demo && S.kind !== 'placement') {
    saved.stats.problems = (saved.stats.problems || 0) + (skipped ? 0 : 1);
    if (firstTry) saved.stats.firstTry = (saved.stats.firstTry || 0) + 1;
    if (S.kind === 'review' && firstTry) saved.stats.reviewSolved = (saved.stats.reviewSolved || 0) + 1;
    saved.stats.misses += S.misses - S.questionMisses;
    saved.stats.maxCombo = Math.max(saved.stats.maxCombo || 0, S.combo);

    const thinkingMs = questionSeconds(mode, q.level) * 1000 - S.timeLeft;
    if (firstTry && thinkingMs <= 5000) saved.stats.flags.speedy = true;
    const energy = Math.round(10 ** S.energy);
    if (energy >= 1000) saved.stats.flags.energy = true;

    updateDailyQuests({
      type: 'solve',
      firstTry,
      review: S.kind === 'review',
      combo: S.combo,
      energy,
    });

    checkTrophies();
    persist();
  }
  const reach = audio.reach; audio.setReach(false);
  document.body.classList.remove('reach');
  if (!skipped) {
    if (reach) audio.reachHit(S.E); else audio.clear(S.E);
    celebrate(reach); drawStamp();
  } else {
    S.combo = 0; updateEnergy();
    $$('.word-cell').forEach((el, i) => { el.textContent = q.word[i]; el.setAttribute('aria-label', q.word[i]); el.classList.remove('active', 'blank'); });
  }
  $('#word-slots').setAttribute('aria-label', q.word);
  $$('.pip')[S.qi].classList.replace('now', 'done');
  $$('.pip')[S.qi].classList.toggle('rainbow', S.E > .85);
  updateEnergy();
  $('#pips').setAttribute('aria-label', `已完成 ${S.qi + 1} 题，共 ${S.questions.length} 题`);
  $('#actor-caption').textContent = skipped ? '一起认识这个新成语' : '泡泡小队，为你欢呼';
  $('#feedback').textContent = timedOut ? '时间到！读懂这个成语，下一题再挑战。' : skipped ? '还没学过也没关系，先认识它。' : copy.finished;
  updateTimer();
  $('#answer-area').hidden = true; $('#explanation').hidden = false;
  $('#answer-word').textContent = q.word; $('#meaning').textContent = q.meaning;
  $('#example').textContent = `试着读一读：${q.context.replace('____', q.word)}`;
  $('#next-question').textContent = S.qi === S.questions.length - 1 ? '这一轮完成啦 →' : '记住啦，下一题 →';
  if (!S.demo) $('#next-question').focus({ preventScroll: true });
  if (S.qi === S.questions.length - 1 && !skipped) playFinale();
  else if (S.demo) later(() => demoNext(), 2200);
}
function nextQuestion() {
  if (S.screen !== 'play' || S.phase !== 'explain' || paused()) return;
  if (S.qi + 1 >= S.questions.length) finish();
  else { S.qi += 1; setupQuestion(); }
}
function updateTimer() {
  const active = S.phase === 'answer';
  const seconds = Math.ceil((S.timeLeft || 0) / 1000);
  $('#time-left').textContent = `${seconds}`;
  $('#timer-label').textContent = active ? '剩余' : '已暂停';
  $('#question-timer').classList.toggle('hurry', active && seconds <= 5);
  $('#question-timer').setAttribute('aria-label', active ? `本题还剩 ${seconds} 秒` : '阅读解释，倒计时已暂停');
  $('#time-fill').style.transform = `scaleX(${Math.max(0, S.timeLeft || 0) / (questionSeconds(mode, activeQuestion()?.level) * 1000)})`;
}
function tickTimer(t) {
  const elapsed = S.clockAt == null ? 0 : t - S.clockAt;
  S.clockAt = t;
  if (S.screen !== 'play') return;
  if (!paused()) S.playMs += Math.max(0, elapsed);
  const active = S.phase === 'answer' && S.ready && !paused();
  S.timeLeft = countdown(S.timeLeft, elapsed, active);
  updateTimer();
  if (!active) return;
  const seconds = Math.ceil(S.timeLeft / 1000);
  if (seconds > 0 && seconds <= 5 && seconds !== S.lastTick) { S.lastTick = seconds; audio.tick(seconds <= 1); }
  if (S.timeLeft <= 0) {
    S.firstTry = false; S.misses += 1; audio.wrong(S.E);
    completeQuestion(true, true);
  }
}
// All delayed show work belongs to this run. A cancelled scene cannot affect
// a later question, home screen, or the user's reduced-motion preference.
function showTween(el, duration, draw, ease) {
  const run = S.run;
  const question = activeQuestion();
  return tween(duration, (k) => { if (run === S.run && !reduced() && el.isConnected && (el.id !== 'question-card' || question === activeQuestion())) draw(k); }, ease);
}
function setShowLevel() {
  const level = S.screen === 'home' ? 0 : musicAt(S.E).level;
  for (let i = 0; i <= 10; i++) document.body.classList.toggle(`lv${i}`, i <= level);
  const count = reduced() ? 1 : crowdAt(S.E);
  actors.forEach((actor, i) => {
    const joining = actor.hidden && i < count;
    actor.hidden = i >= count;
    if (joining && !reduced()) actor.animate([
      { transform: `translate(${i % 2 ? -180 : 180}px,0) scale(.8)` },
      { transform: 'translate(0,-80px) scale(.9,1.1)', offset: .5 },
      { transform: 'none' },
    ], { duration: 520, easing: 'ease-out' });
  });
}
async function cutin(text) {
  if (reduced()) return;
  audio.cutin();
  const E = S.E; const r = $('.play-stage').getBoundingClientRect();
  const h = 58 + 26 * Math.min(1, E);
  const palettes = [['#3b6bff', '#5b8cff'], ['#ff7ab6', '#ff9ccc'], ['#ffb000', '#ffd23f'], ['#1b1d4d', '#3b3f8f']];
  const pal = palettes[Math.min(3, Math.floor(E * 3.6))];
  const el = Object.assign(document.createElement('div'), { className: 'cutin-band' });
  el.style.cssText = `top:${r.top + r.height / 2 - h / 2}px;height:${h}px;--c1:${pal[0]};--c2:${pal[1]}`;
  el.innerHTML = '<div class="band-bg"></div><div class="band-text"></div>';
  el.lastChild.textContent = text;
  $('#cutins').append(el);
  await showTween(el, 240, (k) => { el.style.transform = `translateX(${(1 - k) * 110}%) rotate(-6deg) scaleY(${.6 + .4 * k})`; }, easeOutBack);
  await wait(360 + 160 * E);
  await showTween(el, 200, (k) => { el.style.transform = `translateX(${-k * 110}%) rotate(-6deg)`; }, easeInCubic);
  el.remove();
}
function celebrate(big = false) {
  if (reduced()) return;
  const E = S.E; const c = centerOf($('#question-card')); const W = innerWidth; const H = innerHeight;
  const run = S.run;
  actors.filter((a) => !a.hidden).forEach((actor, i) => later(() => bounce(actor, { big: E > .5 || big, reduced: reduced(), spin: E > .5 && Math.random() < .5, audio: i === 0 ? audio : null, valid: () => run === S.run && !reduced() }), i * 60));
  celebrationParticles(fx, fxBack, E, big, c.x, c.y - c.h * .1, W, H);
  if (E > .5) S.flash = Math.max(S.flash, .25 * E);
  if (big) S.flash = 1;
  if (E > .74 || big) parade(E, big);
  S.shake = Math.max(S.shake, 3 + 9 * E + (big ? 6 : 0));
  showTween($('#question-card'), 260, (k) => { $('#question-card').style.transform = `scale(${1 + Math.sin(k * Math.PI) * .04 * E})`; });
}
function parade(E = S.E, big = false) {
  if (reduced() || $('.parade-actor')) return;
  const stage = $('.play-stage').getBoundingClientRect();
  const dir = Math.random() < .5 ? 1 : -1;
  const n = Math.round(3 + 4 * Math.min(1, E) + (big ? 2 : 0));
  for (let i = 0; i < n; i++) {
    const el = Object.assign(document.createElement('div'), { className: 'parade-actor' });
    el.innerHTML = softieSVG(['pink', 'blue', 'yellow', 'mint', 'violet'][i % 5], { happy: true });
    el.style.width = `${64 + rand(0, 24)}px`;
    const y = stage.top + rand(stage.height * .25, stage.height * .55);
    const x0 = dir > 0 ? -80 - i * 70 : innerWidth + 80 + i * 70;
    const x1 = dir > 0 ? innerWidth + 80 : -80;
    const hops = 5 + Math.floor(rand(0, 3)); const height = rand(30, 70);
    const spin = Math.random() < .25 ? 360 * dir : 0;
    $('#show-actors').append(el);
    showTween(el, hops * rand(300, 380), (k) => {
      const lift = Math.sin((k * hops % 1) * Math.PI);
      el.style.transform = `translate(${lerp(x0, x1, k)}px,${y - lift * height}px) rotate(${spin * k}deg) scale(${1 - lift * .12},${1 + lift * .12})`;
    }, (k) => k).then(() => el.remove());
  }
}
function drawStamp() {
  const E = S.E; const flower = E >= .45; const el = $('#stamp');
  let spiral = ''; let petals = '';
  for (let i = 0; i <= 90; i++) { const t = i / 90; const a = -1.9 + t * (flower ? 2.3 : 1.12) * Math.PI * 2; const r = flower ? 9 + t * 29 : 44 + t * 7 + Math.sin(t * 9) * 1.2; spiral += `${i ? 'L' : 'M'}${Math.cos(a) * r} ${Math.sin(a) * r}`; }
  for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; const b = (i + 1) / 11 * Math.PI * 2; const m = (a + b) / 2; petals += `${i ? '' : `M${Math.cos(a) * 45.24} ${Math.sin(a) * 45.24}`} Q${Math.cos(m) * 64.96} ${Math.sin(m) * 64.96} ${Math.cos(b) * 45.24} ${Math.sin(b) * 45.24}`; }
  const color = E > .85 ? 'url(#stamp-rainbow)' : '#ff4f6d';
  el.style.width = el.style.height = `${flower ? 150 : 110}px`; el.style.opacity = 1;
  el.innerHTML = `<svg viewBox="-70 -70 140 140"><defs><linearGradient id="stamp-rainbow" x2="1" y2="1"><stop stop-color="#ff4f6d"/><stop offset=".35" stop-color="#ffb000"/><stop offset=".65" stop-color="#3fdcb0"/><stop offset="1" stop-color="#3b6bff"/></linearGradient></defs><path d="${spiral}" fill="none" stroke="${color}" stroke-width="7.5" stroke-linecap="round"/>${flower ? `<path d="${petals}" fill="none" stroke="${color}" stroke-width="6.5" stroke-linecap="round"/>` : ''}</svg>`;
  const paths = [...el.querySelectorAll('path')];
  if (reduced()) return;
  const token = el.firstChild;
  paths.forEach((p) => { p.style.strokeDasharray = p.style.strokeDashoffset = p.getTotalLength(); });
  showTween(el, 260 + (flower ? 120 : 0), (k) => {
    if (el.firstChild !== token) return;
    paths.forEach((p, i) => { p.style.strokeDashoffset = p.getTotalLength() * (1 - (i ? Math.max(0, (k - .4) / .6) : Math.min(1, k * (flower ? 1.6 : 1)))); });
    el.style.transform = `rotate(${-20 + 20 * k}deg) scale(${1.3 - .3 * k})`;
  }).then(() => {
    if (E > .85) showTween(el, 900, (k) => { if (el.firstChild === token) el.style.transform = `rotate(${k * 360}deg)`; }, easeOutQuint);
  });
  later(() => { if (el.firstChild === token) el.style.opacity = 0; }, 1500);
}
async function unitSlam(value, finale = false) {
  if (reduced()) return;
  if (!finale) audio.unit(S.E);
  const box = $('.energy-row').getBoundingClientRect();
  const stage = $('.play-stage').getBoundingClientRect();
  const big = finale || (S.E > .45 && value !== 100);
  const el = Object.assign(document.createElement('div'), { className: 'unit-slam', textContent: String(value) });
  el.style.fontSize = `${finale ? Math.min(110, innerWidth * .26) : big ? 64 + 40 * S.E : 30}px`;
  if (finale) el.style.color = '#ff7ab6';
  $('#cutins').append(el);
  const x = big ? innerWidth / 2 : box.right - 45;
  const y = finale ? innerHeight * .2 : big ? stage.top + stage.height * .35 : box.bottom + 4;
  el.style.left = `${x - el.offsetWidth / 2}px`; el.style.top = `${y - el.offsetHeight / 2}px`;
  if (big && !finale) {
    fx.burst(x, y, { count: 30 + 40 * S.E, kinds: ['coin', 'star', 'spark'], speed: 600 });
    fx.ring(x, y, { color: '#ffd23f', radius: 180, width: 12 }); S.shake = Math.max(S.shake, 6);
  }
  await showTween(el, finale ? 320 : big ? 280 : 200, (k) => {
    el.style.transform = `scale(${lerp(finale ? 4 : big ? 3.2 : 1.8, 1, k)}) rotate(${lerp(-18, -4, k)}deg)`; el.style.opacity = Math.min(1, k * 2);
  }, easeOutBack);
  await wait(finale ? 1500 : big ? 520 : 400);
  await showTween(el, finale ? 300 : 260, (k) => {
    el.style.transform = finale ? `scale(${1 + k * .3}) rotate(-6deg)` : `translate(${(box.right - 45 - x) * k}px,${(box.top - y) * k}px) scale(${1 - .8 * k}) rotate(-4deg)`;
    el.style.opacity = 1 - k;
  }, easeInCubic);
  el.remove();
}
async function playFinale() {
  const run = S.run;
  const valid = () => run === S.run && S.screen === 'play';
  const visual = () => valid() && !reduced();
  S.phase = 'finale'; $('#next-question').disabled = true;
  audio.finale();
  await wait(120);
  if (!valid()) return;
  if (visual()) {
    S.flash = 1;
    finaleParticles(fx, fxBack, innerWidth, innerHeight);
    const giant = Object.assign(document.createElement('div'), { className: 'giant-softie' });
    giant.innerHTML = softieSVG('pink', { happy: true });
    $('#show-actors').append(giant);
    await showTween(giant, 700, (k) => { giant.style.transform = `translate(-50%,${(1 - k) * 110}%)`; }, easeOutBack);
    if (!valid()) return;
    if (visual()) { unitSlam(S.kind === 'placement' ? '出发！' : '100分', true); S.shake = 16; }
    for (let i = 0; i < 3; i++) {
      await showTween(giant, 260, (k) => { giant.style.transform = `translate(-50%,${-Math.sin(k * Math.PI) * 60}px) rotate(${Math.sin(k * Math.PI * 2) * 6}deg) scale(${1 + Math.sin(k * Math.PI) * .12},${1 - Math.sin(k * Math.PI) * .12})`; });
      if (!valid()) return;
    }
    if (visual()) parade(1, true);
    await wait(900);
    if (!valid()) return;
    if (visual()) finaleParticles(fx, fxBack, innerWidth, innerHeight, true);
    await showTween(giant, 500, (k) => { giant.style.transform = `translate(-50%,${k * 110}%)`; }, easeInCubic);
    giant.remove();
  } else await wait(800);
  if (!valid()) return;
  S.phase = 'explain'; $('#next-question').disabled = false;
  if (S.demo) later(demoNext, 800);
}
function finish() {
  const placement = S.kind === 'placement';
  if (placement) saved.recommended = recommendedLevel(S.results, mode);
  if (!S.demo) {
    if (!placement) {
      saved.rounds += 1;
      const todayStr = dayKey();
      saved.history.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        day: todayStr,
        at: Date.now(),
        score: 100,
        solved: S.results.filter((r) => r.completed).length,
        misses: S.misses,
        firstTry: S.results.filter((r) => r.firstTry).length,
        combo: S.peak,
        mode: mode.id,
        level: S.level,
        kind: S.kind,
        total: S.questions.length,
        timeMs: Math.round(S.playMs),
      });

      const firstTryCount = S.results.filter(r => r.firstTry && r.completed).length;
      if (firstTryCount === S.questions.length) {
        saved.stats.perfects = (saved.stats.perfects || 0) + 1;
      }
      saved.stats.playMs += Math.round(S.playMs);

      updateDailyQuests({
        type: 'round',
        score: 100,
        solved: S.results.filter((r) => r.completed).length,
        total: S.questions.length,
        firstTryCount,
      });

      const dayOfWeek = new Date().getDay();
      saved.stats.flags = saved.stats.flags || {};
      saved.stats.flags.firstPlay = true;
      if (dayOfWeek === 0 || dayOfWeek === 6) saved.stats.flags.weekend = true;
      const hour = new Date().getHours();
      if (hour >= 22 || hour < 6) saved.stats.flags.night = true;
      if (S.kind === 'level' && S.level === mode.levels.at(-1).id && S.results.every(r => r.completed)) saved.stats.flags.advanced = true;

      checkTrophies();
    }
    persist();
  }
  showScreen('result'); S.ready = false;
  audio.setReach(false);
  $('#result-eyebrow').textContent = S.demo ? '演示完成 · 没有写入学习记录' : placement ? '找到起点，快乐出发' : '泡泡小队，为你欢呼';
  $('#result-title').textContent = placement ? `从「${levelInfo(saved.recommended).name}」\n开始刚刚好。` : copy.resultTitle;
  $('#result-score').textContent = placement ? levelInfo(saved.recommended).name : '100';
  $('#score-label').textContent = placement ? '推荐起点' : '完成分';
  const first = S.results.filter((r) => r.firstTry).length;
  $('#result-summary').textContent = placement ? '这不是考试分数，只是一个起点建议。你仍然可以自由选择任何难度。' : `完成 ${S.questions.length} 道题，就值得满分庆祝。\n其中 ${first} 道没有用提示、一次就填对了。`;
  $('#result-details').innerHTML = `<div class="result-detail"><b>${S.results.length}</b><span>完成题目</span></div><div class="result-detail"><b>${S.peak}</b><span>最高连击</span></div><div class="result-detail"><b>${S.energy ? displayEnergy(S.energy) : 0}</b><span>快乐能量</span></div>`;

  const rQuests = $('#r-quests');
  if (rQuests) {
    if (!S.demo && !placement && saved.quests?.list) {
      rQuests.innerHTML = `<div class="qm-head"><span>今日委托进度</span><span class="quest-reward"><span class="qham">${HAMMER_SVG}</span></span></div>
        <ol class="quest-list">
          ${saved.quests.list.map((q) => {
            const pct = Math.min(100, Math.round((q.prog / q.goal) * 100));
            return `<li class="${q.done ? 'done' : ''}">
              <span class="qchk">${q.done ? '✓' : ''}</span>
              <span class="qt">${questText(q)}</span>
              <span class="qp">${q.prog}/${q.goal}</span>
              <div class="qbar"><div class="qbar-fill" style="width:${pct}%"></div></div>
            </li>`;
          }).join('')}
        </ol>`;
      rQuests.hidden = false;
    } else {
      rQuests.hidden = true;
    }
  }

  $('#result-start').textContent = placement ? `去${levelInfo(saved.recommended).name}${copy.stationSuffix} →` : S.demo ? '我也来试试 →' : '再来一轮 →';
  $('#result-review').hidden = S.demo || placement || !saved.review.length;
  $('#result-home').textContent = copy.home;
  if (!reduced()) {
    resultActors.forEach((a, i) => later(() => bounce(a, { big: true, reduced: reduced() }), i * 130));
  }
  $('#result-title').focus({ preventScroll: true });
  later(() => audio.stopMusic(), 4000);

  if (S.earnedTrophies.length) later(showEarnedTrophies, 1200);

  if (S.demo) later(() => { if (paused()) return demoReturn(); home(); }, 5500);
}
function demoReturn() { later(() => { if (paused()) demoReturn(); else home(); }, 500); }
function scheduleDemo() {
  later(() => {
    if (paused()) { scheduleDemo(); return; }
    if (!S.demo || !S.ready) return;
    const q = activeQuestion(); const correct = q.word[q.blanks[S.step]];
    const buttons = $$('.choice').filter((b) => !b.disabled);
    const miss = S.qi === 1 && S.step === 0 && !S.demoSlipped;
    if (miss) S.demoSlipped = true;
    const button = buttons.find((b) => miss ? b.dataset.char !== correct : b.dataset.char === correct);
    if (button) choose(button, true);
  }, 950);
}
function demoNext() { if (paused()) later(demoNext, 500); else nextQuestion(); }

// Presentation copy belongs to the mode; audience switching starts a fresh run.
document.body.dataset.mode = mode.theme;
if ($('#title-lead')) $('#title-lead').textContent = copy.titleLead;
if ($('#title-accent')) $('#title-accent').textContent = copy.titleAccent;
document.title = `软乎乎 · ${copy.titleLead}${copy.titleAccent}`;
$('#brand-slime').innerHTML = softieSVG();
$('.brand small').textContent = copy.tagline;
if ($('#home .eyebrow')) $('#home .eyebrow').textContent = copy.eyebrow;
$('.intro').textContent = copy.intro;
$('.section-label h2').textContent = copy.levelHeading;
$('.explain-heading span').textContent = copy.learned;
$('#mode-disclaimer').textContent = copy.disclaimer;
$('#settings-softie').innerHTML = softieSVG('pink', { happy: true });
$('#timing-chips').innerHTML = mode.levels.map((l) => `<span>${l.name}<b>${questionSeconds(mode, l.id)}秒</b></span>`).join('');

function initLogoBurst() {
  const star = (R, r, n, jitter = 0, seed = 1) => {
    let d = ''; let s0 = seed;
    const rnd = () => { s0 = (s0 * 9301 + 49297) % 233280; return s0 / 233280; };
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = (i % 2 ? r : R) * (1 + (rnd() - 0.5) * jitter);
      d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`;
    }
    return `${d}Z`;
  };
  const path = $('#logo-burst-path');
  const inner = $('#logo-burst-inner');
  if (path) path.setAttribute('d', star(96, 66, 14, 0.14, 7));
  if (inner) inner.setAttribute('d', star(70, 52, 14, 0.1, 3));
}
initLogoBurst();

const modeSelect = $('#mode-select');
if (modeSelect) {
  modeSelect.innerHTML = Object.values(MODES).map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
  modeSelect.value = mode.id;
  modeSelect.addEventListener('change', () => setAudienceMode(modeSelect.value, false));
}

function syncModePills() {
  $$('.mode-pill').forEach((btn) => {
    const active = btn.dataset.mode === mode.id;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}
syncModePills();

function updateAudienceUI() {
  document.body.dataset.mode = mode.theme;
  if ($('#title-lead')) $('#title-lead').textContent = copy.titleLead;
  if ($('#title-accent')) $('#title-accent').textContent = copy.titleAccent;
  document.title = `软乎乎 · ${copy.titleLead}${copy.titleAccent}`;
  if ($('.brand small')) $('.brand small').textContent = copy.tagline;
  if ($('#home .eyebrow')) $('#home .eyebrow').textContent = copy.eyebrow;
  if ($('.intro')) $('.intro').textContent = copy.intro;
  if ($('.section-label h2')) $('.section-label h2').textContent = copy.levelHeading;
  if ($('.explain-heading span')) $('.explain-heading span').textContent = copy.learned;
  if ($('#mode-disclaimer')) $('#mode-disclaimer').textContent = copy.disclaimer;
  if ($('#logo-bit-1') && copy.logoBits) $('#logo-bit-1').textContent = copy.logoBits[0];
  if ($('#logo-bit-2') && copy.logoBits) $('#logo-bit-2').textContent = copy.logoBits[1];
  if ($('#timing-chips')) $('#timing-chips').innerHTML = mode.levels.map((l) => `<span>${l.name}<b>${questionSeconds(mode, l.id)}秒</b></span>`).join('');
}
updateAudienceUI();

function setAudienceMode(newModeId, playFx = true) {
  if (mode.id === newModeId) return;
  cancelRun();
  pendingHammer = null;
  try { storage?.setItem('softie-idioms:active-mode', newModeId); } catch {}
  mode = getMode(newModeId);
  copy = mode.copy;
  saved = loadSave(storage, mode);

  const url = new URL(location.href);
  url.searchParams.set('mode', newModeId);
  url.searchParams.delete('demo');
  history.replaceState(null, '', url);

  if (modeSelect) modeSelect.value = mode.id;
  syncModePills();
  updateAudienceUI();
  applySettings();
  refreshHome();

  if (playFx) {
    audio.unlock();
    playClickSound('tab');
    const toggleEl = $('#mode-toggle');
    if (toggleEl) {
      const rect = toggleEl.getBoundingClientRect();
      fx.puff(rect.left + rect.width / 2, rect.top + rect.height / 2, 8);
    }
  }
}

$('#mode-toggle')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-pill');
  if (btn && btn.dataset.mode) setAudienceMode(btn.dataset.mode, true);
});
$('.brand').addEventListener('click', (e) => {
  e.preventDefault();
  playClickSound('bubble');
  if (S.screen === 'play' && !S.demo) $('#leave-dialog').showModal();
  else home();
});
$('#levels').addEventListener('click', (e) => {
  const b = e.target.closest('[data-level]');
  if (b) {
    playClickSound('primary');
    start('level', Number(b.dataset.level));
  }
});
$('#start-placement').addEventListener('click', () => {
  playClickSound('primary');
  start(saved.recommended ? 'level' : 'placement');
});
$('#retest').addEventListener('click', () => {
  playClickSound('primary');
  start('placement');
});
$('#start-review').addEventListener('click', () => {
  playClickSound('primary');
  start('review');
});
$('#start-demo').addEventListener('click', () => {
  playClickSound('primary');
  start('demo');
});
$('#open-trophy')?.addEventListener('click', () => {
  playClickSound('bubble');
  renderTrophiesModal('all');
  $('#trophy-dialog')?.showModal();
});
$('#close-trophy')?.addEventListener('click', () => {
  playClickSound('back');
  $('#trophy-dialog')?.close();
});
$('.tr-filter')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn && btn.dataset.f) {
    playClickSound('tab');
    $$('.tr-filter button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    renderTrophiesModal(btn.dataset.f);
  }
});
$('#tg-ok')?.addEventListener('click', () => {
  playClickSound('primary');
  $('#trophy-got-dialog')?.close();
});
$('#close-tg')?.addEventListener('click', () => {
  playClickSound('back');
  $('#trophy-got-dialog')?.close();
});
$('#trophy-got-dialog')?.addEventListener('click', (e) => {
  if (e.target === $('#trophy-got-dialog')) {
    playClickSound('back');
    $('#trophy-got-dialog').close();
  }
});
$('#cal-prev')?.addEventListener('click', () => {
  playClickSound('tab');
  if (calMonth === 0) { calMonth = 11; calYear -= 1; }
  else { calMonth -= 1; }
  renderCalendar();
});
$('#cal-next')?.addEventListener('click', () => {
  playClickSound('tab');
  if (calMonth === 11) { calMonth = 0; calYear += 1; }
  else { calMonth += 1; }
  renderCalendar();
});
$('#cal-grid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-day]');
  if (btn && btn.dataset.day) {
    playClickSound('bubble');
    showDayLog(btn.dataset.day);
  }
});
$('#close-day')?.addEventListener('click', () => {
  playClickSound('back');
  $('#day-log-dialog')?.close();
});
$('#hammer-yes')?.addEventListener('click', () => {
  playClickSound('primary');
  if (pendingHammer?.mode === mode.id && pendingHammer.day === dayKey()
    && useHammer(saved.calendar, saved.history, pendingHammer.missed, new Date())) {
    saved.stats.flags.hammerUsed = true;
    checkTrophies();
    persist();
    renderCalendar();
    $('#trophy-badge').textContent = `${getEarnedTrophiesCount(saved.trophies)} / ${TROPHIES.length}`;
  }
  pendingHammer = null;
  $('#hammer-dialog')?.close();
  showEarnedTrophies();
  checkLoginBonus();
});
$('#hammer-no')?.addEventListener('click', () => {
  playClickSound('back');
  pendingHammer = null;
  $('#hammer-dialog')?.close();
  checkLoginBonus();
});
$('#hammer-dialog')?.addEventListener('cancel', () => {
  pendingHammer = null;
  checkLoginBonus();
});
$('#open-guide')?.addEventListener('click', () => {
  playClickSound('bubble');
  audio.unlock();
  $('#guide-dialog')?.showModal();
});
$('#close-guide')?.addEventListener('click', () => {
  playClickSound('back');
  $('#guide-dialog')?.close();
});
$('#guide-confirm')?.addEventListener('click', () => {
  playClickSound('primary');
  $('#guide-dialog')?.close();
});
$('#open-quests')?.addEventListener('click', () => {
  playClickSound('bubble');
  audio.unlock();
  renderQuests();
  $('#quests-dialog')?.showModal();
});
$('#close-quests')?.addEventListener('click', () => {
  playClickSound('back');
  $('#quests-dialog')?.close();
});
$('#quests-confirm')?.addEventListener('click', () => {
  playClickSound('primary');
  $('#quests-dialog')?.close();
});
$('#quests-dialog')?.addEventListener('click', (e) => {
  if (e.target === $('#quests-dialog')) {
    playClickSound('back');
    $('#quests-dialog').close();
  }
});
$('#open-calendar')?.addEventListener('click', () => {
  playClickSound('bubble');
  audio.unlock();
  renderCalendar();
  $('#calendar-dialog')?.showModal();
});
$('#close-calendar')?.addEventListener('click', () => {
  playClickSound('back');
  $('#calendar-dialog')?.close();
});
$('#calendar-confirm')?.addEventListener('click', () => {
  playClickSound('primary');
  $('#calendar-dialog')?.close();
});
$('#calendar-dialog')?.addEventListener('click', (e) => {
  if (e.target === $('#calendar-dialog')) {
    playClickSound('back');
    $('#calendar-dialog').close();
  }
});
$('#open-bonus')?.addEventListener('click', () => {
  playClickSound('bubble');
  audio.unlock();
  if (saved.bonus?.last !== dayKey()) {
    claimAndOpenBonus();
  } else {
    const slot = ((saved.bonus.run - 1) % 7) + 1;
    openBonus({
      run: saved.bonus.run,
      slot,
      type: saved.bonus.stickers?.[dayKey()] || STICKERS[slot - 1],
      total: saved.bonus.total,
    }, { isManual: true });
  }
});
$('#bonus-ok')?.addEventListener('click', () => {
  closeBonus();
});
$('#close-bonus')?.addEventListener('click', () => {
  closeBonus();
});
$('#bonus-dialog')?.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeBonus();
});
$('#bonus-dialog')?.addEventListener('click', (e) => {
  if (e.target === $('#bonus-dialog')) {
    closeBonus();
  }
});
$('#choices').addEventListener('click', (e) => { const b = e.target.closest('.choice'); if (b) choose(b); });
$('#show-hint').addEventListener('click', () => {
  playClickSound('bubble');
  hint();
});
$('#skip-question').addEventListener('click', () => {
  playClickSound('bubble');
  if (S.ready && !S.demo && S.kind === 'placement') completeQuestion(true);
});
$('#next-question').addEventListener('click', () => {
  playClickSound('primary');
  if (!S.demo) nextQuestion();
});
$('#exit-game').addEventListener('click', () => {
  playClickSound('bubble');
  $('#leave-dialog').showModal();
  $('#keep-playing').focus();
});
$('#keep-playing').addEventListener('click', () => {
  playClickSound('bubble');
  $('#leave-dialog').close();
});
$('#leave-confirm').addEventListener('click', () => {
  playClickSound('back');
  $('#leave-dialog').close();
  home();
});
$('#stop-demo').addEventListener('click', () => {
  playClickSound('back');
  home();
});
$('#result-home').addEventListener('click', () => {
  playClickSound('back');
  home();
});
$('#result-start').addEventListener('click', () => {
  playClickSound('primary');
  start(S.demo && !saved.recommended ? 'placement' : 'level', S.kind === 'placement' ? saved.recommended : S.level);
});
$('#result-review').addEventListener('click', () => {
  playClickSound('primary');
  start('review');
});
$('#open-settings').addEventListener('click', () => {
  if (S.screen !== 'home') return;
  playClickSound('bubble');
  audio.unlock();
  showScreen('settings');
  $('#settings-title').focus({ preventScroll: true });
});
$('#close-settings').addEventListener('click', () => {
  playClickSound('back');
  home();
});
$('#settings-demo').addEventListener('click', () => {
  playClickSound('primary');
  start('demo');
});
$('#volume-setting').addEventListener('input', (e) => {
  const v = Number(e.target.value) / 100;
  saved.settings.volume = v;
  e.target.style.setProperty('--v', v);
  audio.setVolume(saved.settings.volume);
  $('#volume-value').textContent = `${e.target.value}%`;
  if (saved.settings?.sound && !audio.muted) {
    audio.unlock();
    audio.play('blip', audio.now(), { m: 68 + Math.round(saved.settings.volume * 24), v: 0.14 });
  }
});
$('#volume-setting').addEventListener('change', (e) => {
  e.target.style.setProperty('--v', Number(e.target.value) / 100);
  persist();
  audio.unlock();
  if (saved.settings?.sound && !audio.muted) playClickSound('bubble');
});
$('#sound-setting').addEventListener('change', (e) => {
  saved.settings.sound = e.target.checked;
  audio.unlock();
  applySettings();
  persist();
  playClickSound(saved.settings.sound ? 'toggle-on' : 'toggle-off');
});
$('#motion-setting').addEventListener('input', (e) => {
  const v = Number(e.target.value) / 100;
  setMotion(v, { persist: false });
  motionSliderFx(v);
});
$('#motion-setting').addEventListener('change', (e) => {
  const v = e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : (Number(e.target.value) / 100);
  setMotion(v, { persist: true });
  playClickSound(v > 0.001 ? 'toggle-on' : 'toggle-off');
});

let confirmStep = 1;
function openResetConfirm() {
  confirmStep = 1;
  renderResetConfirm();
  $('#confirm-dialog')?.showModal?.();
}
function renderResetConfirm() {
  if (confirmStep === 1) {
    $('#confirm-title').textContent = '全部重置';
    $('#confirm-msg').innerHTML = '确定要清除此设备上的所有成语练习记录、成就与签到数据吗？<br><small>清除后数据将无法恢复。</small>';
    $('#confirm-no').textContent = '再想想';
    $('#confirm-yes').textContent = '继续重置';
    $('#confirm-yes').className = 'danger-btn';
  } else {
    $('#confirm-title').textContent = '真的要重置吗？';
    $('#confirm-msg').innerHTML = '<strong>清除后数据无法恢复！</strong><br>所有关卡进度、成就奖杯、签到与每日委托都将重置为初始状态。';
    $('#confirm-no').textContent = '再想想';
    $('#confirm-yes').textContent = '确认全部重置';
    $('#confirm-yes').className = 'danger-btn urgent';
  }
}
function onConfirmYes() {
  if (confirmStep === 1) {
    confirmStep = 2;
    renderResetConfirm();
    playClickSound('toggle-off');
  } else {
    playClickSound('primary');
    resetAllSaves(storage);
    try { storage?.clear?.(); } catch { /* ignore */ }
    location.reload();
  }
}
function closeResetConfirm() {
  $('#confirm-dialog')?.close?.();
  confirmStep = 1;
}

$('#ask-reset')?.addEventListener('click', () => {
  playClickSound('back');
  openResetConfirm();
});
$('#confirm-yes')?.addEventListener('click', onConfirmYes);
$('#confirm-no')?.addEventListener('click', () => {
  playClickSound('back');
  closeResetConfirm();
});
$('#close-confirm')?.addEventListener('click', () => {
  playClickSound('back');
  closeResetConfirm();
});
$('#confirm-dialog')?.addEventListener('click', (e) => {
  if (e.target.id === 'confirm-dialog') closeResetConfirm();
});
addEventListener('keydown', (e) => {
  if (S.bonusOpen && (e.key === 'Escape' || e.key === 'Enter')) { e.preventDefault(); closeBonus(); return; }
  if (S.screen === 'settings' && e.key === 'Escape') { e.preventDefault(); home(); return; }
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || paused()) return;
  if (S.demo && e.key === 'Escape') { e.preventDefault(); home(); return; }
  if (S.screen !== 'play' || S.demo) return;
  if (/^[1-4]$/.test(e.key)) { e.preventDefault(); const b = $$('.choice')[Number(e.key) - 1]; if (b) choose(b); }
  if (e.key === 'Escape') { e.preventDefault(); $('#leave-dialog').showModal(); }
});
document.addEventListener('visibilitychange', () => {
  S.clockAt = performance.now();
  if (document.hidden) {
    audio.stopMusic();
  } else if (saved.settings?.sound && !audio.muted) {
    if (S.screen === 'play') audio.startMusic();
    else if (S.screen === 'home' || S.screen === 'settings') startHomeMusic();
  }
});
homeActors.forEach((a) => {
  a.addEventListener('pointerenter', () => {
    bounce(a, { reduced: reduced() });
    if (saved.settings?.sound && !audio.muted) playClickSound('softie');
  });
  a.addEventListener('click', () => {
    bounce(a, { big: true, reduced: reduced() });
    if (saved.settings?.sound && !audio.muted) playClickSound('softie');
  });
});

// Global catch-all to guarantee every button on Home, Settings, and Dialogs has a click sound
document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('button, [role="button"], .mode-pill');
  if (!btn || btn.disabled) return;
  if (S.screen === 'play' && !e.target.closest?.('dialog')) return;
  playClickSound('bubble');
});

const unlockAndStartHomeMusic = () => {
  if (saved.settings?.sound && !audio.muted) {
    audio.unlock();
    if (S.screen === 'home' || S.screen === 'settings') startHomeMusic();
  }
};
addEventListener('pointerdown', unlockAndStartHomeMusic, { once: true, capture: true });
addEventListener('keydown', unlockAndStartHomeMusic, { once: true, capture: true });

onFrame((dt, t) => {
  tickTimer(t);
  if (document.hidden) return;
  if (S.screen === 'home' && saved.quests.day !== dayKey()) refreshHome();
  const audioPaused = document.hidden || (S.screen === 'play' && $('#leave-dialog').open);
  if (!audioPaused) audio.update();
  const pulse = audio.pulse();
  const kick = reduced() || (S.screen === 'play' && paused()) || !audio.playing ? 0 : pulse.kick * (S.E >= .05 ? 1 : .2);
  document.body.style.setProperty('--kick', kick.toFixed(3));
  if (S.shownEnergy < S.energy && S.screen === 'play') {
    S.shownEnergy = Math.min(S.energy, S.shownEnergy + Math.max(.02, (S.energy - S.shownEnergy) * Math.min(1, dt * 7)));
    $('#energy-value').textContent = displayEnergy(S.shownEnergy);
    const unit = Math.floor(S.shownEnergy + 1e-9);
    if (unit >= 2 && unit > S.energyUnit) unitSlam(10 ** unit);
    S.energyUnit = unit;
  }
  S.shake = Math.max(0, S.shake - dt * 30);
  const shake = !reduced() && S.shake > .1 ? S.shake * motionValue() : 0;
  const sx = rand(-shake, shake); const sy = rand(-shake, shake);
  $('.play-stage').style.translate = `${sx}px ${sy}px`;
  $('.energy-row').style.translate = `${sx * .5}px ${sy * .5}px`;
  S.flash = Math.max(0, S.flash - dt * 3.2);
  $('#flash').style.opacity = reduced() ? 0 : (S.flash ** 1.5 * .6 * motionValue()).toFixed(3);
  if (!reduced()) {
    S.visualE = lerp(S.visualE, S.screen === 'home' ? .04 : S.E, Math.min(1, dt * 2.2));
    const st = bg.state; const r = $('.play-stage').getBoundingClientRect();
    st.E = S.visualE; st.kick = kick; st.flash = S.flash;
    st.reach = lerp(st.reach, audio.reach ? 1 : 0, Math.min(1, dt * 5));
    st.hue += dt * .03 * S.visualE;
    st.cx = lerp(st.cx || innerWidth / 2, innerWidth / 2, Math.min(1, dt * 3));
    st.cy = lerp(st.cy || innerHeight * .4, S.screen === 'play' ? r.top + r.height * .55 : innerHeight * .4, Math.min(1, dt * 3));
    bg.render(t);
    if (S.screen === 'play' && !paused() && S.ready && !audio.reach && S.E > .3 && t > S.idleAt) {
      S.idleAt = t + rand(2200, 4200) / (.6 + S.E);
      bounce(actors.filter((a) => !a.hidden)[Math.floor(rand(0, crowdAt(S.E)))], { big: S.E > .6 });
    }
  }
  if ((S.screen === 'home' || S.screen === 'settings') && !reduced() && saved.settings?.sound && !audio.muted && audio.playing) {
    if (!S.ambientAt) S.ambientAt = t + rand(4500, 8500);
    if (t > S.ambientAt) {
      S.ambientAt = t + rand(5000, 9500);
      const notes = [72, 76, 79, 84];
      const m = notes[Math.floor(Math.random() * notes.length)];
      audio.play('pluck', audio.now(), { m, v: 0.08, dur: 0.5 });
      if (Math.random() < 0.4) {
        audio.play('pop', audio.now() + 0.08, { v: 0.06, f: 520 + Math.random() * 120 });
      }
    }
  }
  const burst = $('.logo-burst');
  if (burst && S.screen === 'home' && !reduced()) {
    burst.style.setProperty('--spin', (t / 1000 * 12) % 360);
  }
  fx.update(dt); fxBack.update(dt); fxBack.draw(); fx.draw();
});
applySettings(); refreshHome(); showScreen('home'); startClock();
if (saved.settings?.sound && !audio.muted) {
  startHomeMusic();
}
if (params.has('demo')) start('demo');

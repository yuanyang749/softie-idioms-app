import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { energyAt, musicAt, crowdAt, burstKinds, correctParticles, celebrationParticles, finaleParticles, gainEnergy } from '../js/choreography.js';
import { questionSeconds, countdown } from '../js/timer.js';
import { DEFAULT_MODE } from '../js/modes.js';

const upstreamUrl = new URL('../../app/js/main.js', import.meta.url);
const hasUpstream = existsSync(upstreamUrl);
const upstream = hasUpstream ? readFileSync(upstreamUrl, 'utf8') : '';
function sourceBetween(start, end) { return upstream.slice(upstream.indexOf(start), upstream.indexOf(end, upstream.indexOf(start))); }
function recorders() {
  const calls = [];
  const layer = (name) => Object.fromEntries(['burst', 'ring', 'streamers', 'rain', 'fireworks'].map((method) => [method, (...args) => calls.push([name, method, ...args])]));
  return { calls, fx: layer('front'), fxBack: layer('back') };
}
const normalize = (value) => JSON.parse(JSON.stringify(value));

test('original audio, backdrop and clock remain byte-identical; FX only swaps IP', { skip: !hasUpstream }, () => {
  for (const name of ['audio', 'bg', 'core']) assert.equal(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), readFileSync(new URL(`../../app/js/${name}.js`, import.meta.url), 'utf8'));
  const original = readFileSync(new URL('../../app/js/fx.js', import.meta.url), 'utf8');
  const remix = readFileSync(new URL('../js/fx.js', import.meta.url), 'utf8');
  assert.equal(remix, original.replaceAll('Dopakichi', 'Softie').replaceAll('dopakichiSprite', 'softieSprite').replace("'./dopakichi.js'", "'./softie.js'"));
});

test('all classic celebration recipes match upstream at every boundary, including reach bonus', { skip: !hasUpstream }, () => {
  const recipe = sourceBetween('function celebrate(E, big, lastBasic)', '// Hand-drawn');
  const kinds = sourceBetween('function burstKinds(E)', 'function onCorrect');
  for (const E of [.08, .18, .1801, .25, .2501, .3, .3001, .4, .4001, .5, .5001, .58, .5801, .62, .6201, .72, .7201, .74, .7401, .88, 1]) for (const big of [false, true]) {
    const original = recorders(); const remix = recorders();
    const context = { ...original, Math, innerWidth: 390, innerHeight: 844, S: { reduced: false, shake: 0, flash: 0 }, performance: { now: () => 0 }, card: { style: {}, getBoundingClientRect: () => ({ left: 20, top: 200, width: 350, height: 250 }) }, hero: { celebrate() {} }, crowd: [], audio: {}, parade() {}, tween: () => Promise.resolve(), setTimeout() {} };
    vm.runInNewContext(`${kinds}\n${recipe}\ncelebrate(${E},${big},false)`, context);
    celebrationParticles(remix.fx, remix.fxBack, E, big, 195, 300, 390, 844);
    assert.deepEqual(normalize(remix.calls), normalize(original.calls), `E=${E}, reach=${big}`);
  }
});

test('correct-answer bursts retain paper weights instead of diluting them with bubbles', () => {
  assert.deepEqual(burstKinds(1), ['confetti', 'star', 'spark', 'spark', 'coin', 'mini', 'heart']);
  const { calls, fx, fxBack } = recorders();
  correctParticles(fx, fxBack, 1, 20, 30);
  assert.equal(calls[0][4].count, 28);
  assert.deepEqual(calls[0][4].kinds, ['confetti', 'star', 'spark', 'spark', 'heart']);
  assert.equal(calls[1][0], 'back');
});

test('finale has the original opening and closing waves', () => {
  const { calls, fx, fxBack } = recorders();
  finaleParticles(fx, fxBack, 390, 844);
  finaleParticles(fx, fxBack, 390, 844, true);
  assert.deepEqual(calls.map((x) => [x[0], x[1], x[4]?.count ?? x[4]]), [
    ['back', 'fireworks', 10], ['front', 'streamers', 12], ['back', 'rain', { kinds: ['confetti', 'confetti', 'mini', 'star', 'coin'] }],
    ['front', 'burst', 70], ['back', 'fireworks', 6], ['front', 'fireworks', 3],
  ]);
});

test('show and music grow with round progress, independently of question difficulty', () => {
  assert.equal(energyAt(0, 8), .08); assert.equal(energyAt(7, 8), 1); assert.equal(energyAt(0, 1), 1);
  assert.deepEqual([.44, .45, .67, .68, .87, .88].map(crowdAt), [1, 2, 2, 3, 3, 5]);
  assert.deepEqual(musicAt(1), { level: 10, bpm: 128 });
  let L = 0;
  for (let qi = 0; qi < 8; qi++) for (let step = 0; step < 2; step++) {
    const next = gainEnergy(L, qi, step, 2, 8, qi * 2 + step + 1); assert.ok(next > L); L = next;
  }
  assert.ok(L > 3, 'long unbroken combo passes the 1000 milestone');
});

test('difficulty budgets decrease and audience configuration can override them', () => {
  assert.deepEqual(DEFAULT_MODE.levels.map((l) => questionSeconds(DEFAULT_MODE, l.id)), [30, 24, 20]);
  assert.equal(questionSeconds({ levels: [{ id: 20, seconds: 15 }] }, 20), 15);
  assert.equal(questionSeconds({ levels: [{ id: 10 }] }, 10), 30);
});

test('countdown spends real elapsed thinking time only, never resets between blanks', () => {
  assert.equal(countdown(20000, 2500, true), 17500);
  for (const label of ['bubble flight', 'explanation', 'settings', 'background', 'finale']) assert.equal(countdown(17500, 4000, false), 17500, label);
  assert.equal(countdown(17500, 1200, true), 16300);
  assert.equal(countdown(150, 4000, true), 0);
  assert.equal(countdown(150, -1, true), 150);
});

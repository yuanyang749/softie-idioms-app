import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODE, MODES, getMode, saveKey } from '../js/modes.js';
import { optionsFor, makeRound, placementRound, recommendedLevel, recordAnswer } from '../js/idioms.js';
import { freshSave, loadSave, persistSave, resetAllSaves } from '../js/storage.js';

const mode = DEFAULT_MODE;
const rng = () => .37;
function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() { return values.size; },
    key: (i) => [...values.keys()][i] ?? null,
  };
}

test('children bank: 150 unique, four-character questions, exactly 50 per level', () => {
  assert.equal(mode.questions.length, 150);
  assert.equal(new Set(mode.questions.map((q) => q.id)).size, 150);
  assert.equal(new Set(mode.questions.map((q) => q.word)).size, 150);
  for (const l of mode.levels) assert.equal(mode.questions.filter((q) => q.level === l.id).length, 50);
  for (const q of mode.questions) {
    assert.equal(q.id, `children-${q.word}`);
    assert.match(q.word, /^[\p{Script=Han}]{4}$/u);
    assert.ok(q.meaning.length > 6, q.id);
    assert.equal(q.context.split('____').length, 2, q.id);
    assert.ok(!q.context.includes(q.word), `context must not disclose ${q.word}`);
    assert.equal(q.blanks.length, q.level === 3 ? 2 : 1);
    assert.equal(new Set(q.blanks).size, q.blanks.length);
    assert.ok(q.blanks.every((i) => Number.isInteger(i) && i >= 0 && i < 4));
    assert.deepEqual(q.blanks, [...q.blanks].sort());
  }
});

test('every blank offers four unique characters including exactly one answer', () => {
  for (const q of mode.questions) for (let step = 0; step < q.blanks.length; step++) for (let n = 0; n < 30; n++) {
    const opts = optionsFor(q, step);
    assert.equal(opts.length, 4, q.word); assert.equal(new Set(opts).size, 4, q.word);
    assert.equal(opts.filter((x) => x === q.word[q.blanks[step]]).length, 1);
    for (const c of opts) {
      assert.match(c, /^[\p{Script=Han}]$/u);
      const candidate = q.word.slice(0, q.blanks[step]) + c + q.word.slice(q.blanks[step] + 1);
      if (candidate !== q.word) assert.ok(!mode.questions.some((x) => x.word === candidate), `${q.word}: ambiguous ${candidate}`);
    }
  }
});

test('round has no duplicates, uses the requested difficulty and prefers unseen items', () => {
  for (const l of mode.levels) {
    const initial = makeRound(l.id, { rng });
    assert.equal(initial.length, 8); assert.equal(new Set(initial.map((q) => q.id)).size, 8);
    assert.ok(initial.every((q) => q.level === l.id));
    const next = makeRound(l.id, { seen: initial.map((q) => q.id), rng });
    assert.ok(next.every((q) => !initial.includes(q)));
    assert.equal(makeRound(l.id, { seen: mode.questions.map((q) => q.id), rng }).length, 8);
  }
});

test('question-specific distractors take priority and cannot duplicate the answer', () => {
  const q = { ...mode.questions[0], distractors: [['甲', '乙', '丙', mode.questions[0].word[2]]] };
  assert.deepEqual(new Set(optionsFor(q, 0, rng)), new Set([q.word[2], '甲', '乙', '丙']));
});

test('all 50 questions remain reachable before recycling', () => {
  const seen = [];
  for (let i = 0; i < 7; i++) for (const q of makeRound(1, { seen, rng })) if (!seen.includes(q.id)) seen.push(q.id);
  assert.equal(seen.length, 50);
});

test('placement samples two per level, requires earlier foundations, and permits skipped/assisted answers', () => {
  const round = placementRound(rng);
  assert.deepEqual(round.map((q) => q.level), [1, 1, 2, 2, 3, 3]);
  const result = (levels) => round.map((q) => ({ level: q.level, firstTry: levels.includes(q.level) }));
  assert.equal(recommendedLevel(result([])), 1);
  assert.equal(recommendedLevel(result([1])), 2);
  assert.equal(recommendedLevel(result([1, 2])), 3);
  assert.equal(recommendedLevel(result([2, 3])), 1);
});

test('completed mistakes enter review, first-try review clears them, records are unique', () => {
  const save = freshSave(); const q = mode.questions[0];
  recordAnswer(save, q, false); recordAnswer(save, q, false);
  assert.deepEqual(save.learned, [q.id]); assert.deepEqual(save.review, [q.id]);
  recordAnswer(save, q, true);
  assert.deepEqual(save.review, []); assert.deepEqual(save.learned, [q.id]);
});

test('demo and placement never change mastery or review data', () => {
  const save = freshSave(); const before = structuredClone(save);
  for (const q of mode.questions) { recordAnswer(save, q, false, { demo: true }); recordAnswer(save, q, true, { placement: true }); }
  assert.deepEqual(save, before);
});

test('storage tolerates blocked, corrupt, null and unknown-version saves', () => {
  assert.deepEqual(loadSave(null), freshSave());
  assert.deepEqual(loadSave({ getItem() { throw new Error('blocked'); } }), freshSave());
  for (const text of ['{', 'null', '[]', '3', '{"version":100}']) assert.deepEqual(loadSave({ getItem: () => text }), freshSave());
  assert.equal(persistSave(null, freshSave()), false);
});

test('storage sanitizes fields and round-trips valid progress', () => {
  const store = memory(); const save = freshSave();
  recordAnswer(save, mode.questions[0], false); save.recommended = 2; save.rounds = 4;
  assert.ok(persistSave(store, save)); assert.deepEqual(loadSave(store), save);
  store.setItem(saveKey(mode), JSON.stringify({ version: 1, learned: [save.learned[0], save.learned[0], 'missing'], review: 'invalid', recommended: 99, rounds: -5, settings: { sound: 'yes', motion: false } }));
  const clean = loadSave(store);
  assert.deepEqual(clean.learned, save.learned); assert.deepEqual(clean.review, []);
  assert.equal(clean.rounds, 0); assert.equal(clean.recommended, null); assert.equal(clean.settings.sound, true); assert.equal(clean.settings.motion, false);
});

test('adult mode uses shared logic, separate storage and valid question bank', () => {
  const adult = MODES.adult;
  assert.ok(adult, 'adult mode must be registered');
  assert.equal(getMode('adult'), adult);
  assert.notEqual(saveKey(mode), saveKey(adult));
  assert.deepEqual(Object.keys(MODES), ['children', 'adult']);

  assert.equal(adult.questions.length, 150);
  assert.equal(new Set(adult.questions.map((q) => q.id)).size, 150);
  assert.equal(new Set(adult.questions.map((q) => q.word)).size, 150);
  for (const l of adult.levels) assert.equal(adult.questions.filter((q) => q.level === l.id).length, 50);

  for (const q of adult.questions) {
    assert.equal(q.id, `adult-${q.word}`);
    assert.match(q.word, /^[\p{Script=Han}]{4}$/u);
    assert.ok(q.meaning.length > 6, q.id);
    assert.equal(q.context.split('____').length, 2, q.id);
    assert.ok(!q.context.includes(q.word), `context must not disclose ${q.word}`);
    assert.equal(q.blanks.length, q.level === 3 ? 2 : 1);
    assert.equal(new Set(q.blanks).size, q.blanks.length);
    assert.ok(q.blanks.every((i) => Number.isInteger(i) && i >= 0 && i < 4));
    assert.deepEqual(q.blanks, [...q.blanks].sort());
  }

  const store = memory();
  const adultSave = freshSave(adult);
  recordAnswer(adultSave, adult.questions[0], false);
  assert.ok(persistSave(store, adultSave, adult));
  assert.deepEqual(loadSave(store, mode), freshSave(mode));
  assert.deepEqual(loadSave(store, adult), adultSave);
});

test('volume settings migrate old saves, clamp values, and persist without changing progress', () => {
  for (const [volume, expected] of [[undefined, .8], ['loud', .8], [-1, 0], [2, 1], [.35, .35]]) {
    const store = memory();
    store.setItem(saveKey(mode), JSON.stringify({ version: 1, learned: [mode.questions[0].id], settings: { sound: false, motion: true, volume } }));
    const save = loadSave(store);
    assert.equal(save.settings.volume, expected);
    assert.deepEqual(save.learned, [mode.questions[0].id]);
    persistSave(store, save);
    assert.deepEqual(loadSave(store), save);
  }
});

test('motion settings support booleans and numeric percentages', () => {
  for (const [motion, expected] of [[undefined, true], [true, true], [false, false], ['fast', true], [-0.5, 0], [1.5, 1], [0.65, 0.65]]) {
    const store = memory();
    store.setItem(saveKey(mode), JSON.stringify({ version: 1, learned: [mode.questions[0].id], settings: { sound: true, motion, volume: 0.8 } }));
    const save = loadSave(store);
    assert.equal(save.settings.motion, expected);
  }
});

test('resetAllSaves wipes all mode records and settings from storage', () => {
  const store = memory();
  store.setItem(saveKey(mode), JSON.stringify(freshSave(mode)));
  store.setItem(saveKey(MODES.adult), JSON.stringify(freshSave(MODES.adult)));
  store.setItem('unrelated-key', 'keep-me');
  resetAllSaves(store);
  assert.equal(store.getItem(saveKey(mode)), null);
  assert.equal(store.getItem(saveKey(MODES.adult)), null);
  assert.equal(store.getItem('unrelated-key'), 'keep-me');
});


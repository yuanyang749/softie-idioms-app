import test from 'node:test';
import assert from 'node:assert/strict';
import { TROPHIES, extractTrophyMetrics, evaluateTrophies, getEarnedTrophiesCount } from '../js/trophies.js';
import { MODES } from '../js/modes.js';
import { makeRound } from '../js/idioms.js';

test('trophies: definitions have valid fields and positive thresholds', () => {
  assert.ok(TROPHIES.length >= 20, 'Should have at least 20 trophies');
  for (const t of TROPHIES) {
    assert.ok(t.id, 'Trophy must have id');
    assert.ok(t.name, 'Trophy must have name');
    assert.ok(t.desc, 'Trophy must have desc');
    assert.ok(t.rank, 'Trophy must have rank');
    assert.ok(t.metric, 'Trophy must have metric');
    assert.ok(t.need > 0, 'Trophy threshold must be > 0');
  }
});

test('trophies: evaluation awards new trophies accurately without duplication', () => {
  const trophyState = { got: {} };
  const fakeSave = {
    streak: 7,
    learned: Array.from({ length: 35 }, (_, i) => `id-${i}`),
    daysPlayed: 10,
    stats: {
      maxCombo: 8,
      perfects: 2,
      problems: 60,
      reviewSolved: 5,
      flags: { firstPlay: true },
    },
  };

  const metrics = extractTrophyMetrics(fakeSave);
  assert.equal(metrics.streak, 7);
  assert.equal(metrics.learnedCount, 35);
  assert.equal(metrics.maxCombo, 8);
  assert.equal(metrics['flag:firstPlay'], 1);

  const newlyEarned = evaluateTrophies(trophyState, metrics);
  assert.ok(newlyEarned.length > 0, 'Should earn initial trophies');
  assert.ok(trophyState.got['streak-3']);
  assert.ok(trophyState.got['streak-7']);
  assert.equal(trophyState.got['streak-14'], undefined);
  assert.ok(trophyState.got['combo-5']);
  assert.equal(trophyState.got['combo-10'], undefined);
  assert.ok(trophyState.got['secret-first']);

  const count = getEarnedTrophiesCount(trophyState);
  assert.equal(count, newlyEarned.length);

  // Second evaluation with same metrics should award 0 new trophies
  const second = evaluateTrophies(trophyState, metrics);
  assert.equal(second.length, 0);
  assert.equal(getEarnedTrophiesCount(trophyState), count);
});

test('trophy thresholds follow the retention report and every combo is reachable', () => {
  assert.equal(TROPHIES.length, 32);
  for (const [series, expected] of Object.entries({ combo: [5, 10, 15], perfect: [1, 3, 10], problems: [50, 150, 300, 500], review: [1, 5, 15] })) {
    assert.deepEqual(TROPHIES.filter(t => t.series === series).map(t => t.need), expected);
  }
  for (const mode of Object.values(MODES)) {
    const maximum = Math.max(...mode.levels.map(l => makeRound(l.id, { mode }).reduce((n, q) => n + q.blanks.length, 0)));
    assert.ok(TROPHIES.filter(t => t.series === 'combo').every(t => t.need <= maximum));
  }
});

test('old award records are preserved but never inflate the current trophy count', () => {
  const state = { got: { 'combo-8': 1, 'combo-25': 2, 'secret-first': 3 } };
  evaluateTrophies(state, { maxCombo: 10 }, 4);
  assert.equal(state.got['combo-8'], 1);
  assert.equal(state.got['combo-25'], 2);
  assert.equal(state.got['combo-10'], 4);
  assert.equal(getEarnedTrophiesCount(state), 3);
});

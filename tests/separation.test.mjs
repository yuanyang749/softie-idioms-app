import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES } from '../js/modes.js';
import { freshSave, loadSave, persistSave, dayKey, currentStreak } from '../js/storage.js';
import { feedQuestEvent, ensureDailyQuests, isAllQuestsDone } from '../js/quests.js';
import { evaluateTrophies, extractTrophyMetrics } from '../js/trophies.js';

function memory() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test('dual-mode data separation: children and adult modes have completely isolated quests, calendar and trophies', () => {
  const store = memory();
  const childrenMode = MODES.children;
  const adultMode = MODES.adult;

  const childSave = freshSave(childrenMode);
  const adultSave = freshSave(adultMode);

  // 1. Initial saves are clean
  assert.equal(childSave.history.length, 0);
  assert.equal(adultSave.history.length, 0);

  // 2. Play 2 rounds in children mode only
  const today = dayKey();
  childSave.history.push({
    id: 'c1',
    day: today,
    at: Date.now(),
    score: 100,
    solved: 8,
    misses: 0,
    firstTry: 8,
    combo: 8,
    mode: 'children',
  });
  childSave.rounds = 1;
  childSave.learned.push('children-一心一意');
  childSave.stats.problems = 8;
  childSave.stats.firstTry = 8;
  childSave.stats.perfects = 1;
  childSave.stats.maxCombo = 8;

  ensureDailyQuests(childSave.quests, today, { reviewCount: 0 });
  feedQuestEvent(childSave.quests, { type: 'solve', firstTry: true, combo: 8 });
  feedQuestEvent(childSave.quests, { type: 'round', score: 100, solved: 8, total: 8 });

  // Evaluate children trophies
  evaluateTrophies(childSave.trophies, extractTrophyMetrics({
    ...childSave,
    streak: currentStreak(childSave.history, childSave.calendar.nocount),
  }));

  // Persist both
  assert.ok(persistSave(store, childSave, childrenMode));
  assert.ok(persistSave(store, adultSave, adultMode));

  // Reload adult mode from store
  const reloadedAdult = loadSave(store, adultMode);
  assert.equal(reloadedAdult.history.length, 0, 'Adult history must remain empty');
  assert.equal(reloadedAdult.rounds, 0, 'Adult rounds must remain 0');
  assert.equal(reloadedAdult.learned.length, 0, 'Adult learned must remain empty');
  assert.equal(reloadedAdult.stats.problems, 0, 'Adult problems must be 0');
  assert.equal(Object.keys(reloadedAdult.trophies.got || {}).length, 0, 'Adult trophies must remain 0');

  // Reload children mode from store
  const reloadedChild = loadSave(store, childrenMode);
  assert.equal(reloadedChild.history.length, 1, 'Children history must contain 1 play');
  assert.equal(reloadedChild.rounds, 1);
  assert.equal(reloadedChild.learned.length, 1);
  assert.ok(Object.keys(reloadedChild.trophies.got).length > 0, 'Children should have earned trophies');

  // 3. Now make changes to adult mode and ensure children mode is unaffected
  reloadedAdult.learned.push('adult-独当一面');
  reloadedAdult.history.push({
    id: 'a1',
    day: today,
    at: Date.now(),
    score: 100,
    solved: 8,
    misses: 2,
    firstTry: 6,
    combo: 6,
    mode: 'adult',
  });
  persistSave(store, reloadedAdult, adultMode);

  const recheckChild = loadSave(store, childrenMode);
  assert.deepEqual(recheckChild.learned, ['children-一心一意']);
  assert.equal(recheckChild.history.length, 1);
  assert.equal(recheckChild.history[0].id, 'c1');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './helpers/app-harness.mjs';
import { freshSave, currentStreak } from '../js/storage.js';
import { MODES } from '../js/modes.js';

function questSave(day, completed = false) {
  const save = freshSave();
  save.settings.motion = false;
  save.quests = { day, rewarded: false, doneDays: {}, list: [
    { id: 'play1', goal: 1, prog: completed ? 1 : 0, done: completed },
    { id: 'combo5', goal: 5, prog: completed ? 5 : 0, done: completed },
    { id: 'first8', goal: 8, prog: completed ? 8 : 0, done: completed },
  ] };
  return save;
}

test('hammer confirmation repairs the offered gap once and unlocks its trophy', () => {
  const save = freshSave(); save.settings.motion = false;
  save.history = [{ day: '2026-09-27' }, { day: '2026-09-28' }];
  const f = createApp({ saves: { children: save } });
  assert.equal(f.$('#hammer-dialog').open, true);
  f.$('#hammer-yes').click();
  assert.equal(f.app.saved.calendar.hammers, 0);
  assert.equal(f.app.saved.calendar.nocount['2026-09-29'], true);
  assert.equal(currentStreak(f.app.saved.history, f.app.saved.calendar.nocount, new Date(2026, 8, 30)), 2);
  assert.ok(f.app.saved.trophies.got['secret-hammer']);
  f.$('#hammer-yes').click();
  assert.equal(f.app.saved.calendar.hammers, 0);
});

test('all daily quests reward immediately at settlement and survive reload once', async () => {
  const f = createApp({ saves: { children: questSave('2026-09-30') } });
  f.app.start('level', 1); await f.round();
  assert.equal(f.app.saved.calendar.hammers, 2);
  assert.equal(f.app.saved.quests.doneDays['2026-09-30'], true);
  const reloaded = createApp({ saves: { children: f.stored('children') } });
  assert.equal(reloaded.app.saved.calendar.hammers, 2);
});

test('a completed legacy quest day is rewarded before midnight rollover', () => {
  const f = createApp({ saves: { children: questSave('2026-09-29', true) } });
  assert.equal(f.app.saved.calendar.hammers, 2);
  assert.equal(f.app.saved.quests.doneDays['2026-09-29'], true);
  assert.equal(f.app.saved.quests.day, '2026-09-30');
});

test('answers after midnight update the new day and home keeps their progress', async () => {
  const f = createApp({ date: new Date(2026, 8, 30, 23, 59), saves: { children: questSave('2026-09-30') } });
  f.app.start('level', 1);
  f.setDate(new Date(2026, 9, 1, 0, 1));
  await f.answer();
  assert.equal(f.app.saved.quests.day, '2026-10-01');
  const progress = JSON.stringify(f.app.saved.quests.list);
  assert.ok(f.app.saved.quests.list.some(q => q.prog > 0));
  f.app.home();
  assert.equal(JSON.stringify(f.app.saved.quests.list), progress);
});

test('an abandoned child trophy never appears in adult settlement', async () => {
  const f = createApp(); f.app.start('level', 1);
  for (let i = 0; i < 5; i++) { await f.answer(); f.app.nextQuestion(); }
  assert.ok(f.app.saved.trophies.got['combo-5']);
  f.app.home(); f.app.setAudienceMode('adult', false); f.app.start('level', 1);
  await f.round({ wrong: true }); await f.advance(1200);
  assert.equal(f.app.saved.trophies.got['combo-5'], undefined);
  assert.ok(!f.$('#tg-list').innerHTML.includes('行云流水'));
  assert.ok(f.stored('children').trophies.got['combo-5']);
});

test('speed achievement uses thinking time and requires an independent answer', async () => {
  for (const [thinkingMs, hint, expected] of [[4900, false, true], [5000, false, true], [5100, false, false], [1000, true, false]]) {
    const f = createApp(); f.app.start('level', 1); await f.answer({ thinkingMs, hint });
    assert.equal(Boolean(f.app.saved.trophies.got['secret-speed']), expected);
  }
});

test('advanced nighttime practice unlocks both missing secrets and energy progress', async () => {
  const save = freshSave(MODES.adult); save.settings.motion = false;
  save.quests = { day: '2026-09-30', rewarded: false, doneDays: {}, list: [
    { id: 'play1', goal: 1, prog: 0, done: false },
    { id: 'combo5', goal: 5, prog: 0, done: false },
    { id: 'energy1000', goal: 1000, prog: 0, done: false },
  ] };
  const f = createApp({ mode: 'adult', date: new Date(2026, 8, 30, 22), saves: { adult: save } });
  f.app.start('level', 3); await f.round();
  assert.ok(f.app.saved.trophies.got['secret-advanced']);
  assert.ok(f.app.saved.trophies.got['secret-night']);
  assert.ok(f.app.saved.quests.list.find(q => q.id === 'energy1000').done);
});

test('day log exposes answer counts, misses, combo and learning duration', async () => {
  const f = createApp(); f.app.start('level', 1); await f.round({ thinkingMs: 1000 });
  f.app.showDayLog('2026-09-30');
  const html = f.$('#day-list').innerHTML;
  assert.match(html, /独立答对\s*8/);
  assert.match(html, /差一点\s*0/);
  assert.match(html, /8\s*连击/);
  assert.match(html, /用时/);
  assert.equal(f.app.saved.history[0].total, 8);
  assert.ok(f.app.saved.history[0].timeMs >= 8000);
});

test('placement does not advance quests or learning achievements', async () => {
  const f = createApp(); const before = JSON.stringify(f.app.saved.quests);
  f.app.start('placement'); await f.round();
  assert.equal(JSON.stringify(f.app.saved.quests), before);
  assert.equal(f.app.saved.history.length, 0);
  assert.equal(f.app.saved.stats.problems, 0);
  assert.equal(Object.keys(f.app.saved.trophies.got).length, 0);
});

test('declining or confirming a stale hammer offer never spends items', () => {
  for (const stale of [false, true]) {
    const save = freshSave(); save.history = [{ day: '2026-09-28' }];
    const f = createApp({ saves: { children: save } });
    assert.equal(f.$('#hammer-dialog').open, true);
    if (stale) { f.setDate(new Date(2026, 9, 1)); f.$('#hammer-yes').click(); }
    else { f.$('#hammer-no').click(); f.app.home(); assert.equal(f.$('#hammer-dialog').open, false); }
    assert.equal(f.app.saved.calendar.hammers, 1);
    assert.equal(Object.keys(f.app.saved.calendar.nocount).length, 0);
    assert.equal(f.app.saved.trophies.got['secret-hammer'], undefined);
  }
});

test('daily quest rewards respect the three-hammer cap and cannot be reclaimed', async () => {
  const save = questSave('2026-09-30'); save.calendar.hammers = 3;
  const f = createApp({ saves: { children: save } }); f.app.start('level', 1); await f.round();
  assert.equal(f.app.saved.calendar.hammers, 3);
  assert.equal(f.app.saved.quests.rewarded, true);
  assert.equal(f.app.saved.quests.doneDays['2026-09-30'], true);
  f.app.home(); f.app.start('level', 1); await f.round();
  assert.equal(f.app.saved.calendar.hammers, 3);
});

test('pausing excludes time from speed achievements and recorded learning time', async () => {
  const f = createApp(); f.app.start('level', 1);
  f.$('#exit-game').click(); await f.advance(10000); f.$('#keep-playing').click();
  await f.answer({ thinkingMs: 1000 });
  assert.ok(f.app.saved.trophies.got['secret-speed']);
  assert.equal(f.app.scene.playMs, 1000);
});

test('hinted or retried rounds keep completion score without earning a perfect', async () => {
  for (const options of [{ hint: true }, { wrong: true }]) {
    const save = questSave('2026-09-30');
    save.quests.list[2] = { id: 'perfect1', goal: 1, prog: 0, done: false };
    const f = createApp({ saves: { children: save } }); f.app.start('level', 1); await f.round(options);
    assert.equal(f.app.saved.history[0].score, 100);
    assert.equal(f.app.saved.stats.perfects, 0);
    assert.equal(f.app.saved.quests.list[2].done, false);
    assert.equal(f.app.saved.stats.misses, options.wrong ? 8 : 0);
  }
});

test('a delayed child celebration is cancelled on home and mode switching', async () => {
  const f = createApp(); f.app.start('level', 1); await f.round();
  f.app.home(); f.app.setAudienceMode('adult', false); await f.advance(1500);
  assert.equal(f.$('#trophy-got-dialog').open, false);
  assert.equal(Object.keys(f.app.saved.trophies.got).length, 0);
});

test('demo preserves quests, history, learning stats and trophies', async () => {
  const f = createApp(); const before = JSON.stringify(f.app.saved);
  f.app.start('demo'); await f.round();
  assert.equal(JSON.stringify(f.app.saved), before);
});

test('nighttime boundary and weekend achievements use the local completion date', async () => {
  for (const [hour, expected] of [[21, false], [22, true], [5, true], [6, false]]) {
    const f = createApp({ date: new Date(2026, 9, 3, hour) });
    f.app.start('level', 1); await f.round();
    assert.equal(Boolean(f.app.saved.trophies.got['secret-night']), expected);
    assert.ok(f.app.saved.trophies.got['secret-weekend']);
  }
});

test('modal dialogs for quests and calendar toggle cleanly and update indicators', () => {
  const f = createApp({ date: new Date(2026, 8, 30, 10) });
  const openQuests = f.$('#open-quests');
  const questsDialog = f.$('#quests-dialog');
  const closeQuests = f.$('#close-quests');
  const questsConfirm = f.$('#quests-confirm');

  const openCal = f.$('#open-calendar');
  const calDialog = f.$('#calendar-dialog');
  const closeCal = f.$('#close-calendar');
  const calConfirm = f.$('#calendar-confirm');

  assert.equal(questsDialog.open, false);
  assert.equal(calDialog.open, false);

  openQuests.click();
  assert.equal(questsDialog.open, true);
  closeQuests.click();
  assert.equal(questsDialog.open, false);

  openQuests.click();
  assert.equal(questsDialog.open, true);
  questsConfirm.click();
  assert.equal(questsDialog.open, false);

  openCal.click();
  assert.equal(calDialog.open, true);
  closeCal.click();
  assert.equal(calDialog.open, false);

  openCal.click();
  assert.equal(calDialog.open, true);
  calConfirm.click();
  assert.equal(calDialog.open, false);

  const calDot = f.$('#cal-dot');
  assert.equal(calDot.hidden, false, 'Calendar dot should be visible when today is not played');
});

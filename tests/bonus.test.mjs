import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './helpers/app-harness.mjs';
import { freshSave, claimLogin, STICKERS, dayKey, dayBefore } from '../js/storage.js';

test('claimLogin: increments consecutive streak, assigns correct stickers, and wraps 7 days', () => {
  const bonus = { last: null, run: 0, stickers: {}, total: 0 };
  const d1 = new Date(2026, 9, 1);
  const res1 = claimLogin(bonus, {}, d1);
  assert.equal(res1.run, 1);
  assert.equal(res1.slot, 1);
  assert.equal(res1.type, 'star');
  assert.equal(res1.total, 1);
  assert.equal(bonus.last, '2026-10-01');

  // Same day claim returns null
  assert.equal(claimLogin(bonus, {}, d1), null);

  // Day 2 consecutive
  const d2 = new Date(2026, 9, 2);
  const res2 = claimLogin(bonus, {}, d2);
  assert.equal(res2.run, 2);
  assert.equal(res2.slot, 2);
  assert.equal(res2.type, 'heart');
  assert.equal(res2.total, 2);

  // Days 3 to 7
  for (let i = 3; i <= 7; i++) {
    const res = claimLogin(bonus, {}, new Date(2026, 9, i));
    assert.equal(res.run, i);
    assert.equal(res.slot, i);
    assert.equal(res.type, STICKERS[i - 1]);
  }
  assert.equal(bonus.stickers['2026-10-07'], 'crown');

  // Day 8 consecutive: streak is 8, but slot wraps to 1 (star)
  const d8 = new Date(2026, 9, 8);
  const res8 = claimLogin(bonus, {}, d8);
  assert.equal(res8.run, 8);
  assert.equal(res8.slot, 1);
  assert.equal(res8.type, 'star');
  assert.equal(res8.total, 8);
});

test('claimLogin: resets streak when a day is missed without hammer, but continues across nocount hammer days', () => {
  // Case A: missed day resets streak
  const bonusA = { last: '2026-10-01', run: 3, stickers: { '2026-10-01': 'flower' }, total: 3 };
  const dAfterGap = new Date(2026, 9, 3); // skipped Oct 2
  const resA = claimLogin(bonusA, {}, dAfterGap);
  assert.equal(resA.run, 1);
  assert.equal(resA.slot, 1);
  assert.equal(resA.type, 'star');
  assert.equal(resA.total, 4);

  // Case B: missed day bridged by hammer nocount
  const bonusB = { last: '2026-10-01', run: 3, stickers: { '2026-10-01': 'flower' }, total: 3 };
  const calendarB = { nocount: { '2026-10-02': true } };
  const resB = claimLogin(bonusB, calendarB, dAfterGap);
  assert.equal(resB.run, 4);
  assert.equal(resB.slot, 4);
  assert.equal(resB.type, 'note');
  assert.equal(resB.total, 4);
});

test('daily bonus dialog automatically pops up on app launch when not claimed today', async () => {
  const save = freshSave();
  save.settings.motion = false;
  const f = createApp({ saves: { children: save } });

  // Before timer expires, dialog is not yet open
  assert.equal(f.$('#bonus-dialog').open, false);

  // Advance clock past 500ms
  await f.advance(600);

  // Dialog must be automatically open!
  assert.equal(f.$('#bonus-dialog').open, true);
  assert.equal(f.app.saved.bonus.last, '2026-09-30');
  assert.equal(f.app.saved.bonus.run, 1);
  assert.equal(f.app.saved.bonus.stickers['2026-09-30'], 'star');

  // Verify UI content
  assert.ok(f.$('#bonus-grid').innerHTML.includes('bonus-slot'));
  assert.ok(f.$('#bonus-grid').innerHTML.includes('today'));
  assert.ok(f.$('#bonus-note').textContent.includes('6'));

  // Clicking "立即领取" closes dialog and persists
  f.$('#bonus-ok').click();
  assert.equal(f.$('#bonus-dialog').open, false);
  assert.equal(f.stored('children').bonus.last, '2026-09-30');

  // After claiming 1st sticker, achievement unlock modal automatically pops up
  await f.advance(350);
  assert.equal(f.$('#trophy-got-dialog').open, true);
  assert.ok(f.$('#tg-list').innerHTML.includes('印章 1 枚'));
  assert.ok(f.$('#tg-list').innerHTML.includes('在打卡日历上收集 1 枚印章'));

  // Clicking "太棒了！" closes trophy-got-dialog
  f.$('#tg-ok').click();
  assert.equal(f.$('#trophy-got-dialog').open, false);

  // Subsequent timer advance does not re-open today
  await f.advance(1000);
  assert.equal(f.$('#bonus-dialog').open, false);
});

test('topbar bonus button opens review mode when already claimed today, and updates bonus-dot', async () => {
  const save = freshSave();
  save.settings.motion = false;
  save.bonus = {
    last: '2026-09-30',
    run: 2,
    stickers: { '2026-09-29': 'star', '2026-09-30': 'heart' },
    total: 2,
  };

  const f = createApp({ saves: { children: save } });
  await f.advance(600);

  // Since already claimed today, auto popup does NOT trigger
  assert.equal(f.$('#bonus-dialog').open, false);
  assert.equal(f.$('#bonus-dot').hidden, true);

  // Clicking open-bonus button manually opens the dialog in view mode
  f.$('#open-bonus').click();
  assert.equal(f.$('#bonus-dialog').open, true);
  assert.equal(f.$('#bonus-ok').textContent, '我知道啦');
  assert.ok(f.$('#bonus-run').innerHTML.includes('连续<b>2</b>天签到'));

  // Close dialog
  f.$('#bonus-ok').click();
  assert.equal(f.$('#bonus-dialog').open, false);
});

test('daily check-in displays sticker stamp on calendar day cell', async () => {
  const save = freshSave();
  save.settings.motion = false;
  save.bonus = {
    last: '2026-09-30',
    run: 1,
    stickers: { '2026-09-30': 'star' },
    total: 1,
  };

  const f = createApp({ saves: { children: save } });
  f.$('#open-calendar').click();
  assert.equal(f.$('#calendar-dialog').open, true);

  // Calendar HTML should contain the sticker svg class
  assert.ok(f.$('#cal-grid').innerHTML.includes('class="stk"'));
  assert.ok(f.$('#cal-badges').innerHTML.includes('特别印章 <b>1</b> 枚'));
});

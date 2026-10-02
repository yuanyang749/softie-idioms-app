import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as modes from '../js/modes.js';
import * as idioms from '../js/idioms.js';
import * as storage from '../js/storage.js';
import * as quests from '../js/quests.js';
import * as trophies from '../js/trophies.js';
import * as choreography from '../js/choreography.js';
import * as timer from '../js/timer.js';

const source = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '');
const noop = () => {};

function createAudioHarness({ soundEnabled = true, volume = 0.8 } = {}) {
  const audioCalls = [];
  const musicState = { playing: false, level: null, bpm: null, muted: !soundEnabled };

  class MockAudioEngine {
    constructor() {
      this.muted = !soundEnabled;
      this.volume = volume;
      this.playing = false;
      this.level = 0;
      this.bpm = 112;
      this.reach = false;
    }
    unlock() { audioCalls.push(['unlock']); }
    now() { return 10; }
    play(name, when, params) {
      audioCalls.push(['play', name, params]);
    }
    setMuted(m) {
      this.muted = m;
      musicState.muted = m;
      audioCalls.push(['setMuted', m]);
    }
    setVolume(v) {
      this.volume = v;
      audioCalls.push(['setVolume', v]);
    }
    setLevel(level, bpm) {
      this.level = level;
      this.bpm = bpm;
      musicState.level = level;
      musicState.bpm = bpm;
      audioCalls.push(['setLevel', level, bpm]);
    }
    startMusic() {
      this.playing = true;
      musicState.playing = true;
      audioCalls.push(['startMusic']);
    }
    stopMusic() {
      this.playing = false;
      musicState.playing = false;
      audioCalls.push(['stopMusic']);
    }
    setReach(r) {
      this.reach = r;
      audioCalls.push(['setReach', r]);
    }
    pulse() { return { kick: 0, phase: 0, beat: 0 }; }
    jump(h) { audioCalls.push(['jump', h]); }
    keyTap(c) { audioCalls.push(['keyTap', c]); }
    jingle() { audioCalls.push(['jingle']); }
  }

  const elements = new Map();
  function element() {
    return {
      dataset: {}, classList: { add: noop, remove: noop, toggle: noop }, style: { setProperty: noop },
      hidden: false, open: false, disabled: false, value: '', children: [],
      focus: noop, setAttribute: noop, animate: noop, remove: noop,
      append: noop, replaceChildren: noop, querySelectorAll: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }),
      addEventListener(type, fn) { this[type] = fn; },
      showModal() { this.open = true; }, close() { this.open = false; },
      set innerHTML(html) { this.html = html; },
      get innerHTML() { return this.html || ''; },
    };
  }
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  };
  const $$ = () => [];

  const defaultSave = storage.freshSave(modes.DEFAULT_MODE);
  defaultSave.settings.sound = soundEnabled;
  defaultSave.settings.volume = volume;
  const savedData = new Map([
    [modes.saveKey(modes.DEFAULT_MODE), JSON.stringify(defaultSave)],
  ]);
  const localStorage = {
    getItem: key => savedData.get(key) || null,
    setItem: (key, val) => savedData.set(key, String(val)),
  };

  let clock = 100;
  const context = vm.createContext({
    ...modes, ...idioms, ...storage, ...quests, ...trophies, ...choreography, ...timer,
    dayKey: () => '2026-10-01',
    currentStreak: () => 0,
    hammerOffer: () => null,
    Date: class extends Date { static now() { return 1000; } },
    URL, URLSearchParams, console, matchMedia: () => ({ matches: false }),
    location: { search: '?mode=children', href: 'http://localhost/?mode=children' },
    history: { replaceState: noop },
    window: { localStorage, scrollTo: noop },
    document: {
      body: element(), hidden: false, querySelector: $, querySelectorAll: $$,
      getAnimations: () => [], addEventListener: noop, createElement: element,
      createTextNode: text => ({ textContent: text }),
    },
    AudioEngine: MockAudioEngine,
    FX: class { constructor() { this.parts = []; } update() {} draw() {} },
    Backdrop: class {}, mountSofties: () => [], softieSVG: () => '',
    bounce: noop, bubbleHit: async () => {}, startClock: noop,
    onFrame: noop, centerOf: () => ({ x: 0, y: 0, w: 0, h: 0 }),
    tween: async () => {}, wait: async () => {}, lerp: (a, b, k) => a + (b - a) * k,
    rand: (a, b) => (a + b) / 2, easeOutBack: noop, easeInCubic: noop, easeOutQuint: noop,
    performance: { now: () => (clock += 100) }, addEventListener: noop,
    setTimeout: noop, clearTimeout: noop,
  });

  vm.runInContext(source, context);
  const app = vm.runInContext('({ start, home, setAudienceMode, playClickSound, startHomeMusic, get scene() { return S; }, get saved() { return saved; }, get audio() { return audio; } })', context);

  return { app, audioCalls, musicState, $ };
}

test('home page initializes background music when sound is enabled', () => {
  const { app, musicState } = createAudioHarness({ soundEnabled: true });
  assert.equal(musicState.playing, true);
  assert.equal(musicState.level, 0);
  assert.equal(musicState.muted, false);
});

test('home page does not play background music when sound is muted', () => {
  const { app, musicState } = createAudioHarness({ soundEnabled: false });
  assert.equal(musicState.playing, false);
  assert.equal(musicState.muted, true);
});

test('button click sounds play dopamine synth audio when sound is enabled', () => {
  const { app, audioCalls, $ } = createAudioHarness({ soundEnabled: true });
  audioCalls.length = 0;

  // Primary action button (e.g. start placement)
  $('#start-placement').click();
  const primaryPlays = audioCalls.filter(c => c[0] === 'play').map(c => c[1]);
  assert.ok(primaryPlays.includes('pop'), 'Should play pop on primary button click');
  assert.ok(primaryPlays.includes('blip'), 'Should play blip on primary button click');

  // Back button (e.g. close settings)
  audioCalls.length = 0;
  $('#close-settings').click();
  const backPlays = audioCalls.filter(c => c[0] === 'play').map(c => c[1]);
  assert.ok(backPlays.includes('pop'), 'Should play pop on close button click');

  // Open settings
  audioCalls.length = 0;
  $('#open-settings').click();
  const settingsPlays = audioCalls.filter(c => c[0] === 'play').map(c => c[1]);
  assert.ok(settingsPlays.includes('pop'), 'Should play pop on settings button click');
});

test('mute setting globally disables all button click sounds', () => {
  const { app, audioCalls, $ } = createAudioHarness({ soundEnabled: false });
  audioCalls.length = 0;

  // Click start placement while muted
  $('#start-placement').click();
  const playCalls = audioCalls.filter(c => c[0] === 'play');
  assert.equal(playCalls.length, 0, 'No sound should play when muted');

  // Click settings while muted
  $('#open-settings').click();
  const settingsPlays = audioCalls.filter(c => c[0] === 'play');
  assert.equal(settingsPlays.length, 0, 'No sound should play when muted');

  // Click close settings while muted
  $('#close-settings').click();
  const closePlays = audioCalls.filter(c => c[0] === 'play');
  assert.equal(closePlays.length, 0, 'No sound should play when muted');
});

test('toggling sound in settings controls mute state and home music', () => {
  const { app, audioCalls, musicState, $ } = createAudioHarness({ soundEnabled: true });
  assert.equal(app.saved.settings.sound, true);
  assert.equal(musicState.playing, true);

  // Toggle sound OFF
  audioCalls.length = 0;
  $('#sound-setting').click?.();
  $('#sound-setting').change({ target: { checked: false } });
  assert.equal(app.saved.settings.sound, false);
  assert.equal(musicState.muted, true);
  assert.equal(musicState.playing, false);

  // Toggle sound back ON
  audioCalls.length = 0;
  $('#sound-setting').change({ target: { checked: true } });
  assert.equal(app.saved.settings.sound, true);
  assert.equal(musicState.muted, false);
  const togglePlays = audioCalls.filter(c => c[0] === 'play').map(c => c[1]);
  assert.ok(togglePlays.includes('pop') || togglePlays.includes('blip'), 'Should play feedback on unmute');
});

test('background music continues playing when navigating to settings screen', () => {
  const { app, musicState, $ } = createAudioHarness({ soundEnabled: true });
  assert.equal(musicState.playing, true);
  assert.equal(app.scene.screen, 'home');

  // Navigate to settings screen
  $('#open-settings').click();
  assert.equal(app.scene.screen, 'settings');
  assert.equal(musicState.playing, true, 'Music should keep playing in settings screen');

  // Navigate back to home
  $('#close-settings').click();
  assert.equal(app.scene.screen, 'home');
  assert.equal(musicState.playing, true, 'Music should keep playing after returning to home');
});

test('motion slider input and change events update percentage and fx scaling', () => {
  const { app, $ } = createAudioHarness({ soundEnabled: true });
  assert.equal(app.saved.settings.motion, true);

  // Drag slider to 50%
  $('#motion-setting').input?.({ target: { value: '50' } });
  assert.equal(app.saved.settings.motion, 0.5);
  assert.equal($('#motion-val').textContent, '50%');

  // Drag slider to 0% (reduced motion)
  $('#motion-setting').input?.({ target: { value: '0' } });
  assert.equal(app.saved.settings.motion, 0);
  assert.equal($('#motion-val').textContent, '0%');

  // Change event commits and persists
  $('#motion-setting').change?.({ target: { value: '75', type: 'range' } });
  assert.equal(app.saved.settings.motion, 0.75);
  assert.equal($('#motion-val').textContent, '75%');
});

test('data reset button opens confirm modal with two-step safety check', () => {
  const { app, $ } = createAudioHarness({ soundEnabled: true });
  assert.equal($('#confirm-dialog').open, false);

  // Click 全部重置
  $('#ask-reset').click?.();
  assert.equal($('#confirm-dialog').open, true);
  assert.equal($('#confirm-title').textContent, '全部重置');
  assert.equal($('#confirm-yes').textContent, '继续重置');

  // Step 1: click 继续重置 -> advances to Step 2
  $('#confirm-yes').click?.();
  assert.equal($('#confirm-dialog').open, true);
  assert.equal($('#confirm-title').textContent, '真的要重置吗？');
  assert.equal($('#confirm-yes').textContent, '确认全部重置');

  // Cancel closes and resets
  $('#confirm-no').click?.();
  assert.equal($('#confirm-dialog').open, false);
});



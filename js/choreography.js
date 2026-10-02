// Dopa Drill's classic show: same thresholds, particle weights and recipes.
// Audience and question content deliberately do not participate in this layer.
export const energyAt = (index, count) => count <= 1 ? 1 : .08 + .92 * (index / (count - 1)) ** 1.3;
export const musicAt = (E) => ({ level: Math.min(10, Math.round(E * 10)), bpm: 112 + 16 * Math.min(1, E) });
export const crowdAt = (E) => E >= .88 ? 5 : E >= .68 ? 3 : E >= .45 ? 2 : 1;
export function burstKinds(E) {
  const kinds = ['confetti'];
  if (E > .18) kinds.push('star');
  if (E > .4) kinds.push('spark', 'spark');
  if (E > .58) kinds.push('coin');
  if (E > .72) kinds.push('mini', 'heart');
  return kinds;
}
export function correctParticles(fx, back, E, x, y) {
  fx.burst(x, y, { count: Math.round(6 + 22 * E), speed: 260 + 260 * E, kinds: burstKinds(E).filter((k) => k !== 'mini' && k !== 'coin'), up: 120, life: .55 });
  if (E > .35) back.burst(x, y, { count: Math.round(30 * E), speed: 700, kinds: burstKinds(E), up: 200 });
  fx.ring(x, y, { color: E > .5 ? '#ffd23f' : '#ff7ab6', radius: 40 + 60 * E, width: 6 });
}
export function celebrationParticles(fx, back, E, big, x, y, W, H) {
  fx.burst(x, y, { count: Math.round(18 + 80 * Math.min(1.2, E) + (big ? 50 : 0)), speed: 500 + 500 * E, kinds: burstKinds(E), up: 250, life: .6 });
  fx.ring(x, y, { color: '#ffd23f', radius: 120 + 200 * E, width: 10 });
  if (E > .25) back.burst(x, y, { count: Math.round(100 * Math.min(1.2, E)), speed: 900 + 400 * E, kinds: burstKinds(E), up: 400 });
  if (E > .3) fx.streamers(W, H, Math.round(2 + 6 * E));
  if (E > .5) back.fireworks(W, H, Math.round(2 + 6 * E) + (big ? 4 : 0), .06, .3);
  if (E > .62) back.rain(W, Math.round(20 + 30 * E), { kinds: ['confetti', 'confetti', 'mini', 'coin'] });
  if (big) {
    fx.burst(x, y, { count: 50, speed: 900, kinds: ['spark', 'star', 'coin'], up: 100, life: .6 });
    back.burst(x, y, { count: 120, speed: 1300, kinds: ['spark', 'star', 'mini', 'coin'], up: 300 });
  }
}
export function finaleParticles(fx, back, W, H, closing = false) {
  if (closing) { back.fireworks(W, H, 6, .06, .35); fx.fireworks(W, H, 3, .06, .3); return; }
  back.fireworks(W, H, 10, .06, .45);
  fx.streamers(W, H, 12);
  back.rain(W, 70, { kinds: ['confetti', 'confetti', 'mini', 'star', 'coin'] });
  fx.burst(W / 2, H * .4, { count: 70, speed: 1200, kinds: ['confetti', 'star', 'spark', 'coin', 'mini'], up: 300, life: .7 });
}
// Original log-space reward curve, normalized by question and blank count.
// This is celebration energy, not an accuracy score or a speed requirement.
const baseEnergy = (f) => 2.3 * Math.max(0, Math.min(1, f)) ** 1.15;
export function gainEnergy(L, qi, step, blanks, count, combo) {
  const base = baseEnergy((qi + (step + 1) / blanks) / count) - baseEnergy((qi + step / blanks) / count);
  return Math.min(9.08, L + Math.max(.003, base) * (1 + Math.min(1, combo / 20)));
}
export const displayEnergy = (L) => Math.round(10 ** L).toLocaleString('zh-CN');

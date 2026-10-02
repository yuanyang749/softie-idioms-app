// Original Softie silhouette supplied by the user; all character art is SVG.
import { tween, easeOutBack, centerOf } from './core.js';

export const PALETTES = {
  pink: ['#ffd5e5', '#f17fa9'], blue: ['#d4edff', '#78b8f1'],
  yellow: ['#fff0ae', '#f3c459'], mint: ['#d4f5df', '#70cba6'], violet: ['#eadbff', '#b79aea'],
};
let uid = 0;
export function softieSVG(palette = 'pink', { happy = false } = {}) {
  const id = `softie-fill-${uid++}`;
  const colors = PALETTES[palette] || PALETTES.pink;
  return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="24" y1="5" x2="24" y2="43" gradientUnits="userSpaceOnUse"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs>
    <ellipse cx="24" cy="44" rx="16" ry="2" fill="#221d20" opacity=".1"/>
    <g class="slime-body"><path d="M24 5c-5.9 0-6.3 7.2-10.3 9.8C7.6 18.7 5 24.2 5 30.3 5 38.8 12.6 43 24 43s19-4.2 19-12.7c0-6.1-2.6-11.6-8.7-15.5C30.3 12.2 29.9 5 24 5Z" stroke="#221d20" stroke-width="1.7" stroke-linejoin="round" fill="url(#${id})"/>
    <path d="M13 23q-4 4-3 8" stroke="white" stroke-width="2.2" stroke-linecap="round" opacity=".65"/>
    <circle cx="13.2" cy="31.2" r="2.4" fill="#ef6d98" opacity=".5"/><circle cx="34.8" cy="31.2" r="2.4" fill="#ef6d98" opacity=".5"/>
    <g class="slime-eyes">${happy ? '<path d="M15 28q2-4 4 0m10 0q2-4 4 0" stroke="#221d20" stroke-width="1.8" stroke-linecap="round"/>' : '<circle cx="17.2" cy="27.8" r="2.3" fill="#221d20"/><circle cx="18" cy="27" r=".75" fill="white"/><circle cx="30.8" cy="27.8" r="2.3" fill="#221d20"/><circle cx="31.6" cy="27" r=".75" fill="white"/>'}</g>
    <path class="slime-mouth" d="M21.2 31.5q2.8 3.2 5.6 0" stroke="#221d20" stroke-width="1.8" stroke-linecap="round"/>
    </g></svg>`;
}

export function softieSprite(palette, size = 96) {
  const img = new Image(size, size);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(softieSVG(palette))}`;
  return img;
}

export function mountSofties(container, count = 5) {
  container.innerHTML = Object.keys(PALETTES).slice(0, count).map((color, i) => `<div class="softie softie-${color}" style="--i:${i};--slime-color:${PALETTES[color][1]}" data-color="${color}">${softieSVG(color)}</div>`).join('');
  return [...container.children];
}

export function bounce(actor, { big = false, reduced = false, spin = false, audio, valid = () => true } = {}) {
  if (reduced) return;
  actor.getAnimations().filter((a) => a.id === 'softie-hop').forEach((a) => a.cancel());
  audio?.jump(big ? .9 : .3);
  const animation = actor.animate([
    { transform: 'translateY(0) scale(1,1)' },
    { transform: 'translateY(3px) scale(1.18,.8)', offset: .18 },
    { transform: `translateY(-${big ? 76 : 20}px) rotate(${spin ? 180 : -8}deg) scale(.88,1.14)`, offset: .46 },
    { transform: `translateY(0) rotate(${spin ? 360 : 5}deg) scale(1.16,.86)`, offset: .8 },
    { transform: `translateY(0) rotate(${spin ? 360 : 0}deg) scale(1,1)` },
  ], { duration: big ? 750 : 480, easing: 'ease-in-out', id: 'softie-hop' });
  animation.onfinish = () => { if (valid()) audio?.land(); };
}

// Slime spits a bubble at the chosen character, then carries it to the blank.
// Read positions at each leg, so a viewport change cannot leave stale endpoints.
export async function bubbleHit(actor, option, slot, { correct, reduced, layer, fx, audio, valid, motion }) {
  // Same grab/place sounds in both visual modes.
  audio.grab();
  if (reduced) { audio.place(); return; }
  bounce(actor);
  const ns = 'http://www.w3.org/2000/svg';
  const bubble = document.createElementNS(ns, 'g');
  const color = PALETTES[actor.dataset.color][1];
  bubble.innerHTML = `<circle r="24" fill="${color}" fill-opacity=".4" stroke="#403447" stroke-width="2.3"/><path d="M-14 -7q2-9 10-10" stroke="white" stroke-width="4" stroke-linecap="round"/><text text-anchor="middle" dominant-baseline="central" font-size="27" font-weight="900" fill="#302238"></text>`;
  layer.append(bubble);
  const fly = async (from, to, duration, withText = false) => {
    if (withText) bubble.querySelector('text').textContent = option.dataset.char;
    await tween(duration, (k, raw) => {
      if (!valid() || !motion()) { bubble.remove(); return; }
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k - Math.sin(raw * Math.PI) * 70;
      bubble.setAttribute('transform', `translate(${x} ${y}) scale(${.8 + Math.sin(raw * Math.PI) * .3})`);
    });
  };
  try {
    await fly(centerOf(actor), centerOf(option), 340);
    if (!valid()) return;
    if (!motion()) { audio.place(); return; }
    const hit = centerOf(option);
    fx.ring(hit.x, hit.y, { color, radius: 48, width: 5 });
    fx.burst(hit.x, hit.y, { count: 10, speed: 220, kinds: ['bubble', 'star'], life: .55 });
    audio.place();
    option.animate([{ transform: 'scale(1)' }, { transform: 'scale(.84,1.1)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
    if (correct) await fly(hit, centerOf(slot), 380, true);
    else await tween(230, (k) => { bubble.setAttribute('transform', `translate(${hit.x} ${hit.y - k * 20}) scale(${1 + k * .7})`); bubble.style.opacity = 1 - k; }, easeOutBack);
  } finally { bubble.remove(); }
}

// Wall-clock countdown. Animations, explanations, dialogs and background tabs
// do not spend the player's thinking time. Both blanks share one budget.
export function questionSeconds(mode, level) {
  return mode.levels.find((item) => item.id === level)?.seconds ?? 30;
}
export function countdown(left, elapsed, active) {
  return active ? Math.max(0, left - Math.max(0, elapsed)) : left;
}

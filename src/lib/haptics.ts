type Pattern = number | number[];

export function vibrate(pattern: Pattern): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // haptics are a nice-to-have
  }
}

export const haptics = {
  tap: () => vibrate(8),
  flip: () => vibrate([12, 40, 18]),
  caught: () => vibrate([24, 60, 24, 60, 70]),
  escaped: () => vibrate([18, 80, 18]),
  win: () => vibrate([30, 60, 30, 60, 30, 80, 100]),
  error: () => vibrate([60, 50, 60]),
};

/**
 * Color wheel geometry (M14). Hue is the angle counter-clockwise from the
 * right (0° red, 120° green, 240° blue, like the HSV wheel); saturation is
 * the distance from the center, 0 at the center and 100 at the rim.
 */

/** Wheel value for a point relative to the wheel's center (y down, as on screen). */
export function wheelFromPoint(dx: number, dy: number, radius: number): { hue: number; sat: number } {
  const distance = Math.hypot(dx, dy);
  const sat = Math.round(Math.min(1, distance / radius) * 100);
  const hue = sat === 0 ? 0 : Math.round(((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360) % 360;
  return { hue, sat };
}

/** Puck position relative to the center (y down). */
export function pointFromWheel(hue: number, sat: number, radius: number): { x: number; y: number } {
  const r = (Math.min(100, Math.max(0, sat)) / 100) * radius;
  const a = (hue * Math.PI) / 180;
  return { x: r * Math.cos(a), y: -r * Math.sin(a) };
}

/** Wheel background: the hue ring (CSS conic angles run clockwise from the top). */
export function wheelGradient(): string {
  const stops: string[] = [];
  for (let deg = 0; deg <= 360; deg += 30) stops.push(`hsl(${(360 - deg) % 360} 85% 55%) ${deg}deg`);
  return `radial-gradient(circle closest-side, #8a8a8a, rgba(138, 138, 138, 0)), conic-gradient(from 90deg, ${stops.join(', ')})`;
}

/** Arrow keys on the wheel: left/right turn the hue, up/down change saturation (Shift: bigger steps). */
export function nudgeWheel(w: { hue: number; sat: number }, key: string, big: boolean): { hue: number; sat: number } | null {
  const step = big ? 10 : 1;
  switch (key) {
    case 'ArrowLeft':
      return { ...w, hue: (w.hue + step) % 360 };
    case 'ArrowRight':
      return { ...w, hue: (w.hue - step + 360) % 360 };
    case 'ArrowUp':
      return { ...w, sat: Math.min(100, w.sat + step) };
    case 'ArrowDown':
      return { ...w, sat: Math.max(0, w.sat - step) };
    default:
      return null;
  }
}

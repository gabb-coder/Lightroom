/** A press of `\` shorter than this toggles Before/After; longer is a peek. */
export const PEEK_TAP_MS = 250;

interface BeforeAfterActions {
  setPeeking: (peeking: boolean) => void;
  toggleBefore: () => void;
}

/**
 * `\` key behavior: while held, show the original (peek). A quick tap
 * toggles Before/After instead. Repeated keydowns while held are ignored.
 *
 * Times are the key events' own timestamps, not the time the handler runs:
 * a slow render between keydown and keyup must not turn a tap into a hold.
 */
export function createBeforeAfterKeys(actions: BeforeAfterActions) {
  let pressedAt: number | null = null;
  return {
    keyDown(time: number): void {
      if (pressedAt !== null) return;
      pressedAt = time;
      actions.setPeeking(true);
    },
    keyUp(time: number): void {
      if (pressedAt === null) return;
      const held = time - pressedAt;
      pressedAt = null;
      actions.setPeeking(false);
      if (held < PEEK_TAP_MS) actions.toggleBefore();
    },
    /** Window lost focus mid-press: stop peeking without toggling. */
    cancel(): void {
      if (pressedAt === null) return;
      pressedAt = null;
      actions.setPeeking(false);
    },
  };
}

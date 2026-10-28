import { describe, expect, it } from 'vitest';
import { createBeforeAfterKeys, PEEK_TAP_MS } from './beforeAfterKeys';

function setup() {
  const state = { peeking: false, before: false };
  const keys = createBeforeAfterKeys({
    setPeeking: (p) => (state.peeking = p),
    toggleBefore: () => (state.before = !state.before),
  });
  return { keys, state };
}

describe('Before/After key', () => {
  it('a quick tap toggles Before/After', () => {
    const { keys, state } = setup();
    keys.keyDown(1000);
    expect(state.peeking).toBe(true);
    keys.keyUp(1080);
    expect(state).toEqual({ peeking: false, before: true });
    keys.keyDown(2000);
    keys.keyUp(2080);
    expect(state.before).toBe(false);
  });

  it('holding peeks at the original and returns on release without toggling', () => {
    const { keys, state } = setup();
    keys.keyDown(1000);
    keys.keyDown(1030); // auto-repeat while held
    expect(state.peeking).toBe(true);
    keys.keyUp(1000 + PEEK_TAP_MS + 400);
    expect(state).toEqual({ peeking: false, before: false });
  });

  it('uses event times, so a tap stays a tap however late the handler runs', () => {
    const { keys, state } = setup();
    keys.keyDown(1000);
    keys.keyUp(1050); // even if this handler only runs 500 ms later
    expect(state.before).toBe(true);
  });

  it('cancel stops a peek without toggling', () => {
    const { keys, state } = setup();
    keys.keyDown(1000);
    keys.cancel();
    keys.keyUp(1010);
    expect(state).toEqual({ peeking: false, before: false });
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './appStore';

describe('appStore', () => {
  beforeEach(() => useAppStore.setState({ module: 'develop' }));

  it('starts in the Develop module', () => {
    expect(useAppStore.getState().module).toBe('develop');
  });

  it('switches modules', () => {
    useAppStore.getState().setModule('library');
    expect(useAppStore.getState().module).toBe('library');
  });
});

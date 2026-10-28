import { beforeEach, describe, expect, it } from 'vitest';
import { defaultEditSettings } from '../model/editSettings';
import { useDevelopStore, type LoadedPhoto } from './developStore';

const fakePhoto = (name: string): LoadedPhoto => ({ name, width: 4, height: 3, bitmap: {} as ImageBitmap });

describe('developStore', () => {
  beforeEach(() => useDevelopStore.setState({ photo: null, settings: defaultEditSettings(), interacting: false }));

  it('updates one basic value without mutating the previous settings', () => {
    const before = useDevelopStore.getState().settings;
    useDevelopStore.getState().setBasic('exposure', 1.25);
    const after = useDevelopStore.getState().settings;
    expect(after.basic.exposure).toBe(1.25);
    expect(before.basic.exposure).toBe(0);
    expect(after.curve).toBe(before.curve);
  });

  it('keeps the same settings object when the value is unchanged', () => {
    const before = useDevelopStore.getState().settings;
    useDevelopStore.getState().setBasic('contrast', 0);
    expect(useDevelopStore.getState().settings).toBe(before);
  });

  it('resets settings when a new photo is opened', () => {
    useDevelopStore.getState().setBasic('saturation', -40);
    useDevelopStore.getState().openPhoto(fakePhoto('a.jpg'));
    expect(useDevelopStore.getState().settings).toEqual(defaultEditSettings());
    expect(useDevelopStore.getState().photo?.name).toBe('a.jpg');
  });
});

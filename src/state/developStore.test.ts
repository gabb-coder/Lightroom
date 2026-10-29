import { beforeEach, describe, expect, it } from 'vitest';
import { defaultEditSettings } from '../model/editSettings';
import { historyEntryValue } from '../model/historyDisplay';
import { SAMPLE_PRESETS } from '../model/presets';
import { useDevelopStore, type LoadedPhoto } from './developStore';

const fakePhoto = (name: string): LoadedPhoto => ({ id: name, name, width: 4, height: 3, bitmap: {} as ImageBitmap });
const store = () => useDevelopStore.getState();
const labels = () => store().history.entries.map((e) => [e.label, historyEntryValue(e)]);

describe('developStore', () => {
  beforeEach(() => store().loadPhoto(fakePhoto('a.jpg')));

  it('records each edit as a history step, merging consecutive changes to one slider', () => {
    store().setBasic('exposure', 0.2);
    store().setBasic('exposure', 0.35); // same slider: merged (e.g. one drag)
    store().setBasic('contrast', 12);
    store().setBasic('temp', 6);
    store().setTreatment('bw');
    expect(labels()).toEqual([
      ['Import', ''],
      ['Exposure', '+0.35'],
      ['Contrast', '+12'],
      ['Temperature', '+6'],
      ['Treatment', 'B&W'],
    ]);
  });

  it('ignores edits that change nothing', () => {
    store().setBasic('contrast', 0);
    store().setTreatment('color');
    expect(store().history.entries).toHaveLength(1);
  });

  it('undo/redo restore the exact settings of each step', () => {
    store().setBasic('exposure', 0.35);
    const afterExposure = store().settings;
    store().setBasic('highlights', -38);
    const afterHighlights = store().settings;

    store().undo();
    expect(store().settings).toBe(afterExposure);
    expect(store().settings).toEqual({ ...defaultEditSettings(), basic: { ...defaultEditSettings().basic, exposure: 0.35 } });
    store().undo();
    expect(store().settings).toEqual(defaultEditSettings());
    store().redo();
    store().redo();
    expect(store().settings).toBe(afterHighlights);
  });

  it('a preset is one step that replaces all settings', () => {
    store().setBasic('exposure', 1);
    const faded = SAMPLE_PRESETS.find((p) => p.name === 'Faded');
    if (!faded) throw new Error('missing preset');
    store().applyPreset(faded);
    expect(labels().at(-1)).toEqual(['Preset: Faded', '']);
    expect(store().settings.basic).toMatchObject({ exposure: 0, contrast: -30, blacks: 40, saturation: -25 });
    store().undo();
    expect(store().settings.basic.exposure).toBe(1);
  });

  it('Reset all is one step back to defaults', () => {
    store().setBasic('shadows', 40);
    store().setBasic('vibrance', 15);
    store().resetAll();
    expect(labels().at(-1)).toEqual(['Reset all', '']);
    expect(store().settings).toEqual(defaultEditSettings());
    expect(store().history.entries).toHaveLength(4);
  });

  it('clicking a history step jumps there; a new edit drops the later steps', () => {
    store().setBasic('exposure', 0.5);
    store().setBasic('contrast', 20);
    store().setBasic('shadows', 30);
    store().goToHistory(1);
    expect(store().settings.basic).toMatchObject({ exposure: 0.5, contrast: 0, shadows: 0 });
    store().setBasic('whites', 10);
    expect(labels()).toEqual([
      ['Import', ''],
      ['Exposure', '+0.50'],
      ['Whites', '+10'],
    ]);
  });

  it('opening a photo starts a fresh history', () => {
    store().setBasic('saturation', -40);
    store().loadPhoto(fakePhoto('b.jpg'));
    expect(store().settings).toEqual(defaultEditSettings());
    expect(store().history.entries).toHaveLength(1);
    expect(store().photo?.name).toBe('b.jpg');
  });
});

describe('loading a saved photo', () => {
  it('restores its saved history and cursor', () => {
    store().loadPhoto(fakePhoto('a.jpg'));
    store().setBasic('exposure', 0.5);
    store().setBasic('contrast', 10);
    store().undo();
    const saved = store().history;
    store().loadPhoto(fakePhoto('b.jpg'));
    store().loadPhoto(fakePhoto('a.jpg'), saved);
    expect(store().history).toBe(saved);
    expect(store().settings.basic).toMatchObject({ exposure: 0.5, contrast: 0 });
  });
});

describe('geometry edits', () => {
  beforeEach(() => store().loadPhoto({ id: 'g', name: 'g.jpg', width: 600, height: 400, bitmap: {} as ImageBitmap }));

  it('a crop drag is one history step; re-editing starts from the stored crop', () => {
    store().setCrop({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    store().setCrop({ x: 0.1, y: 0.1, w: 0.6, h: 0.7 });
    expect(labels().at(-1)).toEqual(['Crop', '']);
    expect(store().history.entries).toHaveLength(2);
    expect(store().settings.geometry.cropRect).toEqual({ x: 0.1, y: 0.1, w: 0.6, h: 0.7 });
  });

  it('straightening shrinks the crop to fit, and returning to 0° restores it', () => {
    store().setAngle(5);
    store().setAngle(12);
    const shrunk = store().settings.geometry.cropRect;
    expect(shrunk.w).toBeLessThan(1);
    expect(labels().at(-1)).toEqual(['Straighten', '+12.0°']);
    store().setAngle(0);
    expect(store().settings.geometry.cropRect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(store().history.entries).toHaveLength(2);
  });

  it('aspect presets, rotate and flip are recorded and undoable', () => {
    store().setAspect('1:1');
    const square = store().settings.geometry.cropRect;
    expect((square.w * 600) / (square.h * 400)).toBeCloseTo(1, 9);
    store().rotate90();
    expect(store().settings.geometry.rotation).toBe(1);
    store().flipHorizontal();
    expect(labels().slice(-3).map(([l]) => l)).toEqual(['Crop aspect', 'Rotate 90°', 'Flip horizontal']);
    store().undo();
    store().undo();
    expect(store().settings.geometry.rotation).toBe(0);
    expect(store().settings.geometry.cropRect).toEqual(square);
  });

  it('the crop tool needs a photo and turns off when another photo loads', () => {
    store().setCropping(true);
    expect(store().cropping).toBe(true);
    store().loadPhoto(fakePhoto('other.jpg'));
    expect(store().cropping).toBe(false);
  });
});

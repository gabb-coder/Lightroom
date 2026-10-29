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

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

describe('tone curve and color mixer edits', () => {
  beforeEach(() => store().loadPhoto(fakePhoto('c.jpg')));

  it('records color mixer changes with design labels, merging drags of one slider', () => {
    store().setHsl('red', 'sat', -20);
    store().setHsl('red', 'sat', -45);
    store().setHsl('blue', 'hue', 30);
    expect(labels().slice(1)).toEqual([
      ['Red saturation', '−45'],
      ['Blue hue', '+30'],
    ]);
  });

  it('a curve drag is one step per channel; removing a point is its own step; undo restores points', () => {
    const lifted = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.6 },
      { x: 1, y: 1 },
    ];
    store().setCurve('rgb', [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }]);
    store().setCurve('rgb', lifted);
    store().setCurve('r', lifted);
    store().setCurve('rgb', [{ x: 0, y: 0 }, { x: 1, y: 1 }], false);
    expect(labels().slice(1).map(([l]) => l)).toEqual(['Tone curve', 'Tone curve', 'Tone curve']);
    store().undo();
    expect(store().settings.curve.rgb).toEqual(lifted);
    expect(store().settings.curve.r).toEqual(lifted);
  });
});

describe('detail and effects edits', () => {
  beforeEach(() => store().loadPhoto(fakePhoto('d.jpg')));

  it('records each slider with its design label and value, merging drags of one slider', () => {
    store().setDetail('sharpAmount', 30);
    store().setDetail('sharpAmount', 70);
    store().setDetail('sharpRadius', 1.5);
    store().setEffect('vignette', -10);
    store().setEffect('vignette', -22);
    store().setEffect('grain', 30);
    store().setEffect('grainSize', 60);
    expect(labels().slice(1)).toEqual([
      ['Sharpening', '70'],
      ['Sharpen radius', '1.5'],
      ['Vignette', '−22'],
      ['Grain', '30'],
      ['Grain size', '60'],
    ]);
    store().undo();
    expect(store().settings.effects.grainSize).toBe(25);
  });

  it('ignores a set to the current value', () => {
    store().setEffect('vignette', 0);
    expect(labels()).toHaveLength(1);
  });
});

describe('applying whole settings (paste, sync, Previous)', () => {
  beforeEach(() => store().loadPhoto(fakePhoto('e.jpg')));

  it('is one undoable history step, and none when nothing changes', () => {
    const next = structuredClone(store().settings);
    next.basic.exposure = 1;
    next.effects.grain = 40;
    store().applySettings('Paste settings', next);
    expect(labels().slice(1)).toEqual([['Paste settings', '']]);
    store().applySettings('Paste settings', structuredClone(next));
    expect(labels()).toHaveLength(2);
    store().undo();
    expect(store().settings.basic.exposure).toBe(0);
    expect(store().settings.effects.grain).toBe(0);
  });

  it('remembers the previously shown photo', () => {
    expect(store().previousPhotoId).not.toBe('f.jpg');
    const before = store().photo?.id;
    store().loadPhoto(fakePhoto('f.jpg'));
    expect(store().previousPhotoId).toBe(before);
  });
});

describe('masks (M15)', () => {
  beforeEach(() => store().loadPhoto(fakePhoto('m.jpg')));
  const radial = (id: string) => ({ id, kind: 'radial' as const, cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2, angle: 0, feather: 50, invert: false, adjust: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temp: 0, tint: 0, saturation: 0 } });

  it('drawing a mask is one step however many updates it takes, and selects it', () => {
    store().putMask(radial('a'), 'masks.a.draw');
    store().putMask({ ...radial('a'), rx: 0.3 }, 'masks.a.draw');
    expect(labels().slice(1)).toEqual([['New radial gradient', '']]);
    expect(store().selectedMaskId).toBe('a');
    expect(store().settings.masks[0]).toMatchObject({ rx: 0.3 });
  });

  it('slider edits merge per mask and property; shape drags merge per key; delete is a step', () => {
    store().putMask(radial('a'), 'masks.a.draw');
    store().setMaskAdjust('a', 'exposure', 0.5);
    store().setMaskAdjust('a', 'exposure', 1);
    store().updateMask('a', { cx: 0.4 }, 'Radial gradient', 'masks.a.shape');
    store().updateMask('a', { cx: 0.3 }, 'Radial gradient', 'masks.a.shape');
    store().removeMask('a');
    expect(labels().slice(1)).toEqual([
      ['New radial gradient', ''],
      ['Mask exposure', '+1.00'],
      ['Radial gradient', ''],
      ['Delete mask', ''],
    ]);
    expect(store().selectedMaskId).toBeNull();
    store().undo();
    expect(store().settings.masks[0]).toMatchObject({ cx: 0.3, adjust: { exposure: 1 } });
  });

  it('the crop tool cancels drawing a mask', () => {
    store().setMaskTool('linear');
    store().setCropping(true);
    expect(store().maskTool).toBeNull();
  });
});

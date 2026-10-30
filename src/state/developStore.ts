import { create } from 'zustand';
import { orientedSize } from '../engine/geometry';
import { cropForAspect, fitCropToAngle, flipGeometryH, rotateGeometry90 } from '../model/crop';
import {
  defaultEditSettings,
  type BasicSliderKey,
  type CropAspect,
  type DetailKey,
  type GradeRegion,
  type Mask,
  type MaskAdjustKey,
  type MaskKind,
  MAX_MASKS,
  MAX_SPOTS,
  type Spot,
  type GradeWheel,
  type EffectsKey,
  type HslColor,
  type Point,
  type EditSettings,
  type Geometry,
  type Rect,
  type Treatment,
} from '../model/editSettings';
import {
  createHistory,
  currentSettings,
  goToHistory,
  pushHistory,
  redo,
  undo,
  type History,
  type HistoryEntry,
} from '../model/history';
import { basicHistoryKey, basicHistoryLabel } from '../model/historyDisplay';
import { applyPresetTo, type Preset } from '../model/presets';
import { jsonEqual } from '../model/compare';
import { DEFAULT_SPOT_OPTIONS, spotRadius, type SpotOptions } from '../model/spotEdit';
import type { CurveChannel } from '../model/curveEdit';
import { BRUSH_FEATHER_SLIDER, BRUSH_SIZE_SLIDER, LENS_SLIDERS, type LensKey, DETAIL_SLIDERS, EFFECTS_SLIDERS, GRADE_REGION_LABELS, gradeSliderDef, GRADING_SLIDERS, hslSliderDef, maskSliderDef, type HslProp } from '../model/sliders';

export interface BrushOptions {
  /** 1–100 (model/maskEdit.ts brushRadius). */
  size: number;
  feather: number;
  /** Strokes erase instead of paint (Alt does this for one stroke). */
  erase: boolean;
}

/** A decoded photo ready to render. The original file is never modified. */
export interface LoadedPhoto {
  /** Catalog id. */
  id: string;
  name: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

interface DevelopState {
  photo: LoadedPhoto | null;
  /** The photo shown before this one (Develop's "Previous" button). */
  previousPhotoId: string | null;
  /** Every edit is a history step; `settings` is always the step at the cursor. */
  history: History;
  settings: EditSettings;
  /** True while a slider is being dragged or scrubbed: the renderer uses the proxy. */
  interacting: boolean;
  /** Before/After toggle (button or a tap of `\`). */
  before: boolean;
  /** True while `\` is held down to peek at the original. */
  peeking: boolean;
  /** Crop tool active: the canvas shows the whole (straightened) image with the crop overlay. */
  cropping: boolean;
  /** Mask being edited on the canvas (its handles show), or null. */
  selectedMaskId: string | null;
  /** Drawing a new mask: the next drag on the canvas places it. */
  maskTool: MaskKind | null;
  /** The Masks panel is open: mask pins and handles show on the canvas. */
  masksOpen: boolean;
  /** White balance eyedropper active: the next click on the photo sets Temp/Tint (M20). */
  wbPicking: boolean;
  /** The Spot removal panel is open: clicks on the photo add spots (M28). */
  spotsOpen: boolean;
  selectedSpotId: string | null;
  /** Options for new spots; not part of the edit. */
  spotOptions: SpotOptions;
  /** Brush options for new strokes (M21); not part of the edit. */
  brush: BrushOptions;
  setBrush: (patch: Partial<BrushOptions>) => void;
  /** Shows a photo with its saved history (or a fresh one). Closes the previous bitmap. */
  loadPhoto: (photo: LoadedPhoto, history?: History) => void;
  /** Closes the open photo (e.g. it was deleted from the catalog). */
  closePhoto: () => void;
  setBasic: (key: BasicSliderKey, value: number) => void;
  setTreatment: (treatment: Treatment) => void;
  /** Sets one channel's curve; `merge` lets a drag of the same channel be one history step. */
  setCurve: (channel: CurveChannel, points: Point[], merge?: boolean) => void;
  setHsl: (color: HslColor, prop: HslProp, value: number) => void;
  setDetail: (key: DetailKey, value: number) => void;
  /** Changes one grading wheel; `prop` names the control for history ('wheel' = a drag on the wheel). */
  setGradeWheel: (region: GradeRegion, patch: Partial<GradeWheel>, prop: 'wheel' | keyof GradeWheel) => void;
  setGradeParam: (key: 'blending' | 'balance', value: number) => void;
  /** Adds (or, with the same `drawKey` while drawing, updates) a mask as one history step, and selects it. */
  putMask: (mask: Mask, drawKey: string) => void;
  /** Changes a mask; `key` merges a drag into one step. */
  updateMask: (id: string, patch: Partial<Mask>, label: string, key: string | null) => void;
  setMaskAdjust: (id: string, prop: MaskAdjustKey, value: number) => void;
  removeMask: (id: string) => void;
  selectMask: (id: string | null) => void;
  setMaskTool: (tool: MaskKind | null) => void;
  setMasksOpen: (open: boolean) => void;
  setEffect: (key: EffectsKey, value: number) => void;
  /** Adds a spot as one history step and selects it. */
  addSpot: (spot: Spot) => void;
  /** Changes a spot; `key` merges a drag into one step. */
  updateSpot: (id: string, patch: Partial<Spot>, label: string, key: string | null) => void;
  removeSpot: (id: string) => void;
  clearSpots: () => void;
  selectSpot: (id: string | null) => void;
  setSpotsOpen: (open: boolean) => void;
  /** Changes an option for new spots, and the selected spot's too. */
  setSpotOption: <K extends keyof SpotOptions>(key: K, value: SpotOptions[K]) => void;
  applyPreset: (preset: Preset) => void;
  /** Replaces all settings as one history step (paste, sync, Previous); no step if nothing changes. */
  applySettings: (label: string, settings: EditSettings) => void;
  resetAll: () => void;
  undo: () => void;
  redo: () => void;
  goToHistory: (index: number) => void;
  setInteracting: (interacting: boolean) => void;
  setCropping: (cropping: boolean) => void;
  setWbPicking: (on: boolean) => void;
  setCrop: (rect: Rect) => void;
  setAngle: (angle: number) => void;
  /** Lens and perspective (M29). */
  setLens: (key: LensKey, value: number) => void;
  setAspect: (aspect: CropAspect) => void;
  rotate90: () => void;
  flipHorizontal: () => void;
  toggleBefore: () => void;
  setPeeking: (peeking: boolean) => void;
}

/** True when the canvas should show the original with no adjustments. */
export const selectShowingBefore = (s: Pick<DevelopState, 'before' | 'peeking'>): boolean => s.before || s.peeking;

/** State patch for a new history step. */
function commit(history: History, entry: HistoryEntry): Pick<DevelopState, 'history' | 'settings'> {
  return { history: pushHistory(history, entry), settings: entry.settings };
}

/** State patch for moving the history cursor. */
function moveTo(history: History): Pick<DevelopState, 'history' | 'settings'> {
  return { history, settings: currentSettings(history) };
}

/** Oriented size (after quarter turns) of the open photo, for crop math. */
function photoOrientedSize(s: Pick<DevelopState, 'photo'>, g: Geometry) {
  return orientedSize({ width: s.photo?.width ?? 1, height: s.photo?.height ?? 1 }, g.rotation);
}

function withGeometry(settings: EditSettings, patch: Partial<Geometry>): EditSettings {
  return { ...settings, geometry: { ...settings.geometry, ...patch } };
}

/**
 * The crop a straighten drag starts from. While dragging, consecutive angle
 * changes merge into one history step, so the step before it still holds the
 * crop from before the drag: returning to 0° restores it instead of keeping
 * the shrunken one.
 */
function straightenBaseCrop(s: Pick<DevelopState, 'history' | 'settings'>): Rect {
  const { entries, cursor } = s.history;
  const tip = entries[cursor];
  const previous = entries[cursor - 1];
  if (cursor === entries.length - 1 && tip?.key === 'geometry.angle' && previous) return previous.settings.geometry.cropRect;
  return s.settings.geometry.cropRect;
}

function initialEditState(history?: History): Pick<DevelopState, 'history' | 'settings'> {
  const h = history ?? createHistory(defaultEditSettings());
  return { history: h, settings: currentSettings(h) };
}

/**
 * Edit store for the open photo: its settings history and view state.
 * Saved to the catalog by state/editPersistence.ts.
 */
export const useDevelopStore = create<DevelopState>()((set) => ({
  photo: null,
  previousPhotoId: null,
  ...initialEditState(),
  interacting: false,
  before: false,
  peeking: false,
  cropping: false,
  selectedMaskId: null,
  maskTool: null,
  masksOpen: false,
  wbPicking: false,
  spotsOpen: false,
  selectedSpotId: null,
  spotOptions: DEFAULT_SPOT_OPTIONS,
  brush: { size: BRUSH_SIZE_SLIDER.defaultValue, feather: BRUSH_FEATHER_SLIDER.defaultValue, erase: false },
  setBrush: (patch) => set((s) => ({ brush: { ...s.brush, ...patch } })),
  loadPhoto: (photo, history) =>
    set((s) => {
      if (s.photo && s.photo.bitmap !== photo.bitmap) s.photo.bitmap.close?.();
      const previousPhotoId = s.photo && s.photo.id !== photo.id ? s.photo.id : s.previousPhotoId;
      return { photo, previousPhotoId, ...initialEditState(history), interacting: false, before: false, peeking: false, cropping: false, selectedMaskId: null, maskTool: null, wbPicking: false, selectedSpotId: null };
    }),
  closePhoto: () =>
    set((s) => {
      s.photo?.bitmap.close?.();
      return { photo: null, ...initialEditState(), interacting: false, before: false, peeking: false, cropping: false, selectedMaskId: null, maskTool: null, wbPicking: false, selectedSpotId: null };
    }),
  setBasic: (key, value) =>
    set((s) => {
      if (s.settings.basic[key] === value) return s;
      const settings = { ...s.settings, basic: { ...s.settings.basic, [key]: value } };
      return commit(s.history, { label: basicHistoryLabel(key), key: basicHistoryKey(key), settings });
    }),
  setTreatment: (treatment) =>
    set((s) => {
      if (s.settings.basic.treatment === treatment) return s;
      const settings = { ...s.settings, basic: { ...s.settings.basic, treatment } };
      return commit(s.history, { label: basicHistoryLabel('treatment'), key: basicHistoryKey('treatment'), settings });
    }),
  setCurve: (channel, points, merge = true) =>
    set((s) => {
      const settings = { ...s.settings, curve: { ...s.settings.curve, [channel]: points } };
      return commit(s.history, { label: 'Tone curve', key: merge ? `curve.${channel}` : null, settings });
    }),
  setHsl: (color, prop, value) =>
    set((s) => {
      if (s.settings.hsl[color][prop] === value) return s;
      const settings = { ...s.settings, hsl: { ...s.settings.hsl, [color]: { ...s.settings.hsl[color], [prop]: value } } };
      return commit(s.history, { label: hslSliderDef(color, prop).historyLabel ?? 'Color mixer', key: `hsl.${color}.${prop}`, settings });
    }),
  setDetail: (key, value) =>
    set((s) => {
      if (s.settings.detail[key] === value) return s;
      const settings = { ...s.settings, detail: { ...s.settings.detail, [key]: value } };
      return commit(s.history, { label: DETAIL_SLIDERS[key].historyLabel ?? DETAIL_SLIDERS[key].label, key: `detail.${key}`, settings });
    }),
  putMask: (mask, drawKey) =>
    set((s) => {
      const exists = s.settings.masks.some((m) => m.id === mask.id);
      if (!exists && s.settings.masks.length >= MAX_MASKS) return s;
      const masks = exists ? s.settings.masks.map((m) => (m.id === mask.id ? mask : m)) : [...s.settings.masks, mask];
      const label = mask.kind === 'brush' ? (mask.strokes.at(-1)?.erase ? 'Erase' : 'Brush') : mask.kind === 'linear' ? 'New linear gradient' : 'New radial gradient';
      return { ...commit(s.history, { label, key: drawKey, settings: { ...s.settings, masks } }), selectedMaskId: mask.id };
    }),
  updateMask: (id, patch, label, key) =>
    set((s) => {
      const current = s.settings.masks.find((m) => m.id === id);
      if (!current) return s;
      const next = { ...current, ...patch } as Mask;
      if (jsonEqual(next, current)) return s;
      const masks = s.settings.masks.map((m) => (m.id === id ? next : m));
      return commit(s.history, { label, key, settings: { ...s.settings, masks } });
    }),
  setMaskAdjust: (id, prop, value) =>
    set((s) => {
      const current = s.settings.masks.find((m) => m.id === id);
      if (!current || current.adjust[prop] === value) return s;
      const masks = s.settings.masks.map((m) => (m.id === id ? { ...m, adjust: { ...m.adjust, [prop]: value } } : m));
      return commit(s.history, { label: maskSliderDef(prop).historyLabel ?? 'Mask', key: `masks.${id}.${prop}`, settings: { ...s.settings, masks } });
    }),
  removeMask: (id) =>
    set((s) => {
      if (!s.settings.masks.some((m) => m.id === id)) return s;
      const settings = { ...s.settings, masks: s.settings.masks.filter((m) => m.id !== id) };
      return { ...commit(s.history, { label: 'Delete mask', key: null, settings }), selectedMaskId: s.selectedMaskId === id ? null : s.selectedMaskId };
    }),
  selectMask: (selectedMaskId) => set({ selectedMaskId }),
  setMaskTool: (maskTool) =>
    set((s) =>
      s.photo || !maskTool
        ? { maskTool, cropping: maskTool ? false : s.cropping, masksOpen: maskTool ? true : s.masksOpen, wbPicking: maskTool ? false : s.wbPicking, spotsOpen: maskTool ? false : s.spotsOpen }
        : s,
    ),
  setMasksOpen: (masksOpen) => set(() => (masksOpen ? { masksOpen, spotsOpen: false } : { masksOpen, maskTool: null, selectedMaskId: null })),
  addSpot: (spot) =>
    set((s) => {
      if (s.settings.spots.length >= MAX_SPOTS) return s;
      const settings = { ...s.settings, spots: [...s.settings.spots, spot] };
      return { ...commit(s.history, { label: spot.mode === 'clone' ? 'Clone spot' : 'Heal spot', key: null, settings }), selectedSpotId: spot.id };
    }),
  updateSpot: (id, patch, label, key) =>
    set((s) => {
      const current = s.settings.spots.find((sp) => sp.id === id);
      if (!current) return s;
      const next = { ...current, ...patch };
      if (jsonEqual(next, current)) return s;
      const spots = s.settings.spots.map((sp) => (sp.id === id ? next : sp));
      return commit(s.history, { label, key, settings: { ...s.settings, spots } });
    }),
  removeSpot: (id) =>
    set((s) => {
      if (!s.settings.spots.some((sp) => sp.id === id)) return s;
      const settings = { ...s.settings, spots: s.settings.spots.filter((sp) => sp.id !== id) };
      return { ...commit(s.history, { label: 'Delete spot', key: null, settings }), selectedSpotId: s.selectedSpotId === id ? null : s.selectedSpotId };
    }),
  clearSpots: () =>
    set((s) => (s.settings.spots.length === 0 ? s : { ...commit(s.history, { label: 'Clear spots', key: null, settings: { ...s.settings, spots: [] } }), selectedSpotId: null })),
  selectSpot: (selectedSpotId) => set({ selectedSpotId }),
  setSpotsOpen: (spotsOpen) =>
    set((s) =>
      spotsOpen
        ? s.photo
          ? { spotsOpen, masksOpen: false, maskTool: null, selectedMaskId: null, cropping: false, wbPicking: false }
          : s
        : { spotsOpen, selectedSpotId: null },
    ),
  setSpotOption: (key, value) =>
    set((s) => {
      const spotOptions = { ...s.spotOptions, [key]: value };
      const selected = s.settings.spots.find((sp) => sp.id === s.selectedSpotId);
      if (!selected) return { spotOptions };
      const patch: Partial<Spot> = key === 'size' ? { radius: spotRadius(value as number) } : { [key]: value };
      const next = { ...selected, ...patch };
      if (jsonEqual(next, selected)) return { spotOptions };
      const spots = s.settings.spots.map((sp) => (sp.id === selected.id ? next : sp));
      const label = key === 'mode' ? (value === 'clone' ? 'Clone spot' : 'Heal spot') : key === 'size' ? 'Spot size' : key === 'feather' ? 'Spot feather' : 'Spot opacity';
      return { spotOptions, ...commit(s.history, { label, key: `spots.${selected.id}.${key}`, settings: { ...s.settings, spots } }) };
    }),
  setGradeWheel: (region, patch, prop) =>
    set((s) => {
      const wheel = { ...s.settings.colorGrading[region], ...patch };
      if (jsonEqual(wheel, s.settings.colorGrading[region])) return s;
      const settings = { ...s.settings, colorGrading: { ...s.settings.colorGrading, [region]: wheel } };
      const label = prop === 'wheel' ? `${GRADE_REGION_LABELS[region]} color` : (gradeSliderDef(region, prop).historyLabel ?? 'Color grading');
      return commit(s.history, { label, key: `colorGrading.${region}.${prop}`, settings });
    }),
  setGradeParam: (key, value) =>
    set((s) => {
      if (s.settings.colorGrading[key] === value) return s;
      const settings = { ...s.settings, colorGrading: { ...s.settings.colorGrading, [key]: value } };
      return commit(s.history, { label: GRADING_SLIDERS[key].historyLabel ?? key, key: `colorGrading.${key}`, settings });
    }),
  setEffect: (key, value) =>
    set((s) => {
      if (s.settings.effects[key] === value) return s;
      const settings = { ...s.settings, effects: { ...s.settings.effects, [key]: value } };
      return commit(s.history, { label: EFFECTS_SLIDERS[key].historyLabel ?? EFFECTS_SLIDERS[key].label, key: `effects.${key}`, settings });
    }),
  applyPreset: (preset) =>
    set((s) => commit(s.history, { label: `Preset: ${preset.name}`, key: null, settings: applyPresetTo(s.settings, preset) })),
  applySettings: (label, settings) =>
    set((s) => (jsonEqual(settings, s.settings) ? s : commit(s.history, { label, key: null, settings }))),
  resetAll: () => set((s) => commit(s.history, { label: 'Reset all', key: null, settings: defaultEditSettings() })),
  undo: () => set((s) => moveTo(undo(s.history))),
  redo: () => set((s) => moveTo(redo(s.history))),
  goToHistory: (index) => set((s) => moveTo(goToHistory(s.history, index))),
  setInteracting: (interacting) => set({ interacting }),
  setCropping: (cropping) =>
    set((s) => (s.photo || !cropping ? { cropping, maskTool: cropping ? null : s.maskTool, wbPicking: cropping ? false : s.wbPicking, spotsOpen: cropping ? false : s.spotsOpen } : s)),
  setWbPicking: (on) => set((s) => (s.photo || !on ? { wbPicking: on, ...(on ? { cropping: false, maskTool: null } : {}) } : s)),
  setCrop: (rect) =>
    set((s) => {
      const c = s.settings.geometry.cropRect;
      if (c.x === rect.x && c.y === rect.y && c.w === rect.w && c.h === rect.h) return s;
      return commit(s.history, { label: 'Crop', key: 'geometry.crop', settings: withGeometry(s.settings, { cropRect: rect }) });
    }),
  setAngle: (angle) =>
    set((s) => {
      const g = s.settings.geometry;
      if (g.angle === angle) return s;
      const cropRect = fitCropToAngle(straightenBaseCrop(s), angle, photoOrientedSize(s, g));
      return commit(s.history, { label: 'Straighten', key: 'geometry.angle', settings: withGeometry(s.settings, { angle, cropRect }) });
    }),
  setLens: (key, value) =>
    set((s) => {
      if (s.settings.geometry[key] === value) return s;
      return commit(s.history, { label: LENS_SLIDERS[key].historyLabel ?? LENS_SLIDERS[key].label, key: `geometry.${key}`, settings: withGeometry(s.settings, { [key]: value }) });
    }),
  setAspect: (aspect) =>
    set((s) => {
      const g = s.settings.geometry;
      if (g.aspect === aspect) return s;
      const cropRect = cropForAspect(g, aspect, photoOrientedSize(s, g));
      return commit(s.history, { label: 'Crop aspect', key: 'geometry.aspect', settings: withGeometry(s.settings, { aspect, cropRect }) });
    }),
  rotate90: () =>
    set((s) => commit(s.history, { label: 'Rotate 90°', key: null, settings: { ...s.settings, geometry: rotateGeometry90(s.settings.geometry) } })),
  flipHorizontal: () =>
    set((s) => commit(s.history, { label: 'Flip horizontal', key: null, settings: { ...s.settings, geometry: flipGeometryH(s.settings.geometry) } })),
  toggleBefore: () => set((s) => ({ before: !s.before })),
  setPeeking: (peeking) => set({ peeking }),
}));

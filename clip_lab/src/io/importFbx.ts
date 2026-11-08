import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { Vector3, type AnimationClip, type Object3D } from 'three';
import { measureHeight } from '../shared/assets';
import { createClipEntry, type ClipEntry } from '../state/project';
import { saveFileBuffer } from './db';
import { store } from '../state/store';

const fbxLoader = new FBXLoader();

export interface LoadedRig {
  template: Object3D;
  scale: number;
  refHipsY: number;
  /** metres per hips-track unit (root motion samples) */
  hipsToMetres: number;
}

export function parseFbx(buffer: ArrayBuffer): Object3D {
  return fbxLoader.parse(buffer, '');
}

export function isRokokoClip(fileName: string, clip: AnimationClip): boolean {
  return (
    fileName.toLowerCase().includes('rokoko') ||
    clip.tracks.some((t) => t.name.startsWith('mixamorigReference'))
  );
}

/** Metres per hips-track unit (hips-parent space) once the character is scaled to 1.8 m. */
export function hipsUnitToMetres(template: Object3D, scale: number): number {
  let hips: Object3D | null = null;
  template.traverse((o) => {
    if (!hips && /Hips$/.test(o.name)) hips = o;
  });
  const parent = (hips as Object3D | null)?.parent;
  if (!parent) return scale;
  template.updateMatrixWorld(true);
  return scale * (parent.getWorldScale(new Vector3()).y / Math.max(1e-6, template.scale.y));
}

/**
 * Rokoko fallback reference when no idle clip is loaded: a standing hips height in hips-track
 * units. Mixamo rest hips sit at ~0, so derive it from stature (hips ~= 0.56 of 1.8 m).
 */
export function templateHipsY(template: Object3D, scale: number): number {
  return (0.56 * 1.8) / Math.max(1e-6, hipsUnitToMetres(template, scale));
}

export function prepareCharacter(obj: Object3D): LoadedRig {
  const rawHeight = measureHeight(obj);
  const scale = rawHeight > 1e-3 ? 1.8 / rawHeight : 1;
  obj.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return { template: obj, scale, refHipsY: templateHipsY(obj, scale), hipsToMetres: hipsUnitToMetres(obj, scale) };
}

export async function importCharacterFile(file: File): Promise<LoadedRig> {
  const buffer = await file.arrayBuffer();
  await saveFileBuffer(file.name, buffer);
  const rig = prepareCharacter(parseFbx(buffer));
  store.setCharacterFile(file.name);
  return rig;
}

/**
 * Parses a clip file and stores its bytes. Returns the RAW clip (not retargeted):
 * main.ts retargets once the idle reference is known, so drop order doesn't matter.
 */
export async function importClipFile(
  file: File,
): Promise<{ entry: ClipEntry; raw: AnimationClip; isRokoko: boolean; root: Object3D }> {
  const buffer = await file.arrayBuffer();
  await saveFileBuffer(file.name, buffer);

  const obj = parseFbx(buffer);
  if (!obj.animations || obj.animations.length === 0) {
    throw new Error(`File ${file.name} contains no animation clips`);
  }
  const raw = obj.animations[0];
  const isRokoko = isRokokoClip(file.name, raw);
  const name = file.name.replace(/\.[^/.]+$/, '');
  const existing = store.getState().project.clips.find((c) => c.id === name);
  const entry = existing ?? createClipEntry(name, file.name, raw.duration, isRokoko);
  if (!existing) store.addClip(entry);
  return { entry, raw, isRokoko, root: obj };
}

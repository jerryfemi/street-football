import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { type AnimationClip, type Object3D } from 'three';
import { measureHeight, retargetRokoko } from '../shared/assets';
import { createClipEntry, type ClipEntry } from '../state/project';
import { saveFileBuffer } from './db';
import { store } from '../state/store';
import { showToast } from '../panels/Toasts';

const fbxLoader = new FBXLoader();

export interface LoadedRig {
  template: Object3D;
  scale: number;
  refHipsY: number;
}

export function parseFbx(buffer: ArrayBuffer): Object3D {
  return fbxLoader.parse(buffer, '');
}

export async function importCharacterFile(file: File): Promise<LoadedRig> {
  const buffer = await file.arrayBuffer();
  await saveFileBuffer(file.name, buffer);

  const obj = parseFbx(buffer);
  const rawHeight = measureHeight(obj);
  const scale = rawHeight > 1e-3 ? 1.8 / rawHeight : 1;

  obj.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });

  let refHipsY = 1.0;
  obj.traverse((o) => {
    if (o.name.endsWith('Hips')) {
      refHipsY = o.position.y * scale;
    }
  });

  store.setCharacterFile(file.name);
  showToast(`Loaded character: ${file.name}`, 'info');

  return { template: obj, scale, refHipsY };
}

export async function importClipFile(
  file: File,
  idleClip?: AnimationClip,
): Promise<{ entry: ClipEntry; clip: AnimationClip }> {
  const buffer = await file.arrayBuffer();
  await saveFileBuffer(file.name, buffer);

  const obj = parseFbx(buffer);
  if (!obj.animations || obj.animations.length === 0) {
    throw new Error(`File ${file.name} contains no animation clips`);
  }

  const rawClip = obj.animations[0];
  const isRokoko =
    file.name.toLowerCase().includes('rokoko') ||
    rawClip.tracks.some((t) => t.name.startsWith('mixamorigReference'));

  if (isRokoko) {
    retargetRokoko(rawClip, idleClip, true);
  }

  const name = file.name.replace(/\.[^/.]+$/, '');
  rawClip.name = name;

  const entry = createClipEntry(name, file.name, rawClip.duration, isRokoko);
  store.addClip(entry);
  showToast(`Imported clip: ${name}`, 'info');

  return { entry, clip: rawClip };
}


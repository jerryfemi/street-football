import './style.css';
import { type AnimationClip, type Object3D } from 'three';
import { store } from './state/store';
import { initToasts, showToast } from './panels/Toasts';
import { ClipList } from './panels/ClipList';
import { Inspector } from './panels/Inspector';
import { Transport } from './timeline/Transport';
import { Viewport } from './scene/Viewport';
import { CharacterRig } from './scene/CharacterRig';
import { getFileBuffer } from './io/db';
import { importCharacterFile, importClipFile, parseFbx } from './io/importFbx';
import { retargetRokoko } from './shared/assets';

const app = document.getElementById('app')!;

// 1. Build Header
const header = document.createElement('header');
header.className = 'app-header';
header.innerHTML = '<div class="app-title">CLIP LAB <span>· PANNAVERSE</span></div>';
app.appendChild(header);

// 2. Build Main Container
const main = document.createElement('div');
main.className = 'main-content';

const viewportContainer = document.createElement('div');
viewportContainer.className = 'viewport-container';

app.appendChild(main);

// 3. Initialize Panels & Viewport
initToasts(document.body);
const viewport = new Viewport(viewportContainer);

let rig: CharacterRig | null = null;
let characterTemplate: Object3D | null = null;
let characterScale = 1;
const loadedClips = new Map<string, AnimationClip>();

const onDropFiles = async (files: FileList) => {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.name.toLowerCase().endsWith('.fbx')) continue;

    try {
      // If player/character or user dropped a full mesh FBX
      if (file.name.toLowerCase().includes('player') || file.name.toLowerCase().includes('character')) {
        const loaded = await importCharacterFile(file);
        characterTemplate = loaded.template;
        characterScale = loaded.scale;
        spawnCharacter();
      } else {
        const idleClip = loadedClips.get('idle') ?? loadedClips.get('idle_soccer');
        const { entry, clip } = await importClipFile(file, idleClip);
        loadedClips.set(entry.id, clip);

        if (rig && store.getState().selectedClipId === entry.id) {
          rig.playClip(clip, entry);
        }
      }
    } catch (err) {
      console.error(err);
      showToast(`Failed loading ${file.name}: ${(err as Error).message}`, 'error');
    }
  }
};

new ClipList(main, onDropFiles);
main.appendChild(viewportContainer);
new Inspector(main);

// 4. Transport Bar
new Transport(app, (preset) => {
  viewport.setPreset(preset);
});

function spawnCharacter(): void {
  if (!characterTemplate) return;
  viewport.clearRoot();
  rig = new CharacterRig(characterTemplate, characterScale);
  viewport.add(rig.body);

  const selected = store.getSelectedClip();
  if (selected && loadedClips.has(selected.id)) {
    rig.playClip(loadedClips.get(selected.id)!, selected);
  }
}

// 5. Restore from IndexedDB on startup
async function restoreProject(): Promise<void> {
  await store.init();
  const state = store.getState();

  // Restore character
  if (state.project.characterFile) {
    const buf = await getFileBuffer(state.project.characterFile);
    if (buf) {
      const obj = parseFbx(buf);
      characterTemplate = obj;
      // Re-measure
      const rawHeight = 1.8;
      characterScale = rawHeight > 1e-3 ? 1.8 / rawHeight : 1;
      spawnCharacter();
    }
  }

  // Restore clips
  for (const entry of state.project.clips) {
    const buf = await getFileBuffer(entry.sourceFile);
    if (buf) {
      const obj = parseFbx(buf);
      if (obj.animations && obj.animations.length > 0) {
        const clip = obj.animations[0];
        const isRokoko =
          entry.sourceFile.toLowerCase().includes('rokoko') ||
          clip.tracks.some((t) => t.name.startsWith('mixamorigReference'));
        if (isRokoko) {
          retargetRokoko(clip, loadedClips.get('idle'));
        }
        clip.name = entry.id;
        loadedClips.set(entry.id, clip);
      }
    }
  }

  const selected = store.getSelectedClip();
  if (selected && loadedClips.has(selected.id) && rig) {
    rig.playClip(loadedClips.get(selected.id)!, selected);
  }
}

restoreProject().catch((err) => console.error('Failed restoring project', err));

// 6. Clip selection updates
let activeClipId: string | null = null;
store.subscribe((state) => {
  if (state.selectedClipId !== activeClipId) {
    activeClipId = state.selectedClipId;
    const clip = store.getSelectedClip();
    if (clip && loadedClips.has(clip.id) && rig) {
      rig.playClip(loadedClips.get(clip.id)!, clip);
    }
  }
});

// 7. Keyboard Shortcuts (J/K/L, Space, Arrows, 1-4)
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      store.togglePlay();
      break;
    case 'KeyK':
      store.setPlaying(false);
      break;
    case 'KeyJ':
      store.setPlaying(false);
      stepFrame(-1);
      break;
    case 'KeyL':
      store.setPlaying(true);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      stepFrame(e.shiftKey ? -10 : -1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      stepFrame(e.shiftKey ? 10 : 1);
      break;
    case 'Digit1':
      viewport.setPreset('side');
      break;
    case 'Digit2':
      viewport.setPreset('front');
      break;
    case 'Digit3':
      viewport.setPreset('top');
      break;
    case 'Digit4':
      viewport.setPreset('feet');
      break;
    case 'KeyA': {
      const clip = store.getSelectedClip();
      if (clip) {
        store.updateClip(clip.id, { status: clip.status === 'approved' ? 'marked' : 'approved' });
      }
      break;
    }
    case 'KeyZ':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      }
      break;
  }
});

function stepFrame(delta: number): void {
  const state = store.getState();
  const clip = store.getSelectedClip();
  if (!clip) return;
  const dur = Math.max(0, clip.out - clip.in);
  const fps = state.project.settings.fps || 30;
  const nextT = Math.max(0, Math.min(dur, state.currentTime + delta * (1 / fps)));
  store.setTime(nextT);
}

// 8. Animation & Render Loop
let lastTime = performance.now();
function loop(now: number): void {
  requestAnimationFrame(loop);

  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const state = store.getState();
  const clip = store.getSelectedClip();

  if (state.isPlaying && clip) {
    const dur = Math.max(0, clip.out - clip.in);
    let nextT = state.currentTime + dt * state.speed;

    if (nextT >= dur) {
      if (state.loop) {
        nextT = 0;
      } else {
        nextT = dur;
        store.setPlaying(false);
      }
    }
    store.setTime(nextT);
  }

  if (rig && clip) {
    rig.setTime(state.currentTime, clip);
  }

  viewport.render();
}

requestAnimationFrame(loop);


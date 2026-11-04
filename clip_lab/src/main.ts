import './style.css';
import { type AnimationClip, type Object3D } from 'three';
import { store } from './state/store';
import { initToasts, showToast } from './panels/Toasts';
import { ClipList } from './panels/ClipList';
import { Inspector } from './panels/Inspector';
import { Timeline } from './timeline/Timeline';
import { Transport } from './timeline/Transport';
import { BlendTester, type ChainItem } from './panels/BlendTester';
import { ShortcutsModal } from './panels/ShortcutsModal';
import { VideoSync } from './panels/VideoSync';
import { Viewport } from './scene/Viewport';
import { CharacterRig } from './scene/CharacterRig';
import { BallReplay } from './scene/BallReplay';
import { Overlays } from './scene/Overlays';
import { getFileBuffer } from './io/db';
import { importCharacterFile, importClipFile, parseFbx } from './io/importFbx';
import { retargetRokoko } from './shared/assets';
import { sampleFootTracks, type ClipFootTracks } from './analysis/footTracks';
import { detectTouches } from './analysis/detectTouches';
import { detectPlanted } from './analysis/detectPlanted';
import { mirrorClip } from './analysis/mirror';
import { smoothClip } from './analysis/smooth';
import { applyFootLock } from './analysis/footLock';
import { extractRootMotion } from './analysis/rootMotion';
import {
  buildClipsJson,
  downloadFile,
  exportPlayerGlb,
  exportProjectFile,
  importProjectFile,
} from './io/exportGame';

const app = document.getElementById('app')!;

// 1. Build Header with Polish Tools (Shortcuts, Project, Blend Tester, Export)
const header = document.createElement('header');
header.className = 'app-header';

const title = document.createElement('div');
title.className = 'app-title';
title.innerHTML = 'CLIP LAB <span>· PANNAVERSE</span>';
header.appendChild(title);

const headerActions = document.createElement('div');
headerActions.className = 'header-actions';

const shortcutsBtn = document.createElement('button');
shortcutsBtn.className = 'btn-secondary';
shortcutsBtn.textContent = '⌨ Shortcuts (?)';
shortcutsBtn.onclick = () => shortcutsModal.toggle();

const saveProjectBtn = document.createElement('button');
saveProjectBtn.className = 'btn-secondary';
saveProjectBtn.textContent = '💾 Save Project';
saveProjectBtn.onclick = () => {
  exportProjectFile(store.getState().project);
  showToast('Project file exported as project.cliplab.json', 'success');
};

const loadProjectLabel = document.createElement('label');
loadProjectLabel.className = 'btn-secondary';
loadProjectLabel.textContent = '📂 Load Project';
const loadProjectInput = document.createElement('input');
loadProjectInput.type = 'file';
loadProjectInput.accept = '.json';
loadProjectInput.style.display = 'none';
loadProjectInput.onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    try {
      const proj = await importProjectFile(file);
      await store.init();
      store.getState().project.clips = proj.clips;
      store.getState().project.characterFile = proj.characterFile;
      showToast(`Imported project with ${proj.clips.length} clips`, 'success');
    } catch (err) {
      showToast(`Failed loading project: ${(err as Error).message}`, 'error');
    }
  }
};
loadProjectLabel.appendChild(loadProjectInput);

const blendBtn = document.createElement('button');
blendBtn.className = 'btn-secondary';
blendBtn.textContent = '🔗 Blend Tester';
blendBtn.onclick = () => blendTester.toggle();

const exportJsonBtn = document.createElement('button');
exportJsonBtn.className = 'btn-secondary';
exportJsonBtn.textContent = '📥 clips.json';
exportJsonBtn.onclick = () => {
  const project = store.getState().project;
  const data = buildClipsJson(project);
  downloadFile('clips.json', JSON.stringify(data, null, 2), 'application/json');
  showToast(`Exported clips.json with ${Object.keys(data.clips).length} clips`, 'success');
};

const exportGlbBtn = document.createElement('button');
exportGlbBtn.className = 'btn-secondary';
exportGlbBtn.textContent = '📦 player.glb';
exportGlbBtn.onclick = async () => {
  if (!characterTemplate) {
    showToast('No character loaded to export GLB', 'warn');
    return;
  }
  showToast('Packing and optimizing player.glb...', 'info');
  try {
    const bytes = await exportPlayerGlb(
      characterTemplate,
      loadedClips,
      store.getState().project.clips,
    );
    downloadFile('player.glb', bytes, 'model/gltf-binary');
    showToast(`player.glb exported successfully (${(bytes.byteLength / (1024 * 1024)).toFixed(2)} MB)`, 'success');
  } catch (err) {
    console.error(err);
    showToast(`Export failed: ${(err as Error).message}`, 'error');
  }
};

headerActions.append(shortcutsBtn, saveProjectBtn, loadProjectLabel, blendBtn, exportJsonBtn, exportGlbBtn);
header.appendChild(headerActions);
app.appendChild(header);

// 2. Build Main Container
const main = document.createElement('div');
main.className = 'main-content';

const viewportContainer = document.createElement('div');
viewportContainer.className = 'viewport-container';

app.appendChild(main);

// 3. Initialize Panels, Viewport & Video Sync
initToasts(document.body);
const shortcutsModal = new ShortcutsModal(document.body);
const videoSync = new VideoSync(viewportContainer);

const viewport = new Viewport(viewportContainer);
const overlays = new Overlays(viewport.camera, viewport.renderer.domElement);
viewport.scene.add(overlays.group);

const replay = new BallReplay();

let rig: CharacterRig | null = null;
let characterTemplate: Object3D | null = null;
let characterScale = 1;
const loadedClips = new Map<string, AnimationClip>();
const tracksCache = new Map<string, ClipFootTracks>();
const clipWarningsMap = new Map<string, number>();

const getOrComputeTracks = (clipId: string): ClipFootTracks | undefined => {
  if (tracksCache.has(clipId)) return tracksCache.get(clipId);
  const raw = loadedClips.get(clipId);
  if (!raw || !characterTemplate) return undefined;
  const tracks = sampleFootTracks(characterTemplate, characterScale, raw);
  tracksCache.set(clipId, tracks);
  return tracks;
};

// Analysis & Cleanup Actions
const runAutoDetectTouches = () => {
  const clip = store.getSelectedClip();
  if (!clip) return;
  const tracks = getOrComputeTracks(clip.id);
  if (!tracks) {
    showToast('Load a character FBX to auto-detect touches', 'warn');
    return;
  }
  const touches = detectTouches(tracks, clip);
  store.updateClip(clip.id, { touches });
  updateReplay();
  showToast(`Auto-detected ${touches.length} touches`, 'info');
};

const runAutoFillPlanted = () => {
  const clip = store.getSelectedClip();
  if (!clip) return;
  const tracks = getOrComputeTracks(clip.id);
  if (!tracks) {
    showToast('Load a character FBX to detect planted feet', 'warn');
    return;
  }
  const planted = detectPlanted(tracks, clip);
  store.updateClip(clip.id, { planted });
  timeline.draw();
  showToast(`Detected ${planted.length} planted intervals`, 'info');
};

const runBatchAutoDetect = () => {
  const state = store.getState();
  if (!characterTemplate) {
    showToast('Load a character FBX first before running batch detection', 'warn');
    return;
  }
  let count = 0;
  for (const c of state.project.clips) {
    const tracks = getOrComputeTracks(c.id);
    if (!tracks) continue;
    const touches = detectTouches(tracks, c);
    const planted = detectPlanted(tracks, c);
    store.updateClip(c.id, { touches, planted });

    const rep = replay.simulate(c, tracks);
    clipWarningsMap.set(c.id, rep.warnings.length);
    count++;
  }
  clipList.setWarningsMap(clipWarningsMap);
  updateReplay();
  showToast(`Batch processed ${count} clips!`, 'success');
};

const runMirrorClip = () => {
  const clip = store.getSelectedClip();
  if (!clip) return;
  const raw = loadedClips.get(clip.id);
  if (!raw) return;

  const mirrored = mirrorClip(raw, clip);
  loadedClips.set(mirrored.entry.id, mirrored.clip);
  store.addClip(mirrored.entry);
  store.selectClip(mirrored.entry.id);
  tracksCache.delete(mirrored.entry.id);
  showToast(`Created mirrored clip: ${mirrored.entry.name}`, 'success');
};

const runSmoothClip = (windowSize: number) => {
  const clip = store.getSelectedClip();
  if (!clip) return;
  const raw = loadedClips.get(clip.id);
  if (!raw) return;

  const smoothed = smoothClip(raw, windowSize, clip.touches);
  loadedClips.set(clip.id, smoothed);
  store.updateClip(clip.id, {
    cleanup: { ...clip.cleanup, smooth: windowSize },
  });
  if (rig) rig.playClip(smoothed, clip);
  tracksCache.delete(clip.id);
  updateReplay();
  showToast(`Applied ${windowSize}f quaternion smoothing`, 'info');
};

const runFootLock = () => {
  const clip = store.getSelectedClip();
  if (!clip || !characterTemplate) {
    showToast('Requires loaded character to solve Foot Lock IK', 'warn');
    return;
  }
  const raw = loadedClips.get(clip.id);
  if (!raw) return;

  if (clip.planted.length === 0) {
    showToast('Detect or add planted intervals first', 'warn');
    return;
  }

  showToast('Solving 2-bone IK foot locking...', 'info');
  const locked = applyFootLock(characterTemplate, characterScale, raw, clip.planted);
  loadedClips.set(clip.id, locked);
  store.updateClip(clip.id, {
    cleanup: { ...clip.cleanup, footLock: true },
  });
  if (rig) rig.playClip(locked, clip);
  tracksCache.delete(clip.id);
  updateReplay();
  showToast('Baked locked planted feet', 'success');
};

const runExtractRootMotion = () => {
  const clip = store.getSelectedClip();
  if (!clip) return;
  const raw = loadedClips.get(clip.id);
  if (!raw) return;

  const res = extractRootMotion(raw, 'xz');
  loadedClips.set(clip.id, res.clip);
  store.updateClip(clip.id, {
    rootMotion: { extracted: true, mode: 'xz' },
  });
  if (rig) rig.playClip(res.clip, clip);
  tracksCache.delete(clip.id);
  updateReplay();
  showToast(`Extracted ${res.samples.length} root motion samples`, 'success');
};

const onDropFiles = async (files: FileList) => {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.name.toLowerCase().endsWith('.fbx')) continue;

    try {
      if (file.name.toLowerCase().includes('player') || file.name.toLowerCase().includes('character')) {
        const loaded = await importCharacterFile(file);
        characterTemplate = loaded.template;
        characterScale = loaded.scale;
        tracksCache.clear();
        spawnCharacter();
        showToast(`Loaded character: ${file.name}`, 'success');
      } else {
        const idleClip = loadedClips.get('idle') ?? loadedClips.get('idle_soccer');
        const { entry, clip } = await importClipFile(file, idleClip);
        loadedClips.set(entry.id, clip);

        if (rig && store.getState().selectedClipId === entry.id) {
          rig.playClip(clip, entry);
        }
        updateReplay();
        showToast(`Loaded clip: ${entry.id}`, 'info');
      }
    } catch (err) {
      console.error(err);
      showToast(`Failed loading ${file.name}: ${(err as Error).message}`, 'error');
    }
  }
};

const clipList = new ClipList(main, onDropFiles, runBatchAutoDetect);
main.appendChild(viewportContainer);
const inspector = new Inspector(
  main,
  runAutoDetectTouches,
  runAutoFillPlanted,
  runMirrorClip,
  runSmoothClip,
  runFootLock,
  runExtractRootMotion,
);

const blendTester = new BlendTester(main, (chain) => {
  playChain(chain);
});

// 4. Timeline & Transport Bars
const timeline = new Timeline(app);
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
    updateReplay();
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
    updateReplay();
  }
}

restoreProject().catch((err) => console.error('Failed restoring project', err));

function updateReplay(): void {
  const clip = store.getSelectedClip();
  if (!clip) return;
  const tracks = getOrComputeTracks(clip.id);
  const res = replay.simulate(clip, tracks);

  overlays.updateTrajectory(res.samples);
  overlays.updateTouchGizmos(clip.touches, store.getState().selectedTouchId);
  timeline.setWarnings(res.warnings);
  inspector.setWarnings(res.warnings);

  clipWarningsMap.set(clip.id, res.warnings.length);
  clipList.setWarningsMap(clipWarningsMap);
}

// Chain playback player
function playChain(chain: ChainItem[]): void {
  if (chain.length === 0) return;
  showToast(`Playing animation blend chain (${chain.length} clips)...`, 'info');
  store.selectClip(chain[0].clipId);
  store.setTime(0);
  store.setPlaying(true);
}

// 6. Clip & Touch selection updates
let activeClipId: string | null = null;
let activeTouchId: string | null = null;
let activeTouchCount = -1;

store.subscribe((state) => {
  const clip = store.getSelectedClip();
  if (state.selectedClipId !== activeClipId) {
    activeClipId = state.selectedClipId;
    if (clip && loadedClips.has(clip.id) && rig) {
      rig.playClip(loadedClips.get(clip.id)!, clip);
    }
    updateReplay();
  } else if (clip && (clip.touches.length !== activeTouchCount || state.selectedTouchId !== activeTouchId)) {
    activeTouchCount = clip.touches.length;
    activeTouchId = state.selectedTouchId;
    updateReplay();
  }

  videoSync.setPlaying(state.isPlaying);
});

// 7. Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

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
    case 'KeyT': {
      // Add touch at current time
      const clip = store.getSelectedClip();
      if (clip) {
        const curT = store.getState().currentTime;
        const newTouch = {
          id: `touch_R_${Date.now()}`,
          t: Number(curT.toFixed(3)),
          foot: 'R' as const,
          part: 'inside' as const,
          type: 'close' as const,
          at: { x: 0.15, z: 0.35, y: 0.11 },
          to: { x: 0.15, z: 0.8 },
          arrive: 0.45,
          auto: false,
        };
        store.addTouch(clip.id, newTouch);
        showToast('Added touch at playhead', 'info');
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

  // Sync ball position from BallReplay trajectory
  if (clip) {
    replay.sampleAt(state.currentTime, viewport.ballMesh.position);
  }

  // Sync reference video playback
  videoSync.syncTime(state.currentTime);

  viewport.render();
}

requestAnimationFrame(loop);

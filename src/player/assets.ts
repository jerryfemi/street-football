import {
  AnimationClip,
  AnimationMixer,
  AnimationUtils,
  Box3,
  type Bone,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ASSETS } from '../config';

export interface CharacterAsset {
  /** Loaded model, or null if no character file was found (placeholder bodies are used). */
  template: Object3D | null;
  /** Uniform scale that makes the model ASSETS.targetHeight tall. */
  scale: number;
  clips: Map<string, AnimationClip>;
  /** When the dribble clip's touching foot meets the ball (normalised clip phases) and where (local). */
  dribbleContacts: DribbleContacts;
  /** per skill clip: where the lifted (circling) foot works around, local x/z - the stepover ball spot */
  skillSpots: Map<string, { x: number; z: number }>;
}

export interface DribbleContacts {
  /** normalised phases (0..1) in the dribble clip where the touching foot reaches the ball */
  phases: number[];
  /** local x (right) of the foot at each contact */
  xs: number[];
  /** local contact distance in front (m) */
  z: number;
}

const DEFAULT_CONTACTS: DribbleContacts = { phases: [0.1, 0.35, 0.6, 0.85], xs: [-0.08, 0.08, -0.08, 0.08], z: 0.4 };

const fbx = new FBXLoader();
const gltf = new GLTFLoader();

function url(path: string): string {
  return import.meta.env.BASE_URL + path;
}

async function loadAny(path: string): Promise<{ scene: Object3D; animations: AnimationClip[] }> {
  if (path.toLowerCase().endsWith('.fbx')) {
    const obj = await fbx.loadAsync(url(path));
    return { scene: obj, animations: obj.animations };
  }
  const g = await gltf.loadAsync(url(path));
  return { scene: g.scene, animations: g.animations };
}

/**
 * Load the character and every animation listed in config.ASSETS.
 * Missing files are skipped with a console warning - the game still runs.
 *
 * If the character is a packed .glb that already contains clips, those are used too
 * (clip names in the GLB should match the keys in ASSETS.anims).
 */
export async function loadCharacterAsset(onStatus: (msg: string) => void): Promise<CharacterAsset> {
  const clips = new Map<string, AnimationClip>();
  let template: Object3D | null = null;
  let scale = 1;

  onStatus('Loading player…');
  try {
    const res = await loadAny(ASSETS.character);
    template = res.scene;
    template.updateMatrixWorld(true);
    const h = measureHeight(template);
    scale = h > 1e-3 ? ASSETS.targetHeight / h : 1;
    for (const clip of res.animations) {
      if (clip.name && ASSETS.anims[clip.name] !== undefined) clips.set(clip.name, prepareClip(clip, clip.name));
    }
  } catch (err) {
    console.warn(`[assets] No character at public/${ASSETS.character} - using placeholder bodies.`, err);
  }

  const entries = Object.entries(ASSETS.anims);
  let i = 0;
  for (const [name, path] of entries) {
    i++;
    if (clips.has(name)) continue;
    onStatus(`Loading animations ${i}/${entries.length}…`);
    try {
      const res = await loadAny(path);
      const clip = res.animations[0];
      if (!clip) throw new Error('file has no animation');
      if (path.includes('/rokoko/')) retargetRokoko(clip, clips.get('idle') ?? clips.get('idle_soccer'));
      clips.set(name, prepareClip(clip, name));
    } catch {
      console.info(`[assets] animation "${name}" not found at public/${path} (fallback will be used)`);
    }
  }
  console.info(`[assets] loaded clips: ${[...clips.keys()].join(', ') || '(none)'}`);
  const dribble = clips.get('dribble');
  const dribbleContacts = template && dribble ? analyseContacts(template, scale, dribble) : DEFAULT_CONTACTS;
  console.info('[assets] dribble contacts', dribbleContacts);
  const skillSpots = new Map<string, { x: number; z: number }>();
  if (template) {
    for (const name of ['skill_stepover', 'skill_stepover_drag']) {
      const c = clips.get(name);
      if (c) {
        const spot = analyseCircleSpot(template, scale, c);
        if (spot) skillSpots.set(name, spot);
      }
    }
  }
  console.info('[assets] skill spots', Object.fromEntries(skillSpots));
  return { template, scale, clips, dribbleContacts, skillSpots };
}

/**
 * Stepovers: the leg circles OVER the ball, so the ball belongs at the centre of the lifted
 * foot's path (where the foot is off the ground). Read it from the clip instead of guessing.
 */
function analyseCircleSpot(template: Object3D, scale: number, clip: AnimationClip): { x: number; z: number } | null {
  const body = cloneSkinned(template);
  body.scale.setScalar(scale);
  const toes: Object3D[] = [];
  body.traverse((o) => {
    if (/(Left|Right)ToeBase$/.test(o.name)) toes.push(o);
  });
  if (toes.length < 2) return null;
  const mixer = new AnimationMixer(body);
  mixer.clipAction(clip).play();
  const p = new Vector3();
  const acc = toes.map(() => ({ n: 0, x: 0, z: 0 }));
  const n = 90;
  for (let i = 0; i <= n; i++) {
    mixer.setTime((clip.duration * i) / n);
    body.updateMatrixWorld(true);
    toes.forEach((t, k) => {
      t.getWorldPosition(p);
      if (p.y > 0.12) {
        acc[k].n++;
        acc[k].x += -p.x;
        acc[k].z += p.z;
      }
    });
  }
  mixer.stopAllAction();
  const best = acc.reduce((a, b) => (b.n > a.n ? b : a));
  if (best.n < 5) return null;
  return { x: best.x / best.n, z: Math.max(0.12, best.z / best.n) };
}

/**
 * Read the dribble clip itself to find WHEN the touching foot swings through the ball and WHERE.
 * The ball is then timed to arrive exactly there (see Match.dribble), so touches line up with the
 * animation instead of the ball floating in front of the player.
 */
function analyseContacts(template: Object3D, scale: number, clip: AnimationClip): DribbleContacts {
  const body = cloneSkinned(template);
  body.scale.setScalar(scale);
  const toes: Object3D[] = [];
  for (const side of ['Left', 'Right']) {
    body.traverse((o) => {
      if (new RegExp(`${side}ToeBase$`).test(o.name) && toes.length < (side === 'Left' ? 1 : 2)) toes.push(o);
    });
  }
  if (toes.length !== 2) return DEFAULT_CONTACTS;
  const mixer = new AnimationMixer(body);
  mixer.clipAction(clip).play();
  const n = 120;
  const p = new Vector3();
  const tr: { x: number; y: number; z: number }[][] = [[], []];
  for (let i = 0; i <= n; i++) {
    mixer.setTime((clip.duration * i) / n);
    body.updateMatrixWorld(true);
    for (let f = 0; f < 2; f++) {
      toes[f].getWorldPosition(p);
      tr[f].push({ x: -p.x, y: p.y, z: p.z }); // local right = -world x at yaw 0
    }
  }
  const maxZ = Math.max(...tr[0].map((v) => v.z), ...tr[1].map((v) => v.z));
  const cz = Math.max(0.25, Math.min(0.5, maxZ * 0.7)); // contact a bit before full extension
  const hits: { ph: number; x: number }[] = [];
  for (let f = 0; f < 2; f++) {
    for (let i = 1; i <= n; i++) {
      if (tr[f][i - 1].z < cz && tr[f][i].z >= cz && tr[f][i].y < 0.3) hits.push({ ph: i / n, x: tr[f][i].x });
    }
  }
  mixer.stopAllAction();
  if (hits.length === 0) return DEFAULT_CONTACTS;
  hits.sort((a, b) => a.ph - b.ph);
  return { phases: hits.map((h) => h.ph), xs: hits.map((h) => h.x), z: cz };
}

/**
 * Standing height in the model's units. Skinned meshes often report an empty Box3,
 * so prefer the skeleton (lowest bone -> HeadTop_End), then fall back to geometry bounds.
 */
function measureHeight(root: Object3D): number {
  let minY = Infinity;
  let maxY = -Infinity;
  const p = new Vector3();
  root.traverse((o) => {
    if ((o as Bone).isBone) {
      o.getWorldPosition(p);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  });
  if (maxY - minY > 1e-3) return (maxY - minY) * 1.04; // top bone sits a little below the crown
  const box = new Box3();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
  });
  return box.isEmpty() ? 0 : box.getSize(p).y;
}

/**
 * Rokoko "Mixamo preset" exports share bone names with the character but not its units/proportions:
 * keep only rotations, drop the extra Reference bone, and rescale hip height to this character
 * (using the idle clip's hips height as the reference). Horizontal hip travel is removed -
 * gameplay moves the player (skill playerPath), the clip only animates the body.
 */
function retargetRokoko(clip: AnimationClip, idle?: AnimationClip): void {
  clip.tracks = clip.tracks.filter(
    (t) => !t.name.startsWith('mixamorigReference') && (t.name.endsWith('.quaternion') || t.name === 'mixamorigHips.position'),
  );
  const hips = clip.tracks.find((t) => t.name === 'mixamorigHips.position');
  if (!hips) return;
  const ref = idle?.tracks.find((t) => t.name === 'mixamorigHips.position')?.values;
  const rx = ref ? ref[0] : 0;
  const ry = ref ? ref[1] : hips.values[1];
  const rz = ref ? ref[2] : 0;
  const v = hips.values;
  // Rokoko's first frame is often a snap from the reference pose; use the 3rd frame as standing height
  const y0 = v.length > 9 ? v[7] : v[1];
  for (let k = 0; k < v.length; k += 3) {
    v[k] = rx;
    v[k + 1] = ry * (v[k + 1] / y0);
    v[k + 2] = rz;
  }
}

/** Rename, remap bones, optionally strip horizontal root motion. Mutates and returns the clip. */
function prepareClip(clip: AnimationClip, name: string): AnimationClip {
  const range = ASSETS.clipRanges[name];
  if (range) {
    const fps = 30;
    clip = AnimationUtils.subclip(clip, name, Math.round(range[0] * fps), Math.round(range[1] * fps), fps);
  }
  clip.name = name;
  const remap = ASSETS.boneRemap;
  if (Object.keys(remap).length > 0) {
    for (const track of clip.tracks) {
      const dot = track.name.indexOf('.');
      const bone = track.name.slice(0, dot);
      if (remap[bone]) track.name = remap[bone] + track.name.slice(dot);
    }
  }
  if (ASSETS.lockRootMotion.includes(name)) {
    for (const track of clip.tracks) {
      if (/hips\.position$/i.test(track.name)) {
        const v = track.values;
        const x0 = v[0];
        const z0 = v[2];
        for (let k = 0; k < v.length; k += 3) {
          v[k] = x0;
          v[k + 2] = z0;
        }
      }
    }
  }
  return clip;
}

/**
 * Create one player body. Real model -> skinned clone tinted with the kit colour.
 * No model -> simple capsule placeholder so gameplay can be built before art exists.
 */
export function instantiateBody(asset: CharacterAsset, kitColor: number): { body: Object3D; isPlaceholder: boolean } {
  if (asset.template) {
    const body = cloneSkinned(asset.template);
    body.scale.setScalar(asset.scale);
    const tint = new Color(kitColor);
    body.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // skinned meshes can be culled wrongly when animated far from bind pose
      // Clone materials so the two players can be tinted differently.
      const tintMat = (mat: Material) => {
        const c = mat.clone() as MeshStandardMaterial;
        if (c.color && /shirt|jersey|kit|top|body|cloth/i.test(mat.name + ' ' + m.name)) c.color.lerp(tint, 0.6);
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(tintMat) : tintMat(m.material);
    });
    return { body, isPlaceholder: false };
  }

  const body = new Group();
  const kit = new MeshStandardMaterial({ color: kitColor, roughness: 0.6 });
  const skin = new MeshStandardMaterial({ color: 0x8d5524, roughness: 0.7 });
  const torso = new Mesh(new CapsuleGeometry(0.26, 0.7, 6, 12), kit);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new Mesh(new SphereGeometry(0.15, 16, 12), skin);
  head.position.y = 1.65;
  head.castShadow = true;
  const legGeo = new CapsuleGeometry(0.09, 0.55, 4, 8);
  const legL = new Mesh(legGeo, skin);
  const legR = new Mesh(legGeo, skin);
  legL.name = 'legL';
  legR.name = 'legR';
  legL.position.set(0.12, 0.4, 0);
  legR.position.set(-0.12, 0.4, 0);
  legL.castShadow = legR.castShadow = true;
  // nose marker so you can see facing
  const nose = new Mesh(new SphereGeometry(0.05, 8, 6), kit);
  nose.position.set(0, 1.65, 0.15);
  body.add(torso, head, legL, legR, nose);
  return { body, isPlaceholder: true };
}

import {
  Box3,
  BoxGeometry,
  Vector3,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  type Scene,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSETS, COLORS, GOAL, PITCH } from '../config';

/**
 * Street cage: turf pitch, painted lines, low boards around it, one goal at -Z.
 * Built from primitives so the game runs with zero downloaded assets.
 * Swap for a Sketchfab environment later (see docs/ANIMATION_PIPELINE.md -> Environment).
 */
/**
 * Replace the primitive visuals with the arena model, aligned so its goal line sits on GOAL.z.
 * Gameplay bounds (PITCH/GOAL) are unchanged - only what you see changes.
 */
export async function loadArena(pitch: Group): Promise<boolean> {
  try {
    const g = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + ASSETS.arena.path);
    const arena = g.scene;
    arena.position.z = GOAL.z - ASSETS.arena.goalLineZ;
    arena.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.receiveShadow = true;
      // fences/nets/posts cast shadows; big flat floors don't need to
      const size = new Box3().setFromObject(m).getSize(new Vector3());
      m.castShadow = size.y > 0.05;
    });
    for (const child of [...pitch.children]) child.visible = false;
    pitch.add(arena);
    return true;
  } catch {
    console.info(`[assets] no arena at public/${ASSETS.arena.path} (using primitive cage)`);
    return false;
  }
}

export function buildPitch(scene: Scene): Group {
  const root = new Group();
  root.name = 'Pitch';

  // Surrounding asphalt
  const asphalt = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshStandardMaterial({ color: COLORS.asphalt, roughness: 0.95 }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = -0.01;
  asphalt.receiveShadow = true;
  root.add(asphalt);

  // Turf
  const turf = new Mesh(
    new PlaneGeometry(PITCH.width, PITCH.length),
    new MeshStandardMaterial({ color: COLORS.turf, roughness: 0.9 }),
  );
  turf.rotation.x = -Math.PI / 2;
  turf.receiveShadow = true;
  root.add(turf);

  // Lines
  const lineMat = new MeshStandardMaterial({ color: COLORS.lines, roughness: 0.6 });
  const lw = 0.08;
  const hw = PITCH.width / 2;
  const hl = PITCH.length / 2;
  const addLine = (w: number, l: number, x: number, z: number) => {
    const m = new Mesh(new PlaneGeometry(w, l), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.005, z);
    m.receiveShadow = true;
    root.add(m);
  };
  addLine(PITCH.width, lw, 0, -hl + lw / 2); // goal line
  addLine(PITCH.width, lw, 0, hl - lw / 2); // back line
  addLine(lw, PITCH.length, -hw + lw / 2, 0);
  addLine(lw, PITCH.length, hw - lw / 2, 0);
  addLine(PITCH.width, lw, 0, 0); // halfway
  // small box in front of goal
  const boxW = GOAL.width + 2.4;
  const boxD = 2.2;
  addLine(boxW, lw, 0, -hl + boxD);
  addLine(lw, boxD, -boxW / 2, -hl + boxD / 2);
  addLine(lw, boxD, boxW / 2, -hl + boxD / 2);
  const circle = new Mesh(new RingGeometry(1.8, 1.8 + lw, 48), lineMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.005;
  root.add(circle);

  // Boards (cage walls) - leave a gap where the goal is
  const wallMat = new MeshStandardMaterial({ color: COLORS.walls, roughness: 0.5, metalness: 0.2 });
  const t = 0.12;
  const h = PITCH.wallHeight;
  const addWall = (w: number, d: number, x: number, z: number) => {
    const m = new Mesh(new BoxGeometry(w, h, d), wallMat);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  };
  addWall(t, PITCH.length, -hw - t / 2, 0);
  addWall(t, PITCH.length, hw + t / 2, 0);
  addWall(PITCH.width + 2 * t, t, 0, hl + t / 2);
  const side = (PITCH.width - GOAL.width) / 2;
  addWall(side, t, -hw + side / 2, -hl - t / 2);
  addWall(side, t, hw - side / 2, -hl - t / 2);

  root.add(buildGoal());
  scene.add(root);
  return root;
}

function buildGoal(): Group {
  const g = new Group();
  g.name = 'Goal';
  const postMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.4 });
  const r = GOAL.postRadius;
  const hw = GOAL.width / 2;

  const post = new CylinderGeometry(r, r, GOAL.height, 12);
  for (const x of [-hw, hw]) {
    const p = new Mesh(post, postMat);
    p.position.set(x, GOAL.height / 2, GOAL.z);
    p.castShadow = true;
    g.add(p);
  }
  const bar = new Mesh(new CylinderGeometry(r, r, GOAL.width + 2 * r, 12), postMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, GOAL.height, GOAL.z);
  bar.castShadow = true;
  g.add(bar);

  // Net as a line grid: back, roof, two sides
  const pts: number[] = [];
  const zb = GOAL.z - GOAL.depth;
  const step = 0.25;
  for (let x = -hw; x <= hw + 1e-6; x += step) {
    pts.push(x, 0, zb, x, GOAL.height, zb); // back verticals
    pts.push(x, GOAL.height, GOAL.z, x, GOAL.height, zb); // roof
  }
  for (let y = 0; y <= GOAL.height + 1e-6; y += step) {
    pts.push(-hw, y, zb, hw, y, zb); // back horizontals
    pts.push(-hw, y, GOAL.z, -hw, y, zb); // sides
    pts.push(hw, y, GOAL.z, hw, y, zb);
  }
  for (let z = GOAL.z; z >= zb - 1e-6; z -= step) {
    pts.push(-hw, 0, z, -hw, GOAL.height, z);
    pts.push(hw, 0, z, hw, GOAL.height, z);
    pts.push(-hw, GOAL.height, z, hw, GOAL.height, z);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  g.add(new LineSegments(geo, new LineBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.45 })));
  return g;
}

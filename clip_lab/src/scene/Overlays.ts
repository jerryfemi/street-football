import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector2,
  Vector3,
  type Camera,
  Raycaster,
  Plane,
} from 'three';
import { store } from '../state/store';
import type { Touch } from '../state/project';
import type { BallTrajectorySample } from './BallReplay';

const _v1 = new Vector3();
const _v2 = new Vector3();
const _ray = new Raycaster();
const _pointer = new Vector2();
const _groundPlane = new Plane(new Vector3(0, 1, 0), 0);
const _intersect = new Vector3();
const ZERO_ROOT = { x: 0, z: 0 };

export class Overlays {
  readonly group = new Group();
  private readonly pathLine: Line;
  private readonly pathGeo = new BufferGeometry();
  private readonly gizmoGroup = new Group();

  private activeDraggingTouchId: string | null = null;
  private dragTarget: 'at' | 'to' | null = null;

  constructor(
    private readonly camera: Camera,
    private readonly domElement: HTMLElement,
  ) {
    // 1. Trajectory line
    const lineMat = new LineBasicMaterial({
      color: 0x00ffcc,
      linewidth: 2,
      transparent: true,
      opacity: 0.75,
    });
    this.pathLine = new Line(this.pathGeo, lineMat);
    this.group.add(this.pathLine);

    // 2. Touch Gizmos
    this.group.add(this.gizmoGroup);

    // 3. Pointer event listeners for dragging gizmos on the turf plane
    this.setupInteractivity();
  }

  updateTrajectory(samples: BallTrajectorySample[]): void {
    if (samples.length === 0) {
      this.pathGeo.setFromPoints([]);
      return;
    }
    const points: Vector3[] = [];
    for (const s of samples) {
      points.push(new Vector3(s.x, s.y, s.z));
    }
    this.pathGeo.setFromPoints(points);
  }

  /** Root (hips ground point, local axes) at a trimmed time: touch at/to are relative to it. */
  rootAt: (t: number) => { x: number; z: number } = () => ZERO_ROOT;

  updateTouchGizmos(touches: Touch[], selectedTouchId: string | null): void {
    // Clear old gizmo meshes (and free their GPU buffers)
    while (this.gizmoGroup.children.length > 0) {
      const child = this.gizmoGroup.children[0] as Mesh;
      this.gizmoGroup.remove(child);
      child.geometry?.dispose();
      (child.material as MeshBasicMaterial | undefined)?.dispose();
    }

    for (const touch of touches) {
      const root = this.rootAt(touch.t);
      const isSelected = touch.id === selectedTouchId;
      const footColor = touch.foot === 'L' ? 0x38bdf8 : 0xf59e0b;
      const color = isSelected ? 0x00ffcc : footColor;

      // Contact ring at 'at'
      const ringGeo = new RingGeometry(0.08, 0.12, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new MeshBasicMaterial({
        color,
        side: 2, // DoubleSide
        transparent: true,
        opacity: isSelected ? 0.95 : 0.65,
      });
      const ringMesh = new Mesh(ringGeo, ringMat);
      // world.x = -localX, world.z = localZ
      ringMesh.position.set(-(touch.at.x + root.x), 0.01, touch.at.z + root.z);
      ringMesh.userData = { touchId: touch.id, target: 'at' };
      this.gizmoGroup.add(ringMesh);

      // Arrow pointing to 'to'
      if (touch.to) {
        const atWorld = new Vector3(-(touch.at.x + root.x), 0.015, touch.at.z + root.z);
        const toWorld = new Vector3(-(touch.to.x + root.x), 0.015, touch.to.z + root.z);
        const dir = _v1.subVectors(toWorld, atWorld);
        const dist = dir.length();

        if (dist > 0.05) {
          const arrowShaftGeo = new CylinderGeometry(0.015, 0.015, dist, 8);
          arrowShaftGeo.rotateZ(Math.PI / 2);
          const arrowMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
          const shaft = new Mesh(arrowShaftGeo, arrowMat);

          const mid = _v2.addVectors(atWorld, toWorld).multiplyScalar(0.5);
          shaft.position.copy(mid);
          shaft.lookAt(toWorld.x, mid.y, toWorld.z);
          shaft.rotateY(Math.PI / 2);
          this.gizmoGroup.add(shaft);

          // Arrow head
          const headGeo = new ConeGeometry(0.05, 0.1, 12);
          headGeo.rotateZ(-Math.PI / 2);
          const headMesh = new Mesh(headGeo, arrowMat);
          headMesh.position.copy(toWorld);
          headMesh.lookAt(toWorld.x + dir.x, toWorld.y, toWorld.z + dir.z);
          headMesh.rotateY(Math.PI / 2);
          headMesh.userData = { touchId: touch.id, target: 'to' };
          this.gizmoGroup.add(headMesh);
        }
      }
    }
  }

  private setupInteractivity(): void {
    const getPointer = (e: MouseEvent): { x: number; y: number } => {
      const rect = this.domElement.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };
    };

    this.domElement.addEventListener('pointerdown', (e) => {
      const p = getPointer(e);
      _pointer.set(p.x, p.y);
      _ray.setFromCamera(_pointer, this.camera);
      const hits = _ray.intersectObjects(this.gizmoGroup.children, true);

      if (hits.length > 0) {
        const top = hits[0].object;
        if (top.userData?.touchId) {
          this.activeDraggingTouchId = top.userData.touchId;
          this.dragTarget = top.userData.target;
          store.selectTouch(top.userData.touchId);
          e.stopPropagation();
        }
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.activeDraggingTouchId || !this.dragTarget) return;
      const p = getPointer(e);
      _pointer.set(p.x, p.y);
      _ray.setFromCamera(_pointer, this.camera);

      if (_ray.ray.intersectPlane(_groundPlane, _intersect)) {
        const clip = store.getSelectedClip();
        if (!clip) return;
        const touch = clip.touches.find((t) => t.id === this.activeDraggingTouchId);
        if (!touch) return;

        // world.x = -localX, world.z = localZ
        const root = this.rootAt(touch.t);
        const newLocalX = Number((-_intersect.x - root.x).toFixed(3));
        const newLocalZ = Number((_intersect.z - root.z).toFixed(3));

        if (this.dragTarget === 'at') {
          touch.at.x = newLocalX;
          touch.at.z = newLocalZ;
          touch.auto = false; // User interacted with it
        } else if (this.dragTarget === 'to') {
          if (!touch.to) touch.to = { x: newLocalX, z: newLocalZ };
          else {
            touch.to.x = newLocalX;
            touch.to.z = newLocalZ;
          }
          touch.auto = false;
        }

        store.updateClip(clip.id, { touches: [...clip.touches] });
      }
    });

    window.addEventListener('pointerup', () => {
      this.activeDraggingTouchId = null;
      this.dragTarget = null;
    });
  }
}

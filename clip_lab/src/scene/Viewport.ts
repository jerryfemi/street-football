import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BALL } from '../shared/config';

export type CameraPreset = 'side' | 'front' | 'top' | 'feet';

export class Viewport {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly controls: OrbitControls;
  readonly ballMesh: Mesh;
  private readonly rootGroup = new Group();

  constructor(container: HTMLElement) {
    this.scene.background = new Color('#0A0E1A');

    this.camera = new PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    this.camera.position.set(0, 1.6, 3.5);

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.9, 0);
    this.controls.maxPolarAngle = Math.PI / 2 + 0.02; // don't go below ground

    this.setupLights();
    this.setupPitch();

    // Ball
    const ballGeo = new SphereGeometry(BALL.radius, 24, 16);
    const ballMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 });
    this.ballMesh = new Mesh(ballGeo, ballMat);
    this.ballMesh.castShadow = true;
    this.ballMesh.position.set(0, BALL.radius, 0.4);
    this.scene.add(this.ballMesh);

    this.scene.add(this.rootGroup);

    window.addEventListener('resize', () => this.resize(container));
  }

  private setupLights(): void {
    const hemi = new HemisphereLight(0xdbe7ff, 0x1a2130, 1.2);
    this.scene.add(hemi);

    const sun = new DirectionalLight(0xfff5ea, 2.2);
    sun.position.set(4, 7, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 20;
    sun.shadow.camera.left = -4;
    sun.shadow.camera.right = 4;
    sun.shadow.camera.top = 4;
    sun.shadow.camera.bottom = -4;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
  }

  private setupPitch(): void {
    // 6x6 m turf patch
    const turfGeo = new PlaneGeometry(6, 6);
    const turfMat = new MeshStandardMaterial({ color: 0x224a2c, roughness: 0.85 });
    const turf = new Mesh(turfGeo, turfMat);
    turf.rotation.x = -Math.PI / 2;
    turf.receiveShadow = true;
    this.scene.add(turf);

    // Grid helper overlay
    const grid = new GridHelper(6, 12, 0x38bdf8, 0x1e2e38);
    grid.position.y = 0.002;
    this.scene.add(grid);

    // Origin cross
    const lineMat = new MeshStandardMaterial({ color: 0x38bdf8 });
    const xLine = new Mesh(new BoxGeometry(0.6, 0.004, 0.02), lineMat);
    const zLine = new Mesh(new BoxGeometry(0.02, 0.004, 0.6), lineMat);
    xLine.position.y = 0.003;
    zLine.position.y = 0.003;
    this.scene.add(xLine, zLine);
  }

  add(obj: Object3D): void {
    this.rootGroup.add(obj);
  }

  remove(obj: Object3D): void {
    this.rootGroup.remove(obj);
  }

  clearRoot(): void {
    while (this.rootGroup.children.length > 0) {
      this.rootGroup.remove(this.rootGroup.children[0]);
    }
  }

  setPreset(preset: CameraPreset, targetFeet?: Vector3): void {
    const t = targetFeet || new Vector3(0, 0.9, 0);
    switch (preset) {
      case 'side':
        this.camera.position.set(3.2, 1.2, t.z);
        this.controls.target.set(0, 0.9, t.z);
        break;
      case 'front':
        this.camera.position.set(0, 1.2, t.z + 3.2);
        this.controls.target.set(0, 0.9, t.z);
        break;
      case 'top':
        this.camera.position.set(0, 4.5, t.z + 0.01);
        this.controls.target.set(0, 0, t.z);
        break;
      case 'feet':
        this.camera.position.set(0.6, 0.45, t.z + 1.2);
        this.controls.target.set(0, 0.2, t.z + 0.3);
        break;
    }
    this.controls.update();
  }

  resize(container: HTMLElement): void {
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

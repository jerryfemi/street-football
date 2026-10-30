import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  Timer,
  WebGLRenderer,
} from 'three';
import { ASSETS, COLORS, RENDER } from '../config';
import { Ball } from '../ball/Ball';
import { FollowCamera } from '../camera/FollowCamera';
import { DefenderAI } from '../controllers/DefenderAI';
import { HumanController } from '../controllers/HumanController';
import { Match } from '../match/Match';
import { loadCharacterAsset } from '../player/assets';
import { Player } from '../player/Player';
import { Hud } from '../ui/Hud';
import { buildPitch, loadArena } from '../world/Pitch';
import { Input } from './Input';

/**
 * Owns the renderer, scene and loop. Wires everything together.
 * Simulation runs on a fixed 60 Hz step (deterministic, network-friendly);
 * rendering runs at display rate.
 */
export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly cam: FollowCamera;
  private readonly hud: Hud;
  private readonly input = new Input();
  private readonly timer = new Timer();
  private accumulator = 0;
  private pitch!: Group;

  match!: Match;
  private human!: HumanController;
  private ai!: DefenderAI;
  attacker!: Player;
  defender!: Player;
  ball!: Ball;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.cam = new FollowCamera(container.clientWidth / container.clientHeight);
    this.hud = new Hud(document.body);

    this.setupScene();
    window.addEventListener('resize', () => this.onResize());
  }

  private setupScene(): void {
    const s = this.scene;
    s.background = new Color(COLORS.sky);
    s.fog = new Fog(COLORS.sky, 25, 60);

    s.add(new HemisphereLight(0xdbe7ff, 0x3a4250, 1.6));
    const sun = new DirectionalLight(0xfff1dc, 3.0);
    sun.position.set(8, 16, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
    const sc = sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 1;
    sc.far = 40;
    sun.shadow.bias = -0.0005;
    s.add(sun);

    this.pitch = buildPitch(s);
  }

  async start(): Promise<void> {
    this.hud.setLoading('Loading…');
    await loadArena(this.pitch);
    const asset = await loadCharacterAsset((m) => this.hud.setLoading(m));

    this.ball = new Ball(this.scene);
    await this.ball.loadModel(ASSETS.ball);
    this.attacker = new Player(this.scene, asset, 'attacker', COLORS.attackerKit);
    this.defender = new Player(this.scene, asset, 'defender', COLORS.defenderKit);
    this.human = new HumanController(this.input, this.cam.camera, this.attacker);
    this.human.opponent = this.defender;
    this.ai = new DefenderAI(this.defender, this.attacker, this.ball);
    this.match = new Match(this.ball, this.attacker, this.defender, this.ai, {
      onMessage: (t, tone) => this.hud.message(t, tone),
      onScore: (a, d) => this.hud.setScore(a, d),
    });

    this.cam.update(0, this.attacker.pos, this.ball.pos, true);
    // Debug handle: open the console and poke at `game` (e.g. game.match.score). Add ?debug in production.
    if (import.meta.env.DEV || location.search.includes('debug')) {
      (window as unknown as { game: Game }).game = this;
    }
    this.hud.setLoading(null);
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), RENDER.maxFrameDt);
    this.accumulator = this.simPaused ? 0 : this.accumulator + dt;

    let steps = 0;
    const h = RENDER.fixedStep;
    while (this.accumulator >= h) {
      const att = this.human.update(h);
      const def = this.ai.update(h);
      this.match.step(h, att, def);
      this.animateStep(h);
      this.accumulator -= h;
      steps++;
      if (steps === 1) this.input.endFrame(); // edges consumed by the first step
    }

    // Visuals at display rate
    this.ball.sync();
    this.cam.update(dt, this.attacker.pos, this.ball.pos);
    this.hud.setPower(this.human.charge);
    this.hud.setClock(this.match.phase === 'live' ? this.match.shotClock : null);
    this.hud.update(dt);

    this.renderer.render(this.scene, this.cam.camera);
  }

  /**
   * Testing hook: freeze the real-time loop and run the simulation synchronously.
   * From the console / Playwright:  game.simPaused = true; game.advance(1.5)
   */
  simPaused = false;
  /**
   * Animation runs inside the fixed step too, so the feet the ball reacts to are exactly the
   * feet on screen (dribble beats, skill foot pushes).
   */
  private animateStep(h: number): void {
    this.attacker.updateAnimation(h, false);
    this.defender.updateAnimation(h, this.ai.intent.jockey);
    this.attacker.root.updateMatrixWorld(true);
    this.defender.root.updateMatrixWorld(true);
    this.attacker.sampleFeet(h);
    this.defender.sampleFeet(h);
  }

  advance(seconds: number): void {
    const h = RENDER.fixedStep;
    for (let t = 0; t < seconds; t += h) {
      const att = this.human.update(h);
      const def = this.ai.update(h);
      this.match.step(h, att, def);
      this.animateStep(h);
      this.input.endFrame();
    }
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.cam.resize(w / h);
  }
}

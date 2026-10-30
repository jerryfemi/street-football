/**
 * Keyboard input with "pressed this frame" / "released this frame" edges.
 * Call endFrame() once after the simulation has consumed the edges.
 *
 * Touch controls (virtual stick + buttons) should feed the same API later,
 * so controllers never care where input came from.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly released = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    target.addEventListener('blur', () => {
      for (const code of this.down) this.released.add(code);
      this.down.clear();
    });
  }

  /** Analog stick from the on-screen joystick (x = right, y = up), 0 when released. */
  stickX = 0;
  stickY = 0;

  /** On-screen buttons feed the same key codes the keyboard uses. */
  setVirtual(code: string, down: boolean): void {
    if (down) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else if (this.down.has(code)) {
      this.down.delete(code);
      this.released.add(code);
    }
  }

  /** Tap a key for one simulation step (on-screen flicks). */
  tapVirtual(code: string): void {
    this.pressed.add(code);
    this.released.add(code);
  }

  isDown(...codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  wasPressed(...codes: string[]): boolean {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  wasReleased(...codes: string[]): boolean {
    for (const c of codes) if (this.released.has(c)) return true;
    return false;
  }

  /** Raw stick: x = right, y = forward (screen-up). Not normalised. */
  axisX(): number {
    if (Math.abs(this.stickX) > 0.15 || Math.abs(this.stickY) > 0.15) return this.stickX;
    return (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyA') ? 1 : 0);
  }

  axisY(): number {
    if (Math.abs(this.stickX) > 0.15 || Math.abs(this.stickY) > 0.15) return this.stickY;
    return (this.isDown('KeyW') ? 1 : 0) - (this.isDown('KeyS') ? 1 : 0);
  }

  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
  }
}

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

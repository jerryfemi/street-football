import type { Input } from '../core/Input';

/**
 * eFootball-mobile style on-screen controls. Works with touch AND mouse (pointer events),
 * and the keyboard keeps working alongside - everything feeds the same Input.
 *
 *   left  : virtual joystick (drag)          → move / dribble
 *   right : FEINT pad (swipe a direction = feint command, same as Dash Dash + direction)
 *           SHOOT (hold, release)  DASH (hold = dash, tap = sharp touch,
 *           double tap + joystick direction = feint command)
 *   defending: TACKLE · SLIDE · BLOCK replace SHOOT/DASH/SKILL
 */
export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly attackSet: HTMLDivElement;
  private readonly defendSet: HTMLDivElement;
  private mode: 'attack' | 'defend' = 'attack';

  constructor(
    parent: HTMLElement,
    private readonly input: Input,
  ) {
    this.root = div('tc');
    parent.appendChild(this.root);

    // ---- joystick
    const stick = div('tc-stick');
    this.knob = div('tc-knob');
    stick.appendChild(this.knob);
    this.root.appendChild(stick);
    this.bindStick(stick);

    // ---- attack buttons
    this.attackSet = div('tc-set');
    const skill = div('tc-skill');
    skill.innerHTML = '<span>FEINT</span><i class="u"></i><i class="r"></i><i class="d"></i><i class="l"></i>';
    this.bindSkillPad(skill);
    const shoot = this.button('SHOOT', 'tc-btn tc-shoot', 'Space');
    const dash = this.button('DASH', 'tc-btn tc-dash', 'ShiftLeft');
    this.attackSet.append(skill, shoot, dash);

    // ---- defend buttons
    this.defendSet = div('tc-set');
    this.defendSet.append(
      this.button('TACKLE', 'tc-btn tc-shoot', 'KeyF'),
      this.button('SLIDE', 'tc-btn tc-dash', 'Slide'),
      this.button('BLOCK', 'tc-btn tc-block', 'KeyB'),
    );
    this.defendSet.style.display = 'none';
    this.root.append(this.attackSet, this.defendSet);
  }

  /** Swap button sets: attacking (has the ball / ball loose) vs defending. */
  setMode(mode: 'attack' | 'defend'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.attackSet.style.display = mode === 'attack' ? '' : 'none';
    this.defendSet.style.display = mode === 'defend' ? '' : 'none';
  }

  private button(label: string, cls: string, code: string): HTMLDivElement {
    const b = div(cls);
    b.textContent = label;
    const up = (e: PointerEvent) => {
      e.preventDefault();
      b.classList.remove('on');
      this.input.setVirtual(code, false);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add('on');
      this.input.setVirtual(code, true);
    });
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    return b;
  }

  private bindStick(stick: HTMLDivElement): void {
    const R = 52; // px travel
    let id = -1;
    let cx = 0;
    let cy = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.stickX = dx / R;
      this.input.stickY = -dy / R;
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      this.knob.style.transform = '';
      this.input.stickX = 0;
      this.input.stickY = 0;
      stick.classList.remove('on');
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      stick.setPointerCapture(id);
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      stick.classList.add('on');
      move(e);
    });
    stick.addEventListener('pointermove', move);
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }

  /** Feint pad: one swipe = one feint command in that (screen) direction. */
  private bindSkillPad(pad: HTMLDivElement): void {
    const STEP = 30;
    let id = -1;
    let ox = 0;
    let oy = 0;
    let fired = false;
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      pad.setPointerCapture(id);
      ox = e.clientX;
      oy = e.clientY;
      fired = false;
      pad.classList.add('on');
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || fired) return;
      const dx = e.clientX - ox;
      const dy = e.clientY - oy;
      const l = Math.hypot(dx, dy);
      if (l < STEP) return;
      fired = true;
      this.input.feint(dx / l, -dy / l);
      flash(pad, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : dy > 0 ? 'ArrowDown' : 'ArrowUp');
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      pad.classList.remove('on');
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function flash(pad: HTMLElement, code: string): void {
  const map: Record<string, string> = { ArrowUp: 'u', ArrowRight: 'r', ArrowDown: 'd', ArrowLeft: 'l' };
  const el = pad.querySelector<HTMLElement>(`i.${map[code]}`);
  if (!el) return;
  el.classList.remove('hit');
  void el.offsetWidth;
  el.classList.add('hit');
}

/**
 * DOM overlay: score, shot clock, big round messages, shot power meter, controls, loading.
 * Plain DOM on purpose - cheap, crisp text, and easy to restyle in style.css.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly scoreEl: HTMLDivElement;
  private readonly clockEl: HTMLDivElement;
  private readonly msgEl: HTMLDivElement;
  private readonly powerEl: HTMLDivElement;
  private readonly powerFill: HTMLDivElement;
  private readonly loadingEl: HTMLDivElement;
  private msgTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    parent.appendChild(this.root);

    const top = el('div', 'hud-top');
    this.scoreEl = el('div', 'hud-score');
    this.clockEl = el('div', 'hud-clock');
    top.append(this.scoreEl, this.clockEl);

    this.msgEl = el('div', 'hud-msg');
    this.powerEl = el('div', 'hud-power');
    this.powerFill = el('div', 'hud-power-fill');
    this.powerEl.appendChild(this.powerFill);

    const help = el('div', 'hud-help');
    help.innerHTML =
      '<b>WASD</b> move · <b>Shift</b> sprint · hold <b>Space</b> shoot · skills: <b>E</b> stepover <b>Q</b> feint <b>C</b> elastico <b>V</b> samba <b>G</b> shoulder <b>X</b> drag <b>R</b> knock-on (+<b>A</b> = other way)';

    this.loadingEl = el('div', 'hud-loading');
    this.loadingEl.textContent = 'Loading…';

    this.root.append(top, this.msgEl, this.powerEl, help, this.loadingEl);
    this.setScore(0, 0);
  }

  setLoading(text: string | null): void {
    this.loadingEl.style.display = text ? 'flex' : 'none';
    if (text) this.loadingEl.textContent = text;
  }

  setScore(att: number, def: number): void {
    this.scoreEl.innerHTML = `<span class="att">YOU ${att}</span><span class="sep">–</span><span class="def">${def} DEF</span>`;
  }

  setClock(seconds: number | null): void {
    this.clockEl.textContent = seconds === null ? '' : Math.max(0, seconds).toFixed(1);
    this.clockEl.classList.toggle('low', seconds !== null && seconds < 4);
  }

  message(text: string, tone: 'info' | 'good' | 'bad'): void {
    this.msgEl.textContent = text;
    this.msgEl.className = `hud-msg show ${tone}`;
    this.msgTimer = 1.4;
  }

  /** charge 0..1, or < 0 to hide */
  setPower(charge: number): void {
    this.powerEl.style.opacity = charge >= 0 ? '1' : '0';
    if (charge >= 0) this.powerFill.style.transform = `scaleX(${charge.toFixed(3)})`;
  }

  update(dt: number): void {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msgEl.classList.remove('show');
    }
  }
}

function el(tag: 'div', cls: string): HTMLDivElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

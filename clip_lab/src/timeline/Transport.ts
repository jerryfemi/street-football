import { store } from '../state/store';
import type { CameraPreset } from '../scene/Viewport';

export class Transport {
  readonly element: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly timeLabel: HTMLElement;
  private readonly frameLabel: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly onSetPreset: (preset: CameraPreset) => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'transport-bar';

    // Transport buttons
    const btnGroup = document.createElement('div');
    btnGroup.className = 'transport-group';

    const rewindBtn = this.createBtn('⏮', 'Rewind to start (Home)', () => store.setTime(0));
    const stepBackBtn = this.createBtn('◀|', 'Step back 1 frame (←)', () => this.stepFrame(-1));
    this.playBtn = this.createBtn('▶', 'Play / Pause (Space)', () => store.togglePlay());
    const stepFwdBtn = this.createBtn('|▶', 'Step forward 1 frame (→)', () => this.stepFrame(1));

    btnGroup.append(rewindBtn, stepBackBtn, this.playBtn, stepFwdBtn);
    this.element.appendChild(btnGroup);

    // Time & Frame Counters
    const timeGroup = document.createElement('div');
    timeGroup.className = 'time-display';
    this.timeLabel = document.createElement('span');
    this.timeLabel.className = 'time-text';
    this.timeLabel.textContent = '0.00s / 0.00s';
    this.frameLabel = document.createElement('span');
    this.frameLabel.className = 'frame-text';
    this.frameLabel.textContent = 'F: 0 / 0';
    timeGroup.append(this.timeLabel, this.frameLabel);
    this.element.appendChild(timeGroup);

    // Speed Selector
    const speedGroup = document.createElement('div');
    speedGroup.className = 'speed-group';
    const speeds = [0.25, 0.5, 1.0];
    for (const s of speeds) {
      const b = document.createElement('button');
      b.className = `btn-speed ${s === 1.0 ? 'active' : ''}`;
      b.textContent = `${s}x`;
      b.onclick = () => {
        store.setSpeed(s);
        speedGroup.querySelectorAll('.btn-speed').forEach((el) => el.classList.remove('active'));
        b.classList.add('active');
      };
      speedGroup.appendChild(b);
    }
    this.element.appendChild(speedGroup);

    // View Presets
    const presetGroup = document.createElement('div');
    presetGroup.className = 'preset-group';
    const presets: { id: CameraPreset; label: string; key: string }[] = [
      { id: 'side', label: 'Side', key: '1' },
      { id: 'front', label: 'Front', key: '2' },
      { id: 'top', label: 'Top', key: '3' },
      { id: 'feet', label: 'Feet', key: '4' },
    ];
    for (const p of presets) {
      const b = document.createElement('button');
      b.className = 'btn-preset';
      b.textContent = `${p.label} (${p.key})`;
      b.onclick = () => this.onSetPreset(p.id);
      presetGroup.appendChild(b);
    }
    this.element.appendChild(presetGroup);

    parent.appendChild(this.element);

    store.subscribe((state) => {
      this.playBtn.textContent = state.isPlaying ? '⏸' : '▶';
      const clip = store.getSelectedClip();
      const dur = clip ? Math.max(0, clip.out - clip.in) : 0;
      const t = Math.min(state.currentTime, dur);
      const fps = state.project.settings.fps || 30;
      const curF = Math.round(t * fps);
      const totalF = Math.round(dur * fps);
      this.timeLabel.textContent = `${t.toFixed(2)}s / ${dur.toFixed(2)}s`;
      this.frameLabel.textContent = `F: ${curF} / ${totalF}`;
    });
  }

  private stepFrame(delta: number): void {
    const state = store.getState();
    const clip = store.getSelectedClip();
    if (!clip) return;
    const dur = Math.max(0, clip.out - clip.in);
    const fps = state.project.settings.fps || 30;
    const nextT = Math.max(0, Math.min(dur, state.currentTime + delta * (1 / fps)));
    store.setTime(nextT);
  }

  private createBtn(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'btn-transport';
    btn.textContent = text;
    btn.title = title;
    btn.onclick = onClick;
    return btn;
  }
}


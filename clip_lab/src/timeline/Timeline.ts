import { store } from '../state/store';
import type { Foot, Touch } from '../state/project';
import type { ReplayWarning } from '../scene/BallReplay';

export class Timeline {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  private zoom = 1.0; // pixels per second multiplier
  private scrollOffsetSec = 0;
  private isScrubbing = false;
  private draggedTouchId: string | null = null;

  private warnings: ReplayWarning[] = [];

  // Lane heights (px)
  private readonly RULER_H = 26;
  private readonly MARKERS_H = 18;
  private readonly TOUCH_L_H = 20;
  private readonly TOUCH_R_H = 20;
  private readonly PLANTED_H = 16;
  private readonly PROTECTED_H = 14;
  private readonly WARNINGS_H = 14;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'timeline-container';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'timeline-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    this.element.appendChild(this.canvas);
    parent.appendChild(this.element);

    this.setupEvents();
    this.resize();

    window.addEventListener('resize', () => this.resize());
    store.subscribe(() => this.draw());
  }

  setWarnings(warnings: ReplayWarning[]): void {
    this.warnings = warnings;
    this.draw();
  }

  private resize(): void {
    const rect = this.element.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    const totalH =
      this.RULER_H +
      this.MARKERS_H +
      this.TOUCH_L_H +
      this.TOUCH_R_H +
      this.PLANTED_H +
      this.PROTECTED_H +
      this.WARNINGS_H +
      4;

    this.canvas.width = Math.max(400, Math.floor(rect.width * dpr));
    this.canvas.height = Math.floor(totalH * dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = `${totalH}px`;
    this.ctx.scale(dpr, dpr);
    this.draw();
  }

  private secToX(sec: number, width: number, duration: number): number {
    const leftPad = 60;
    const availW = width - leftPad - 20;
    const basePps = availW / Math.max(0.1, duration);
    return leftPad + (sec - this.scrollOffsetSec) * basePps * this.zoom;
  }

  private xToSec(x: number, width: number, duration: number): number {
    const leftPad = 60;
    const availW = width - leftPad - 20;
    const basePps = availW / Math.max(0.1, duration);
    return Math.max(0, (x - leftPad) / (basePps * this.zoom) + this.scrollOffsetSec);
  }

  draw(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return;

    const clip = store.getSelectedClip();
    const state = store.getState();
    const fps = state.project.settings.fps || 30;
    const duration = clip ? Math.max(0.1, clip.out - clip.in) : 2.0;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, w, h);

    // Left Lane Labels column background
    ctx.fillStyle = '#141D30';
    ctx.fillRect(0, 0, 60, h);

    let y = 0;

    // --- 1. RULER ---
    ctx.fillStyle = '#1A2338';
    ctx.fillRect(0, 0, w, this.RULER_H);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '10px monospace';

    const stepSec = this.zoom > 2 ? 0.2 : this.zoom > 1.2 ? 0.5 : 1.0;
    for (let s = 0; s <= duration + stepSec; s += stepSec) {
      const x = this.secToX(s, w, duration);
      if (x < 60 || x > w) continue;
      ctx.strokeStyle = '#2A364F';
      ctx.beginPath();
      ctx.moveTo(x, this.RULER_H - 8);
      ctx.lineTo(x, this.RULER_H);
      ctx.stroke();

      const frame = Math.round(s * fps);
      ctx.fillText(`${s.toFixed(1)}s (F${frame})`, x + 3, this.RULER_H - 10);
    }
    y += this.RULER_H;

    // Helper to draw lane separator and label
    const drawLane = (label: string, laneH: number, bg = '#0F172A') => {
      ctx.fillStyle = bg;
      ctx.fillRect(60, y, w - 60, laneH);
      ctx.strokeStyle = '#1E293B';
      ctx.strokeRect(0, y, w, laneH);

      ctx.fillStyle = '#64748B';
      ctx.font = '10px sans-serif';
      ctx.fillText(label, 6, y + laneH - 5);
      const laneY = y;
      y += laneH;
      return laneY;
    };

    // --- 2. MARKERS LANE ---
    const markerY = drawLane('MARK', this.MARKERS_H);
    if (clip) {
      // In & Out indicators
      const inX = this.secToX(0, w, duration);
      const outX = this.secToX(duration, w, duration);
      ctx.fillStyle = '#10B981';
      ctx.fillRect(inX, markerY + 2, 4, this.MARKERS_H - 4);
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(outX - 4, markerY + 2, 4, this.MARKERS_H - 4);

      if (clip.exit !== undefined) {
        const exitX = this.secToX(clip.exit, w, duration);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(exitX - 2, markerY + 2, 4, this.MARKERS_H - 4);
      }
    }

    // --- 3. TOUCH L (Sky) ---
    const touchLY = drawLane('TOUCH L', this.TOUCH_L_H, '#111C30');
    // --- 4. TOUCH R (Amber) ---
    const touchRY = drawLane('TOUCH R', this.TOUCH_R_H, '#111C30');

    // Draw touches
    if (clip) {
      for (const t of clip.touches) {
        const tx = this.secToX(t.t, w, duration);
        const ty = t.foot === 'L' ? touchLY + this.TOUCH_L_H / 2 : touchRY + this.TOUCH_R_H / 2;
        const isSelected = t.id === state.selectedTouchId;

        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(Math.PI / 4);

        const sz = isSelected ? 7 : 5;
        ctx.fillStyle = isSelected ? '#00FFCC' : t.foot === 'L' ? '#38BDF8' : '#F59E0B';
        ctx.strokeStyle = isSelected ? '#FFFFFF' : '#0F172A';
        ctx.lineWidth = 1.5;

        if (t.auto) {
          // Hollow diamond for auto
          ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
        } else {
          // Solid diamond for confirmed
          ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
          ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
        }
        ctx.restore();
      }
    }

    // --- 5. PLANTED LANE ---
    const plantY = drawLane('PLANT', this.PLANTED_H);
    if (clip) {
      for (const p of clip.planted) {
        const px1 = this.secToX(p.from, w, duration);
        const px2 = this.secToX(p.to, w, duration);
        ctx.fillStyle = p.foot === 'L' ? '#0284C7' : '#D97706';
        ctx.fillRect(px1, plantY + 3, Math.max(3, px2 - px1), this.PLANTED_H - 6);
      }
    }

    // --- 6. PROTECTED LANE ---
    const protY = drawLane('SHIELD', this.PROTECTED_H);
    if (clip && clip.protected) {
      const px1 = this.secToX(clip.protected.from, w, duration);
      const px2 = this.secToX(clip.protected.to, w, duration);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
      ctx.fillRect(px1, protY + 2, Math.max(4, px2 - px1), this.PROTECTED_H - 4);
    }

    // --- 7. WARNINGS LANE ---
    const warnY = drawLane('WARN', this.WARNINGS_H);
    for (const warn of this.warnings) {
      const wx = this.secToX(warn.t, w, duration);
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(wx - 1.5, warnY + 2, 3, this.WARNINGS_H - 4);
    }

    // --- 8. SCRUBBER HEAD & LINE ---
    const curX = this.secToX(state.currentTime, w, duration);
    ctx.strokeStyle = '#00FFCC';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(curX, 0);
    ctx.lineTo(curX, h);
    ctx.stroke();

    // Scrubber flag on ruler
    ctx.fillStyle = '#00FFCC';
    ctx.beginPath();
    ctx.moveTo(curX - 6, 0);
    ctx.lineTo(curX + 6, 0);
    ctx.lineTo(curX + 6, 12);
    ctx.lineTo(curX, 18);
    ctx.lineTo(curX - 6, 12);
    ctx.closePath();
    ctx.fill();
  }

  private setupEvents(): void {
    const getPos = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    // Scrub & Drag handler
    this.canvas.addEventListener('mousedown', (e) => {
      const { x, y } = getPos(e);
      const w = this.canvas.clientWidth;
      const clip = store.getSelectedClip();
      if (!clip) return;
      const duration = Math.max(0.1, clip.out - clip.in);

      // Check if clicked on a touch diamond
      const touchLY = this.RULER_H + this.MARKERS_H;
      const touchRY = touchLY + this.TOUCH_L_H;

      for (const t of clip.touches) {
        const tx = this.secToX(t.t, w, duration);
        const ty = t.foot === 'L' ? touchLY + this.TOUCH_L_H / 2 : touchRY + this.TOUCH_R_H / 2;
        if (Math.hypot(x - tx, y - ty) < 8) {
          this.draggedTouchId = t.id;
          store.selectTouch(t.id);
          this.draw();
          return;
        }
      }

      // Otherwise, scrub playhead
      this.isScrubbing = true;
      const clickedSec = this.xToSec(x, w, duration);
      store.setTime(Math.min(duration, clickedSec));
      this.draw();
    });

    window.addEventListener('mousemove', (e) => {
      const clip = store.getSelectedClip();
      if (!clip) return;
      const duration = Math.max(0.1, clip.out - clip.in);
      const w = this.canvas.clientWidth;
      const { x } = getPos(e);

      if (this.draggedTouchId) {
        const targetSec = this.xToSec(x, w, duration);
        const fps = store.getState().project.settings.fps || 30;
        const snapped = Number((Math.round(targetSec * fps) / fps).toFixed(3));
        const touch = clip.touches.find((t) => t.id === this.draggedTouchId);
        if (touch) {
          touch.t = Math.max(0, Math.min(duration, snapped));
          touch.auto = false;
          store.updateClip(clip.id, { touches: [...clip.touches] });
        }
      } else if (this.isScrubbing) {
        const sec = Math.min(duration, this.xToSec(x, w, duration));
        store.setTime(sec);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isScrubbing = false;
      this.draggedTouchId = null;
    });

    // Double-click to add touch
    this.canvas.addEventListener('dblclick', (e) => {
      const { x, y } = getPos(e);
      const clip = store.getSelectedClip();
      if (!clip) return;
      const duration = Math.max(0.1, clip.out - clip.in);
      const w = this.canvas.clientWidth;
      const clickSec = Number(Math.min(duration, this.xToSec(x, w, duration)).toFixed(3));

      const touchLY = this.RULER_H + this.MARKERS_H;
      const touchRY = touchLY + this.TOUCH_L_H;

      let foot: Foot | null = null;
      if (y >= touchLY && y < touchLY + this.TOUCH_L_H) {
        foot = 'L';
      } else if (y >= touchRY && y < touchRY + this.TOUCH_R_H) {
        foot = 'R';
      }

      if (foot) {
        const newTouch: Touch = {
          id: `touch_${foot}_${Date.now()}`,
          t: clickSec,
          foot,
          part: 'inside',
          type: 'close',
          at: { x: foot === 'L' ? -0.15 : 0.15, z: 0.35, y: 0.11 },
          to: { x: foot === 'L' ? -0.15 : 0.15, z: 0.8 },
          arrive: 0.45,
          auto: false,
        };
        store.addTouch(clip.id, newTouch);
      }
    });

    // Keyboard delete selected touch
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const state = store.getState();
        if (state.selectedTouchId && state.selectedClipId) {
          store.deleteTouch(state.selectedClipId, state.selectedTouchId);
        }
      }
    });
  }
}

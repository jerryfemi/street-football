import { store } from '../state/store';
import type { Foot, FootPart, TouchType } from '../state/project';
import type { ReplayWarning } from '../scene/BallReplay';

export class Inspector {
  readonly element: HTMLElement;
  private warnings: ReplayWarning[] = [];

  constructor(
    parent: HTMLElement,
    private readonly onAutoDetectTouches?: () => void,
    private readonly onAutoFillPlanted?: () => void,
    private readonly onMirrorClip?: () => void,
    private readonly onSmoothClip?: (windowSize: number) => void,
    private readonly onFootLock?: () => void,
    private readonly onExtractRootMotion?: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'panel inspector-panel';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = '<h2>INSPECTOR</h2>';
    this.element.appendChild(header);

    const content = document.createElement('div');
    content.className = 'inspector-content';
    this.element.appendChild(content);

    parent.appendChild(this.element);

    store.subscribe(() => this.render(content));
  }

  setWarnings(warnings: ReplayWarning[]): void {
    this.warnings = warnings;
  }

  private render(container: HTMLElement): void {
    const clip = store.getSelectedClip();
    const state = store.getState();
    container.innerHTML = '';

    if (!clip) {
      const notice = document.createElement('div');
      notice.className = 'empty-notice';
      notice.textContent = 'Select a clip to inspect properties.';
      container.appendChild(notice);
      return;
    }

    // --- SECTION 1: Clip Properties ---
    const clipSection = document.createElement('div');
    clipSection.className = 'inspector-section';
    clipSection.innerHTML = '<div class="section-title">CLIP PROPERTIES</div>';

    clipSection.appendChild(this.createField('Name', clip.name, (v) => {
      store.updateClip(clip.id, { name: v });
    }));

    const durRow = document.createElement('div');
    durRow.className = 'inspector-field';
    durRow.innerHTML = `<label>Duration</label><span>${(clip.out - clip.in).toFixed(2)}s (${clip.rawDuration.toFixed(2)}s raw)</span>`;
    clipSection.appendChild(durRow);

    clipSection.appendChild(this.createNumberField('In (s)', clip.in, 0, clip.out - 0.05, 0.01, (v) => {
      store.updateClip(clip.id, { in: v });
    }));

    clipSection.appendChild(this.createNumberField('Out (s)', clip.out, clip.in + 0.05, clip.rawDuration, 0.01, (v) => {
      store.updateClip(clip.id, { out: v });
    }));

    // FakeSide dropdown (-1, 0, 1)
    clipSection.appendChild(this.createSelect(
      'Fake Side',
      String(clip.fakeSide ?? 0),
      [
        { value: '-1', label: 'Left (-1)' },
        { value: '0', label: 'None (0)' },
        { value: '1', label: 'Right (+1)' },
      ],
      (v) => store.updateClip(clip.id, { fakeSide: Number(v) as -1 | 0 | 1 }),
    ));

    // Entry Foot dropdown
    clipSection.appendChild(this.createSelect(
      'Entry Foot',
      clip.entryFoot ?? '',
      [
        { value: '', label: 'Any' },
        { value: 'L', label: 'Left (L)' },
        { value: 'R', label: 'Right (R)' },
      ],
      (v) => store.updateClip(clip.id, { entryFoot: (v || undefined) as Foot | undefined }),
    ));

    // Status & Approval
    const statusRow = document.createElement('div');
    statusRow.className = 'inspector-field';
    statusRow.innerHTML = `<label>Status</label><span class="badge badge-${clip.status}">${clip.status.toUpperCase()}</span>`;
    clipSection.appendChild(statusRow);

    const btnRow = document.createElement('div');
    btnRow.className = 'inspector-actions';

    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn btn-approve';
    approveBtn.textContent = clip.status === 'approved' ? '✓ APPROVED' : 'APPROVE CLIP';
    approveBtn.onclick = () => {
      store.updateClip(clip.id, { status: clip.status === 'approved' ? 'marked' : 'approved' });
    };
    btnRow.appendChild(approveBtn);

    clipSection.appendChild(btnRow);

    // Analysis trigger buttons
    const toolsRow = document.createElement('div');
    toolsRow.className = 'inspector-tools';

    const detectBtn = document.createElement('button');
    detectBtn.className = 'btn btn-secondary';
    detectBtn.textContent = '⚡ Auto Touches';
    detectBtn.onclick = () => this.onAutoDetectTouches?.();

    const plantBtn = document.createElement('button');
    plantBtn.className = 'btn btn-secondary';
    plantBtn.textContent = '🦶 Auto Planted';
    plantBtn.onclick = () => this.onAutoFillPlanted?.();

    const mirrorBtn = document.createElement('button');
    mirrorBtn.className = 'btn btn-secondary';
    mirrorBtn.textContent = '🪞 Mirror L↔R';
    mirrorBtn.onclick = () => this.onMirrorClip?.();

    const footLockBtn = document.createElement('button');
    footLockBtn.className = 'btn btn-secondary';
    footLockBtn.textContent = '🔒 Foot Lock';
    footLockBtn.onclick = () => this.onFootLock?.();

    const rootBtn = document.createElement('button');
    rootBtn.className = 'btn btn-secondary';
    rootBtn.textContent = '🏃 Root Motion';
    rootBtn.onclick = () => this.onExtractRootMotion?.();

    toolsRow.append(detectBtn, plantBtn, mirrorBtn, footLockBtn, rootBtn);
    clipSection.appendChild(toolsRow);

    // Smoothing Slider
    const smoothRow = document.createElement('div');
    smoothRow.className = 'inspector-field';
    const smoothLabel = document.createElement('label');
    smoothLabel.textContent = `Smooth (${clip.cleanup.smooth ?? 0}f)`;
    const smoothInput = document.createElement('input');
    smoothInput.type = 'range';
    smoothInput.min = '0';
    smoothInput.max = '7';
    smoothInput.step = '1';
    smoothInput.value = String(clip.cleanup.smooth ?? 0);
    smoothInput.className = 'input-range';
    smoothInput.onchange = () => {
      const val = parseInt(smoothInput.value, 10);
      smoothLabel.textContent = `Smooth (${val}f)`;
      this.onSmoothClip?.(val);
    };
    smoothRow.append(smoothLabel, smoothInput);
    clipSection.appendChild(smoothRow);

    container.appendChild(clipSection);

    // --- SECTION 2: Selected Touch Editor ---
    const selectedTouch = clip.touches.find((t) => t.id === state.selectedTouchId);
    if (selectedTouch) {
      const touchSection = document.createElement('div');
      touchSection.className = 'inspector-section touch-editor-section';
      touchSection.innerHTML = `<div class="section-title">TOUCH: ${selectedTouch.foot} (${selectedTouch.t.toFixed(2)}s) ${selectedTouch.auto ? '<span class="badge badge-auto">AUTO</span>' : ''}</div>`;

      // Foot Selector
      touchSection.appendChild(this.createSelect(
        'Foot',
        selectedTouch.foot,
        [
          { value: 'L', label: 'Left (Sky Blue)' },
          { value: 'R', label: 'Right (Amber)' },
        ],
        (v) => {
          selectedTouch.foot = v as Foot;
          selectedTouch.auto = false;
          store.updateClip(clip.id, { touches: [...clip.touches] });
        },
      ));

      // Part Selector
      const parts: FootPart[] = ['inside', 'outside', 'sole', 'laces', 'heel', 'toe'];
      touchSection.appendChild(this.createSelect(
        'Part',
        selectedTouch.part,
        parts.map((p) => ({ value: p, label: p })),
        (v) => {
          selectedTouch.part = v as FootPart;
          selectedTouch.auto = false;
          store.updateClip(clip.id, { touches: [...clip.touches] });
        },
      ));

      // Type Selector
      const types: TouchType[] = [
        'close',
        'set',
        'push',
        'heavy',
        'cut',
        'drag',
        'trap',
        'flick',
        'shot',
        'pass',
      ];
      touchSection.appendChild(this.createSelect(
        'Type',
        selectedTouch.type,
        types.map((tp) => ({ value: tp, label: tp })),
        (v) => {
          selectedTouch.type = v as TouchType;
          selectedTouch.auto = false;
          store.updateClip(clip.id, { touches: [...clip.touches] });
        },
      ));

      // At Coordinates
      touchSection.appendChild(this.createNumberField(
        'Contact At X (m)',
        selectedTouch.at.x,
        -1.5,
        1.5,
        0.01,
        (v) => {
          selectedTouch.at.x = v;
          selectedTouch.auto = false;
          store.updateClip(clip.id, { touches: [...clip.touches] });
        },
      ));

      touchSection.appendChild(this.createNumberField(
        'Contact At Z (m)',
        selectedTouch.at.z,
        -1.0,
        2.0,
        0.01,
        (v) => {
          selectedTouch.at.z = v;
          selectedTouch.auto = false;
          store.updateClip(clip.id, { touches: [...clip.touches] });
        },
      ));

      // Target To Coordinates
      if (!selectedTouch.to) selectedTouch.to = { x: selectedTouch.at.x, z: selectedTouch.at.z + 0.8 };

      touchSection.appendChild(this.createNumberField(
        'Target To X (m)',
        selectedTouch.to.x,
        -2.0,
        2.0,
        0.01,
        (v) => {
          selectedTouch.to!.x = v;
          selectedTouch.auto = false;
          store.updateClip(clip.id, { touches: [...clip.touches] });
        },
      ));

      touchSection.appendChild(this.createNumberField(
        'Target To Z (m)',
        selectedTouch.to.z,
        -1.0,
        3.0,
        0.01,
        (v) => {
          selectedTouch.to!.z = v;
          selectedTouch.auto = false;
          store.updateClip(clip.id, { touches: [...clip.touches] });
        },
      ));

      // Arrive & Lift
      touchSection.appendChild(this.createNumberField(
        'Arrive Time (s)',
        selectedTouch.arrive ?? 0.45,
        0.05,
        2.0,
        0.02,
        (v) => {
          selectedTouch.arrive = v;
          selectedTouch.auto = false;
          store.updateClip(clip.id, { touches: [...clip.touches] });
        },
      ));

      touchSection.appendChild(this.createNumberField(
        'Lift Speed (m/s)',
        selectedTouch.lift ?? 0,
        0,
        12.0,
        0.2,
        (v) => {
          selectedTouch.lift = v;
          selectedTouch.auto = false;
          store.updateClip(clip.id, { touches: [...clip.touches] });
        },
      ));

      // Stay Toggle
      const stayRow = document.createElement('div');
      stayRow.className = 'inspector-field';
      const stayLabel = document.createElement('label');
      stayLabel.textContent = 'Stay on foot (roll)';
      const stayCheck = document.createElement('input');
      stayCheck.type = 'checkbox';
      stayCheck.checked = !!selectedTouch.stay;
      stayCheck.onchange = () => {
        selectedTouch.stay = stayCheck.checked;
        selectedTouch.auto = false;
        store.updateClip(clip.id, { touches: [...clip.touches] });
      };
      stayRow.append(stayLabel, stayCheck);
      touchSection.appendChild(stayRow);

      // Confirm & Delete Action buttons
      const touchActions = document.createElement('div');
      touchActions.className = 'inspector-actions';

      if (selectedTouch.auto) {
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn btn-primary';
        confirmBtn.textContent = '✓ Confirm Touch';
        confirmBtn.onclick = () => {
          selectedTouch.auto = false;
          store.updateClip(clip.id, { touches: [...clip.touches] });
        };
        touchActions.appendChild(confirmBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-danger';
      delBtn.textContent = 'Delete Touch';
      delBtn.onclick = () => store.deleteTouch(clip.id, selectedTouch.id);
      touchActions.appendChild(delBtn);

      touchSection.appendChild(touchActions);
      container.appendChild(touchSection);
    }

    // --- SECTION 3: Replay Warnings ---
    if (this.warnings.length > 0) {
      const warnSection = document.createElement('div');
      warnSection.className = 'inspector-section warning-section';
      warnSection.innerHTML = `<div class="section-title warning-title">⚠ REPLAY WARNINGS (${this.warnings.length})</div>`;

      for (const w of this.warnings) {
        const item = document.createElement('div');
        item.className = 'warning-item';
        item.innerHTML = `<span class="warning-time">${w.t.toFixed(2)}s</span> <span class="warning-msg">${w.message}</span>`;
        item.onclick = () => store.setTime(w.t);
        warnSection.appendChild(item);
      }
      container.appendChild(warnSection);
    }
  }

  private createField(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'inspector-field';
    const l = document.createElement('label');
    l.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value;
    inp.className = 'input-text';
    inp.onchange = () => onChange(inp.value);
    row.appendChild(l);
    row.appendChild(inp);
    return row;
  }

  private createNumberField(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'inspector-field';
    const l = document.createElement('label');
    l.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = String(value);
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.className = 'input-number';
    inp.onchange = () => onChange(parseFloat(inp.value) || 0);
    row.appendChild(l);
    row.appendChild(inp);
    return row;
  }

  private createSelect(
    label: string,
    value: string,
    options: { value: string; label: string }[],
    onChange: (v: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'inspector-field';
    const l = document.createElement('label');
    l.textContent = label;
    const sel = document.createElement('select');
    sel.className = 'input-select';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.onchange = () => onChange(sel.value);
    row.appendChild(l);
    row.appendChild(sel);
    return row;
  }
}

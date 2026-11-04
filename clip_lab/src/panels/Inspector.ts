import { store } from '../state/store';

export class Inspector {
  readonly element: HTMLElement;

  constructor(parent: HTMLElement) {
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

  private render(container: HTMLElement): void {
    const clip = store.getSelectedClip();
    container.innerHTML = '';

    if (!clip) {
      const notice = document.createElement('div');
      notice.className = 'empty-notice';
      notice.textContent = 'Select a clip to inspect properties.';
      container.appendChild(notice);
      return;
    }

    // Clip Info Form
    const section = document.createElement('div');
    section.className = 'inspector-section';

    const nameRow = this.createField('Name', clip.name, (v) => {
      store.updateClip(clip.id, { name: v });
    });
    section.appendChild(nameRow);

    const durRow = document.createElement('div');
    durRow.className = 'inspector-field';
    durRow.innerHTML = `<label>Trimmed Duration</label><span>${(clip.out - clip.in).toFixed(2)}s (${(clip.rawDuration).toFixed(2)}s raw)</span>`;
    section.appendChild(durRow);

    const inRow = this.createNumberField('In (s)', clip.in, 0, clip.out - 0.05, 0.01, (v) => {
      store.updateClip(clip.id, { in: v });
    });
    section.appendChild(inRow);

    const outRow = this.createNumberField('Out (s)', clip.out, clip.in + 0.05, clip.rawDuration, 0.01, (v) => {
      store.updateClip(clip.id, { out: v });
    });
    section.appendChild(outRow);

    const statusRow = document.createElement('div');
    statusRow.className = 'inspector-field';
    statusRow.innerHTML = `<label>Status</label><span class="badge badge-${clip.status}">${clip.status.toUpperCase()}</span>`;
    section.appendChild(statusRow);

    // Approve Button
    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn btn-approve';
    approveBtn.textContent = clip.status === 'approved' ? '✓ APPROVED' : 'APPROVE CLIP';
    approveBtn.onclick = () => {
      store.updateClip(clip.id, { status: clip.status === 'approved' ? 'marked' : 'approved' });
    };
    section.appendChild(approveBtn);

    container.appendChild(section);
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
    inp.value = value.toFixed(2);
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.className = 'input-number';
    inp.onchange = () => onChange(parseFloat(inp.value));
    row.appendChild(l);
    row.appendChild(inp);
    return row;
  }
}

import { type Status, type Tag } from '../state/project';
import { store } from '../state/store';

export type FilterStatus = 'all' | Status | 'warnings';

export class ClipList {
  readonly element: HTMLElement;
  private readonly searchInput: HTMLInputElement;
  private readonly listContainer: HTMLElement;
  private searchQuery = '';
  private activeStatusFilter: FilterStatus = 'all';
  private activeTag: Tag | null = null;
  private warningsMap = new Map<string, number>();

  constructor(
    parent: HTMLElement,
    private readonly onDropFiles: (files: FileList) => void,
    private readonly onBatchAutoDetect?: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'panel clip-list-panel';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = '<h2>CLIPS</h2>';
    this.element.appendChild(header);

    // Dropzone
    const dropzone = document.createElement('div');
    dropzone.className = 'dropzone';
    dropzone.innerHTML = '<span>Drop FBX clips or character</span>';
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer?.files) {
        this.onDropFiles(e.dataTransfer.files);
      }
    });
    this.element.appendChild(dropzone);

    // Batch Auto-Detect Button
    const batchRow = document.createElement('div');
    batchRow.className = 'batch-action-row';
    const batchBtn = document.createElement('button');
    batchBtn.className = 'btn-batch';
    batchBtn.textContent = '⚡ Batch Auto-Detect All';
    batchBtn.onclick = () => this.onBatchAutoDetect?.();
    batchRow.appendChild(batchBtn);
    this.element.appendChild(batchRow);

    // Filter Chips: Status & Warnings
    const chipsRow = document.createElement('div');
    chipsRow.className = 'filter-chips-row';
    const filters: { id: FilterStatus; label: string }[] = [
      { id: 'all', label: 'All' },
      { id: 'approved', label: 'Approved' },
      { id: 'marked', label: 'Marked' },
      { id: 'raw', label: 'Raw' },
      { id: 'warnings', label: '⚠ Warnings' },
    ];

    filters.forEach((f) => {
      const chip = document.createElement('button');
      chip.className = `filter-chip ${this.activeStatusFilter === f.id ? 'active' : ''}`;
      chip.textContent = f.label;
      chip.onclick = () => {
        this.activeStatusFilter = f.id;
        chipsRow.querySelectorAll('.filter-chip').forEach((el) => el.classList.remove('active'));
        chip.classList.add('active');
        this.renderList();
      };
      chipsRow.appendChild(chip);
    });
    this.element.appendChild(chipsRow);

    // Search & Tag Filter
    const filterBox = document.createElement('div');
    filterBox.className = 'filter-box';
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = 'Search clips…';
    this.searchInput.className = 'search-input';
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value.toLowerCase();
      this.renderList();
    });
    filterBox.appendChild(this.searchInput);
    this.element.appendChild(filterBox);

    // List Container
    this.listContainer = document.createElement('div');
    this.listContainer.className = 'clip-items-container';
    this.element.appendChild(this.listContainer);

    parent.appendChild(this.element);

    store.subscribe(() => this.renderList());
  }

  setWarningsMap(map: Map<string, number>): void {
    this.warningsMap = map;
    this.renderList();
  }

  private renderList(): void {
    const { project, selectedClipId } = store.getState();
    this.listContainer.innerHTML = '';

    const filtered = project.clips.filter((c) => {
      const matchSearch = c.name.toLowerCase().includes(this.searchQuery);
      const matchTag = !this.activeTag || c.tags.includes(this.activeTag);

      let matchStatus = true;
      if (this.activeStatusFilter === 'warnings') {
        const warnCount = this.warningsMap.get(c.id) ?? 0;
        matchStatus = warnCount > 0;
      } else if (this.activeStatusFilter !== 'all') {
        matchStatus = c.status === this.activeStatusFilter;
      }

      return matchSearch && matchTag && matchStatus;
    });

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-notice';
      empty.textContent = project.clips.length === 0 ? 'No clips loaded yet.' : 'No matching clips.';
      this.listContainer.appendChild(empty);
      return;
    }

    for (const clip of filtered) {
      const item = document.createElement('div');
      item.className = `clip-item ${clip.id === selectedClipId ? 'selected' : ''}`;
      item.onclick = () => store.selectClip(clip.id);

      const statusDot = document.createElement('span');
      statusDot.className = `status-dot status-${clip.status}`;
      item.appendChild(statusDot);

      const titleWrap = document.createElement('div');
      titleWrap.className = 'clip-info';
      const name = document.createElement('span');
      name.className = 'clip-name';
      name.textContent = clip.name;

      const meta = document.createElement('span');
      meta.className = 'clip-meta';
      const dur = (clip.out - clip.in).toFixed(2);
      const warnCount = this.warningsMap.get(clip.id) ?? 0;
      meta.innerHTML = `${dur}s · <span class="badge-touch-count">${clip.touches.length} touches</span> ${
        warnCount > 0 ? `<span class="badge-warn-count">⚠ ${warnCount}</span>` : ''
      }`;

      titleWrap.appendChild(name);
      titleWrap.appendChild(meta);
      item.appendChild(titleWrap);

      this.listContainer.appendChild(item);
    }
  }
}

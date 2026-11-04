import { Tag } from '../state/project';
import { store } from '../state/store';

export class ClipList {
  readonly element: HTMLElement;
  private readonly searchInput: HTMLInputElement;
  private readonly listContainer: HTMLElement;
  private searchQuery = '';
  private activeTag: Tag | null = null;

  constructor(
    parent: HTMLElement,
    private readonly onDropFiles: (files: FileList) => void,
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

  private renderList(): void {
    const { project, selectedClipId } = store.getState();
    this.listContainer.innerHTML = '';

    const filtered = project.clips.filter((c) => {
      const matchSearch = c.name.toLowerCase().includes(this.searchQuery);
      const matchTag = !this.activeTag || c.tags.includes(this.activeTag);
      return matchSearch && matchTag;
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
      meta.textContent = `${dur}s · ${clip.touches.length} touches`;
      titleWrap.appendChild(name);
      titleWrap.appendChild(meta);
      item.appendChild(titleWrap);

      this.listContainer.appendChild(item);
    }
  }
}

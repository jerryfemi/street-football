import { store } from '../state/store';

export class VideoSync {
  readonly element: HTMLElement;
  private readonly video: HTMLVideoElement;
  private readonly offsetInput: HTMLInputElement;
  private readonly offsetLabel: HTMLElement;
  private offsetSec = 0.0;
  private isLoaded = false;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'video-sync-widget';

    // Header / Toggle
    const header = document.createElement('div');
    header.className = 'video-sync-header';
    header.innerHTML = `
      <span class="video-sync-title">📹 REFERENCE VIDEO</span>
      <div class="video-sync-tools">
        <label class="btn-video-upload" title="Upload reference video">
          📁
          <input type="file" accept="video/mp4,video/webm,video/quicktime" style="display:none;" />
        </label>
        <button class="btn-toggle-video" title="Minimize / Expand">_</button>
      </div>
    `;

    const fileInput = header.querySelector('input')!;
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadVideoFile(file);
    });

    const toggleBtn = header.querySelector('.btn-toggle-video')!;
    toggleBtn.addEventListener('click', () => {
      this.element.classList.toggle('collapsed');
    });

    this.element.appendChild(header);

    // Video container
    const videoWrap = document.createElement('div');
    videoWrap.className = 'video-wrap';

    this.video = document.createElement('video');
    this.video.className = 'ref-video';
    this.video.muted = true;
    this.video.playsInline = true;
    videoWrap.appendChild(this.video);

    const placeholder = document.createElement('div');
    placeholder.className = 'video-placeholder';
    placeholder.textContent = 'Drop phone video here';
    videoWrap.appendChild(placeholder);

    // Drag-and-drop on video wrap
    videoWrap.addEventListener('dragover', (e) => {
      e.preventDefault();
      videoWrap.classList.add('drag-over');
    });
    videoWrap.addEventListener('dragleave', () => videoWrap.classList.remove('drag-over'));
    videoWrap.addEventListener('drop', (e) => {
      e.preventDefault();
      videoWrap.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('video/')) {
        this.loadVideoFile(file);
      }
    });

    this.element.appendChild(videoWrap);

    // Controls: Offset slider
    const controls = document.createElement('div');
    controls.className = 'video-sync-controls';

    const offsetRow = document.createElement('div');
    offsetRow.className = 'offset-row';

    const l = document.createElement('span');
    l.className = 'offset-label';
    l.textContent = 'Sync Offset:';

    this.offsetLabel = document.createElement('span');
    this.offsetLabel.className = 'offset-val';
    this.offsetLabel.textContent = '0.00s';

    this.offsetInput = document.createElement('input');
    this.offsetInput.type = 'range';
    this.offsetInput.min = '-2.0';
    this.offsetInput.max = '2.0';
    this.offsetInput.step = '0.02';
    this.offsetInput.value = '0';
    this.offsetInput.className = 'input-range';
    this.offsetInput.addEventListener('input', () => {
      this.offsetSec = parseFloat(this.offsetInput.value) || 0;
      this.offsetLabel.textContent = `${this.offsetSec >= 0 ? '+' : ''}${this.offsetSec.toFixed(2)}s`;
      this.syncTime(store.getState().currentTime);
    });

    offsetRow.append(l, this.offsetInput, this.offsetLabel);
    controls.appendChild(offsetRow);
    this.element.appendChild(controls);

    parent.appendChild(this.element);
  }

  loadVideoFile(file: File): void {
    const url = URL.createObjectURL(file);
    this.video.src = url;
    this.isLoaded = true;
    this.element.classList.add('has-video');
    const placeholder = this.element.querySelector('.video-placeholder') as HTMLElement;
    if (placeholder) placeholder.style.display = 'none';
  }

  syncTime(currentTime: number): void {
    if (!this.isLoaded || !this.video.duration) return;
    const target = Math.max(0, Math.min(this.video.duration, currentTime + this.offsetSec));
    // Avoid redundant seeking if already very close
    if (Math.abs(this.video.currentTime - target) > 0.04) {
      this.video.currentTime = target;
    }
  }

  setPlaying(playing: boolean): void {
    if (!this.isLoaded) return;
    if (playing) {
      this.video.play().catch(() => {});
    } else {
      this.video.pause();
    }
  }
}

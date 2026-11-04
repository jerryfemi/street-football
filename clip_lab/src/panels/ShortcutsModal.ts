export class ShortcutsModal {
  readonly element: HTMLElement;
  private isVisible = false;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'shortcuts-modal-backdrop hidden';

    this.element.innerHTML = `
      <div class="shortcuts-card">
        <div class="shortcuts-header">
          <div class="shortcuts-title">⌨ KEYBOARD SHORTCUTS</div>
          <button class="btn-close-shortcuts">✕</button>
        </div>
        <div class="shortcuts-grid">
          <div class="shortcut-category">
            <div class="cat-title">PLAYBACK & TRANSPORT</div>
            <div class="shortcut-row"><kbd>Space</kbd> <span>Play / Pause</span></div>
            <div class="shortcut-row"><kbd>J</kbd> / <kbd>K</kbd> / <kbd>L</kbd> <span>Reverse / Stop / Forward</span></div>
            <div class="shortcut-row"><kbd>←</kbd> / <kbd>→</kbd> <span>Step 1 frame</span></div>
            <div class="shortcut-row"><kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd> <span>Step 10 frames</span></div>
            <div class="shortcut-row"><kbd>Home</kbd> <span>Rewind to 0.0s</span></div>
          </div>

          <div class="shortcut-category">
            <div class="cat-title">TOUCHES & EDITING</div>
            <div class="shortcut-row"><kbd>T</kbd> <span>Add touch at playhead</span></div>
            <div class="shortcut-row"><kbd>[</kbd> / <kbd>]</kbd> <span>Select prev / next touch</span></div>
            <div class="shortcut-row"><kbd>Delete</kbd> <span>Delete selected touch</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd> + <kbd>Z</kbd> <span>Undo</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> <span>Redo</span></div>
            <div class="shortcut-row"><kbd>A</kbd> <span>Toggle Approved / Marked</span></div>
          </div>

          <div class="shortcut-category">
            <div class="cat-title">VIEWPORT & CAMERA</div>
            <div class="shortcut-row"><kbd>1</kbd> <span>Side View</span></div>
            <div class="shortcut-row"><kbd>2</kbd> <span>Front View</span></div>
            <div class="shortcut-row"><kbd>3</kbd> <span>Top View</span></div>
            <div class="shortcut-row"><kbd>4</kbd> <span>Feet Close-up</span></div>
            <div class="shortcut-row"><kbd>?</kbd> <span>Toggle Shortcuts Help</span></div>
          </div>
        </div>
      </div>
    `;

    this.element.querySelector('.btn-close-shortcuts')!.addEventListener('click', () => {
      this.toggle(false);
    });

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.toggle(false);
    });

    parent.appendChild(this.element);

    // Global listener for '?' key
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.isVisible) {
        this.toggle(false);
      }
    });
  }

  toggle(visible?: boolean): void {
    this.isVisible = visible !== undefined ? visible : !this.isVisible;
    if (this.isVisible) {
      this.element.classList.remove('hidden');
    } else {
      this.element.classList.add('hidden');
    }
  }
}


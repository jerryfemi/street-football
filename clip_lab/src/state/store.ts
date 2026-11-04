import { defaultProject, type ClipEntry, type Project, type Touch } from './project';
import { loadProject, saveProject } from '../io/db';

export interface Command {
  name: string;
  do: () => void;
  undo: () => void;
}

export interface AppState {
  project: Project;
  selectedClipId: string | null;
  currentTime: number; // trimmed time (s)
  isPlaying: boolean;
  speed: number;
  loop: boolean;
  selectedTouchId: string | null;
  boneRemaps: Record<string, string>;
  isLoaded: boolean;
}

type Listener = (state: AppState) => void;

class Store {
  private state: AppState = {
    project: defaultProject(),
    selectedClipId: null,
    currentTime: 0,
    isPlaying: false,
    speed: 1.0,
    loop: true,
    selectedTouchId: null,
    boneRemaps: {},
    isLoaded: false,
  };

  private listeners = new Set<Listener>();
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private saveTimeout: number | null = null;

  async init(): Promise<void> {
    const saved = await loadProject();
    if (saved) {
      this.state.project = saved;
      if (saved.clips.length > 0) {
        this.state.selectedClipId = saved.clips[0].id;
      }
    }
    this.state.isLoaded = true;
    this.notify();
  }

  getState(): Readonly<AppState> {
    return this.state;
  }

  getSelectedClip(): ClipEntry | null {
    if (!this.state.selectedClipId) return null;
    return this.state.project.clips.find((c) => c.id === this.state.selectedClipId) ?? null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn(this.state);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout !== null) clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      saveProject(this.state.project).catch((err) => console.error('Save failed', err));
      this.saveTimeout = null;
    }, 1000);
  }

  apply(cmd: Command): void {
    cmd.do();
    this.undoStack.push(cmd);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.scheduleSave();
    this.notify();
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.scheduleSave();
    this.notify();
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.do();
    this.undoStack.push(cmd);
    this.scheduleSave();
    this.notify();
  }

  // Playback & UI controls (not pushed to undo stack)
  setTime(t: number): void {
    this.state.currentTime = Math.max(0, t);
    this.notify();
  }

  setPlaying(playing: boolean): void {
    this.state.isPlaying = playing;
    this.notify();
  }

  togglePlay(): void {
    this.state.isPlaying = !this.state.isPlaying;
    this.notify();
  }

  setSpeed(speed: number): void {
    this.state.speed = speed;
    this.notify();
  }

  setLoop(loop: boolean): void {
    this.state.loop = loop;
    this.notify();
  }

  selectClip(clipId: string | null): void {
    this.state.selectedClipId = clipId;
    this.state.currentTime = 0;
    this.state.selectedTouchId = null;
    this.notify();
  }

  selectTouch(touchId: string | null): void {
    this.state.selectedTouchId = touchId;
    this.notify();
  }

  /** Swap in a whole project (Load Project). Clears history and saves. */
  replaceProject(project: Project): void {
    this.state.project = project;
    this.state.selectedClipId = project.clips[0]?.id ?? null;
    this.state.selectedTouchId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.scheduleSave();
    this.notify();
  }

  setCharacterFile(file: string): void {
    this.state.project.characterFile = file;
    this.scheduleSave();
    this.notify();
  }

  addClip(entry: ClipEntry): void {
    const idx = this.state.project.clips.findIndex((c) => c.id === entry.id);
    if (idx >= 0) {
      this.state.project.clips[idx] = entry;
    } else {
      this.state.project.clips.push(entry);
    }
    if (!this.state.selectedClipId) {
      this.state.selectedClipId = entry.id;
    }
    this.scheduleSave();
    this.notify();
  }

  updateClip(clipId: string, updates: Partial<ClipEntry>): void {
    const clip = this.state.project.clips.find((c) => c.id === clipId);
    if (!clip) return;
    Object.assign(clip, updates);
    this.scheduleSave();
    this.notify();
  }

  addTouch(clipId: string, touch: Touch): void {
    const clip = this.state.project.clips.find((c) => c.id === clipId);
    if (!clip) return;
    this.apply({
      name: `Add touch (${touch.foot})`,
      do: () => {
        clip.touches.push(touch);
        clip.touches.sort((a, b) => a.t - b.t);
        this.state.selectedTouchId = touch.id;
      },
      undo: () => {
        clip.touches = clip.touches.filter((t) => t.id !== touch.id);
        if (this.state.selectedTouchId === touch.id) {
          this.state.selectedTouchId = null;
        }
      },
    });
  }

  deleteTouch(clipId: string, touchId: string): void {
    const clip = this.state.project.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const existing = clip.touches.find((t) => t.id === touchId);
    if (!existing) return;
    this.apply({
      name: `Delete touch (${existing.foot})`,
      do: () => {
        clip.touches = clip.touches.filter((t) => t.id !== touchId);
        if (this.state.selectedTouchId === touchId) {
          this.state.selectedTouchId = null;
        }
      },
      undo: () => {
        clip.touches.push(existing);
        clip.touches.sort((a, b) => a.t - b.t);
      },
    });
  }
}

export const store = new Store();


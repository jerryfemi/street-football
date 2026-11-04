export type Foot = 'L' | 'R';
export type FootPart = 'inside' | 'outside' | 'sole' | 'laces' | 'heel' | 'toe';
export type TouchType = 'set' | 'close' | 'push' | 'heavy' | 'cut' | 'drag' | 'trap' | 'flick' | 'shot' | 'pass';
export type Tag = 'dribble' | 'turn' | 'skill' | 'shot' | 'pass' | 'receive' | 'defend' | 'reaction' | 'idle' | 'celebrate';
export type Status = 'raw' | 'marked' | 'approved';

export interface Touch {
  id: string;
  t: number; // seconds (trimmed)
  foot: Foot;
  part: FootPart;
  type: TouchType;
  at: { x: number; z: number; y?: number };
  to?: { x: number; z: number };
  arrive?: number;
  lift?: number;
  stay?: boolean;
  auto?: boolean;
}

export interface Interval {
  from: number;
  to: number;
}

export interface ClipEntry {
  id: string;
  name: string;
  sourceFile: string;
  tags: Tag[];
  status: Status;
  rawDuration: number;
  in: number;
  out: number;
  loop: null | { from: number; to: number };
  exit?: number;
  entryFoot?: Foot;
  fakeSide?: -1 | 0 | 1;
  protected?: Interval;
  planted: { foot: Foot; from: number; to: number }[];
  touches: Touch[];
  cleanup: { smooth: number; footLock: boolean; mirroredFrom?: string };
  rootMotion: { extracted: boolean; mode: 'none' | 'xz' | 'xz+yaw' };
  notes?: string;
}

export interface Project {
  version: 1;
  characterFile: string;
  clips: ClipEntry[];
  settings: { fps: 30; groundOffset: number };
}

export function defaultProject(): Project {
  return {
    version: 1,
    characterFile: '',
    clips: [],
    settings: { fps: 30, groundOffset: 0 },
  };
}

export function createClipEntry(name: string, sourceFile: string, rawDuration: number, isRokoko = false): ClipEntry {
  return {
    id: name,
    name,
    sourceFile,
    tags: isRokoko ? ['skill'] : ['dribble'],
    status: 'raw',
    rawDuration,
    in: isRokoko ? Math.min(0.1, rawDuration) : 0,
    out: rawDuration,
    loop: null,
    planted: [],
    touches: [],
    cleanup: { smooth: 0, footLock: false },
    rootMotion: { extracted: false, mode: 'none' },
  };
}


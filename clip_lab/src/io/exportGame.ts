import { AnimationClip, AnimationUtils, type Object3D } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { WebIO } from '@gltf-transform/core';
import { dedup, prune, quantize, resample } from '@gltf-transform/functions';
import type { ClipEntry, Project } from '../state/project';

export interface ClipsJsonExport {
  format: 'pannaverse-clips';
  version: 1;
  fps: number;
  character: { height: number };
  clips: Record<string, ClipDataExport>;
}

export interface ClipDataExport {
  duration: number;
  tags: string[];
  loop: { from: number; to: number } | null;
  exit?: number;
  entryFoot?: 'L' | 'R';
  fakeSide?: -1 | 0 | 1;
  protected?: { from: number; to: number };
  planted: { foot: 'L' | 'R'; from: number; to: number }[];
  root?: {
    mode: 'none' | 'xz' | 'xz+yaw';
    samples: [number, number, number, number][];
  };
  touches: {
    t: number;
    foot: 'L' | 'R';
    part: string;
    type: string;
    at: { x: number; z: number; y?: number };
    to?: { x: number; z: number };
    arrive?: number;
    lift?: number;
    stay?: boolean;
  }[];
}

const round3 = (n: number) => Number(n.toFixed(3));

type RootSamples = Map<string, [number, number, number, number][]>;

/**
 * Root samples are [t, x, z, yaw] in untrimmed clip time, world-at-yaw-0 axes.
 * The contract wants trimmed time, local axes (x = right = -world.x), relative to the trimmed start.
 */
function trimRoot(samples: [number, number, number, number][], tin: number, tout: number): [number, number, number, number][] {
  const inside = samples.filter((s) => s[0] >= tin - 1e-6 && s[0] <= tout + 1e-6);
  if (inside.length === 0) return [];
  const [, x0, z0, yaw0] = inside[0];
  const c = Math.cos(-yaw0);
  const sn = Math.sin(-yaw0);
  return inside.map(([t, x, z, yaw]) => {
    const dx = x - x0;
    const dz = z - z0;
    // undo the start yaw so the path is relative to the facing at the trimmed start
    const rx = dx * c + dz * sn;
    const rz = -dx * sn + dz * c;
    return [round3(t - tin), round3(-rx), round3(rz), round3(yaw - yaw0)];
  });
}

export function buildClipsJson(
  project: Project,
  approvedOnly = false,
  rootSamples: RootSamples = new Map(),
): ClipsJsonExport {
  const clipsMap: Record<string, ClipDataExport> = {};
  const entries = approvedOnly
    ? project.clips.filter((c) => c.status === 'approved')
    : project.clips;

  for (const entry of entries) {
    // keys are inserted in the exact order of the contract (§6)
    const clipData = {
      duration: round3(entry.out - entry.in),
      tags: [...entry.tags],
      loop: entry.loop ? { from: round3(entry.loop.from), to: round3(entry.loop.to) } : null,
    } as ClipDataExport;
    if (entry.exit !== undefined) clipData.exit = round3(entry.exit);
    if (entry.entryFoot) clipData.entryFoot = entry.entryFoot;
    if (entry.fakeSide !== undefined && entry.fakeSide !== 0) clipData.fakeSide = entry.fakeSide;
    if (entry.protected) {
      clipData.protected = { from: round3(entry.protected.from), to: round3(entry.protected.to) };
    }
    clipData.planted = entry.planted.map((p) => ({ foot: p.foot, from: round3(p.from), to: round3(p.to) }));
    const root = rootSamples.get(entry.id);
    if (entry.rootMotion.extracted && entry.rootMotion.mode !== 'none' && root && root.length > 0) {
      clipData.root = { mode: entry.rootMotion.mode, samples: trimRoot(root, entry.in, entry.out) };
    }
    clipData.touches = [...entry.touches]
      .sort((a, b) => a.t - b.t)
      .map((t) => {
        const item: ClipDataExport['touches'][number] = {
          t: round3(t.t),
          foot: t.foot,
          part: t.part,
          type: t.type,
          at: {
            x: round3(t.at.x),
            z: round3(t.at.z),
            ...(t.at.y !== undefined ? { y: round3(t.at.y) } : {}),
          },
        };
        if (t.to) item.to = { x: round3(t.to.x), z: round3(t.to.z) };
        if (t.arrive !== undefined) item.arrive = round3(t.arrive);
        if (t.lift !== undefined && t.lift > 0) item.lift = round3(t.lift);
        if (t.stay) item.stay = true;
        return item;
      });
    clipsMap[entry.id] = clipData;
  }

  return {
    format: 'pannaverse-clips',
    version: 1,
    fps: project.settings.fps || 30,
    character: { height: 1.8 },
    clips: clipsMap,
  };
}

export async function exportPlayerGlb(
  characterRoot: Object3D,
  clips: Map<string, AnimationClip>,
  entries: ClipEntry[],
  approvedOnly = false,
  fps = 30,
): Promise<Uint8Array> {
  const filteredEntries = approvedOnly
    ? entries.filter((e) => e.status === 'approved')
    : entries;

  // Trim clips to match in/out
  const animsToExport: AnimationClip[] = [];
  for (const entry of filteredEntries) {
    const raw = clips.get(entry.id);
    if (!raw) continue;

    // Sub-clip by trimming to entry.in .. entry.out
    const trimmed = AnimationUtils.subclip(
      raw,
      entry.id,
      Math.max(0, Math.round(entry.in * fps)),
      Math.min(Math.round(raw.duration * fps), Math.round(entry.out * fps)),
      fps,
    );
    trimmed.name = entry.id;
    animsToExport.push(trimmed);
  }

  const exporter = new GLTFExporter();
  const rawGlb = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      characterRoot,
      (res) => resolve(res as ArrayBuffer),
      (err) => reject(err),
      {
        binary: true,
        animations: animsToExport,
      },
    );
  });

  // Optimize with glTF-Transform: dedup, prune, resample
  try {
    const io = new WebIO();
    const doc = await io.readBinary(new Uint8Array(rawGlb));
    await doc.transform(
      dedup(),
      prune(),
      resample(),
      quantize(),
    );
    const optimized = await io.writeBinary(doc);
    return optimized;
  } catch (err) {
    console.warn('glTF-Transform optimization skipped, using raw glb export:', err);
    return new Uint8Array(rawGlb);
  }
}

export function downloadFile(filename: string, content: string | Uint8Array, mimeType: string): void {
  const blob = new Blob([content as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportProjectFile(project: Project): void {
  const jsonStr = JSON.stringify(project, null, 2);
  downloadFile('project.cliplab.json', jsonStr, 'application/json');
}

export async function importProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Project;
  if (parsed.version !== 1 || !Array.isArray(parsed.clips)) {
    throw new Error('Invalid .cliplab.json project file format');
  }
  return parsed;
}

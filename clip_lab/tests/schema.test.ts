import { describe, it, expect } from 'vitest';
import { buildClipsJson } from '../src/io/exportGame';
import type { Project } from '../src/state/project';

describe('Export Schema Validation (§6)', () => {
  it('generates clips.json matching the exact contract', () => {
    const mockProject: Project = {
      version: 1,
      characterFile: 'player.fbx',
      settings: { fps: 30, groundOffset: 0 },
      clips: [
        {
          id: 'stepover_R',
          name: 'stepover_R',
          sourceFile: 'stepover.fbx',
          tags: ['skill'],
          status: 'approved',
          rawDuration: 2.0,
          in: 0.1,
          out: 1.5,
          loop: null,
          exit: 1.1,
          entryFoot: 'L',
          fakeSide: -1,
          protected: { from: 0.1, to: 0.75 },
          planted: [{ foot: 'R', from: 0.1, to: 0.7 }],
          cleanup: { smooth: 0, footLock: false },
          rootMotion: { extracted: false, mode: 'none' },
          touches: [
            {
              id: 't1',
              t: 0.08,
              foot: 'R',
              part: 'sole',
              type: 'set',
              at: { x: 0.0, z: 0.3 },
            },
            {
              id: 't2',
              t: 0.82,
              foot: 'R',
              part: 'outside',
              type: 'push',
              at: { x: 0.05, z: 0.32 },
              to: { x: 1.2, z: 1.4 },
              arrive: 0.45,
            },
          ],
        },
      ],
    };

    const exported = buildClipsJson(mockProject);

    expect(exported.format).toBe('pannaverse-clips');
    expect(exported.version).toBe(1);
    expect(exported.fps).toBe(30);
    expect(exported.character.height).toBe(1.8);

    const stepover = exported.clips['stepover_R'];
    expect(stepover).toBeDefined();
    expect(stepover.duration).toBe(1.4);
    expect(stepover.tags).toEqual(['skill']);
    expect(stepover.loop).toBeNull();
    expect(stepover.exit).toBe(1.1);
    expect(stepover.entryFoot).toBe('L');
    expect(stepover.fakeSide).toBe(-1);
    expect(stepover.protected).toEqual({ from: 0.1, to: 0.75 });
    expect(stepover.planted).toHaveLength(1);
    expect(stepover.planted[0]).toEqual({ foot: 'R', from: 0.1, to: 0.7 });

    expect(stepover.touches).toHaveLength(2);
    expect(stepover.touches[0]).toMatchObject({
      t: 0.08,
      foot: 'R',
      part: 'sole',
      type: 'set',
      at: { x: 0.0, z: 0.3 },
    });
    expect(stepover.touches[1]).toMatchObject({
      t: 0.82,
      foot: 'R',
      part: 'outside',
      type: 'push',
      at: { x: 0.05, z: 0.32 },
      to: { x: 1.2, z: 1.4 },
      arrive: 0.45,
    });
  });
});


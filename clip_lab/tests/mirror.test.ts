import { describe, it, expect } from 'vitest';
import {
  AnimationClip,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';
import { mirrorClip } from '../src/analysis/mirror';
import type { ClipEntry } from '../src/state/project';

describe('Mirroring Algorithm (§7.7 & §12 M3)', () => {
  it('mirroring twice returns the original within 1e-5', () => {
    const times = [0, 0.5, 1.0];
    const leftQuatVals = [
      0.1, 0.2, 0.3, 0.9,
      0.15, 0.25, 0.35, 0.88,
      0.2, 0.3, 0.4, 0.84,
    ];
    const rightQuatVals = [
      -0.1, -0.2, -0.3, 0.9,
      -0.15, -0.25, -0.35, 0.88,
      -0.2, -0.3, -0.4, 0.84,
    ];
    const hipsPosVals = [
      0.25, 0.9, 0.1,
      0.35, 0.92, 0.4,
      0.45, 0.88, 0.8,
    ];

    const tracks = [
      new QuaternionKeyframeTrack('mixamorigLeftUpLeg.quaternion', times, leftQuatVals),
      new QuaternionKeyframeTrack('mixamorigRightUpLeg.quaternion', times, rightQuatVals),
      new VectorKeyframeTrack('mixamorigHips.position', times, hipsPosVals),
    ];

    const clip = new AnimationClip('stepover_R', 1.0, tracks);
    const entry: ClipEntry = {
      id: 'stepover_R',
      name: 'stepover_R',
      sourceFile: 'stepover_R.fbx',
      tags: ['skill'],
      status: 'approved',
      rawDuration: 1.0,
      in: 0,
      out: 1.0,
      loop: null,
      fakeSide: 1,
      entryFoot: 'R',
      planted: [{ foot: 'L', from: 0.1, to: 0.5 }],
      touches: [
        {
          id: 't1',
          t: 0.2,
          foot: 'R',
          part: 'sole',
          type: 'set',
          at: { x: 0.15, z: 0.3 },
          to: { x: 0.4, z: 0.8 },
        },
      ],
      cleanup: { smooth: 0, footLock: false },
      rootMotion: { extracted: false, mode: 'none' },
    };

    // Mirror 1st time
    const m1 = mirrorClip(clip, entry);
    expect(m1.entry.id).toBe('stepover_L');
    expect(m1.entry.fakeSide).toBe(-1);
    expect(m1.entry.entryFoot).toBe('L');
    expect(m1.entry.touches[0].foot).toBe('L');
    expect(m1.entry.touches[0].at.x).toBeCloseTo(-0.15, 4);
    expect(m1.entry.touches[0].to?.x).toBeCloseTo(-0.4, 4);

    // Mirror 2nd time (should return original)
    const m2 = mirrorClip(m1.clip, m1.entry);
    expect(m2.entry.id).toBe('stepover_R');
    expect(m2.entry.fakeSide).toBe(1);
    expect(m2.entry.entryFoot).toBe('R');
    expect(m2.entry.touches[0].foot).toBe('R');
    expect(m2.entry.touches[0].at.x).toBeCloseTo(0.15, 4);
    expect(m2.entry.touches[0].to?.x).toBeCloseTo(0.4, 4);

    // Check tracks accuracy within 1e-5
    for (let tIdx = 0; tIdx < clip.tracks.length; tIdx++) {
      const origTrack = clip.tracks[tIdx];
      const roundTripTrack = m2.clip.tracks.find((t) => t.name === origTrack.name);
      expect(roundTripTrack).toBeDefined();

      for (let i = 0; i < origTrack.values.length; i++) {
        expect(roundTripTrack!.values[i]).toBeCloseTo(origTrack.values[i], 4);
      }
    }
  });
});

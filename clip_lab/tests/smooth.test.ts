import { describe, it, expect } from 'vitest';
import { AnimationClip, QuaternionKeyframeTrack } from 'three';
import { smoothClip } from '../src/analysis/smooth';

describe('Smoothing Algorithm (§7.5)', () => {
  it('smoothing a constant track returns the same track', () => {
    const times = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
    const qConst = [0, 0, 0, 1];
    const values: number[] = [];
    for (let i = 0; i < times.length; i++) {
      values.push(...qConst);
    }

    const track = new QuaternionKeyframeTrack('mixamorigSpine.quaternion', times, values);
    const clip = new AnimationClip('test_smooth', 0.5, [track]);

    const smoothed = smoothClip(clip, 5, []);
    const smoothedTrack = smoothed.tracks[0];

    for (let i = 0; i < values.length; i++) {
      expect(smoothedTrack.values[i]).toBeCloseTo(values[i], 4);
    }
  });

  it('reduces high frequency jitter while preserving orientation', () => {
    const times = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
    // Add noise to Y component
    const values = [
      0, 0.1, 0, 0.995,
      0, -0.1, 0, 0.995,
      0, 0.12, 0, 0.993,
      0, -0.11, 0, 0.994,
      0, 0.1, 0, 0.995,
      0, -0.1, 0, 0.995,
      0, 0.0, 0, 1.0,
    ];

    const track = new QuaternionKeyframeTrack('mixamorigSpine.quaternion', times, values);
    const clip = new AnimationClip('jitter_test', 0.3, [track]);

    const smoothed = smoothClip(clip, 3, []);
    const smoothedTrack = smoothed.tracks[0];

    // Jittered amplitude at middle keyframe should be significantly attenuated
    const midIdx = 3 * 4 + 1; // Y value of 4th frame
    expect(Math.abs(smoothedTrack.values[midIdx])).toBeLessThan(Math.abs(values[midIdx]));
  });
});

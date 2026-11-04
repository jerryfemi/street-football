import { describe, it, expect } from 'vitest';
import { detectTouches, defaultDetectionThresholds } from '../src/analysis/detectTouches';
import { detectPlanted } from '../src/analysis/detectPlanted';
import type { ClipFootTracks, FootTrackPoint } from '../src/analysis/footTracks';
import type { ClipEntry } from '../src/state/project';

function createMockTracks(frameCount: number, fps = 30): ClipFootTracks {
  const points: FootTrackPoint[] = [];
  const dt = 1 / fps;

  for (let i = 0; i < frameCount; i++) {
    const t = i * dt;
    points.push({
      t,
      toeL: { x: -0.15, y: 0.2, z: 0.1 },
      toeR: { x: 0.15, y: 0.2, z: 0.1 },
      ankleL: { x: -0.15, y: 0.28, z: 0.05 },
      ankleR: { x: 0.15, y: 0.28, z: 0.05 },
      hips: { x: 0, y: 0.9, z: t * 1.5 },
      toeVelL: { x: 0, y: 0, z: 1.5, speed: 1.5, speedH: 1.5 },
      toeVelR: { x: 0, y: 0, z: 1.5, speed: 1.5, speedH: 1.5 },
      ankleVelL: { x: 0, y: 0, z: 1.5, speed: 1.5, speedH: 1.5 },
      ankleVelR: { x: 0, y: 0, z: 1.5, speed: 1.5, speedH: 1.5 },
    });
  }

  return { fps, duration: frameCount * dt, frameCount, points };
}

describe('Touch Detection', () => {
  it('detects no touches on idle/airborne foot tracks', () => {
    const tracks = createMockTracks(30);
    const clip: ClipEntry = {
      id: 'test',
      name: 'test',
      sourceFile: 'test.fbx',
      tags: ['dribble'],
      status: 'raw',
      rawDuration: 1.0,
      in: 0,
      out: 1.0,
      loop: null,
      planted: [],
      touches: [],
      cleanup: { smooth: 0, footLock: false },
      rootMotion: { extracted: false, mode: 'none' },
    };

    const touches = detectTouches(tracks, clip);
    expect(touches).toHaveLength(0);
  });

  it('detects a kick/touch when foot drops low, moves fast, and suddenly decelerates', () => {
    const tracks = createMockTracks(30);
    const touchFrame = 12;

    // Simulate fast right foot swing into ball at frame 12
    for (let i = touchFrame - 3; i < touchFrame; i++) {
      tracks.points[i].toeR.y = 0.08;
      tracks.points[i].ankleR.y = 0.12;
      tracks.points[i].toeR.z = 0.25;
      tracks.points[i].toeVelR = { x: -0.5, y: -0.2, z: 2.2, speed: 2.26, speedH: 2.25 };
    }

    // Impact at frame 12
    tracks.points[touchFrame].toeR.y = 0.05;
    tracks.points[touchFrame].ankleR.y = 0.10;
    tracks.points[touchFrame].toeR.z = 0.32;
    tracks.points[touchFrame].toeVelR = { x: 0.1, y: 0.1, z: 0.4, speed: 0.42, speedH: 0.41 };

    const clip: ClipEntry = {
      id: 'kick_test',
      name: 'kick_test',
      sourceFile: 'kick.fbx',
      tags: ['skill'],
      status: 'raw',
      rawDuration: 1.0,
      in: 0,
      out: 1.0,
      loop: null,
      planted: [],
      touches: [],
      cleanup: { smooth: 0, footLock: false },
      rootMotion: { extracted: false, mode: 'none' },
    };

    const touches = detectTouches(tracks, clip, defaultDetectionThresholds);
    expect(touches.length).toBeGreaterThanOrEqual(1);
    const touch = touches[0];
    expect(touch.foot).toBe('R');
    expect(Math.abs(touch.t - touchFrame / 30)).toBeLessThanOrEqual(0.1);
    expect(touch.at.z).toBeGreaterThan(0.2);
    expect(touch.auto).toBe(true);
  });
});

describe('Planted Foot Detection', () => {
  it('detects grounded stationary intervals', () => {
    const tracks = createMockTracks(30);
    // Plant Left foot from frame 5 to 15
    for (let i = 5; i <= 15; i++) {
      tracks.points[i].toeL.y = 0.02;
      tracks.points[i].ankleL.y = 0.06;
      tracks.points[i].toeVelL = { x: 0.02, y: 0, z: 0.05, speed: 0.054, speedH: 0.054 };
    }

    const clip: ClipEntry = {
      id: 'plant_test',
      name: 'plant_test',
      sourceFile: 'plant.fbx',
      tags: ['dribble'],
      status: 'raw',
      rawDuration: 1.0,
      in: 0,
      out: 1.0,
      loop: null,
      planted: [],
      touches: [],
      cleanup: { smooth: 0, footLock: false },
      rootMotion: { extracted: false, mode: 'none' },
    };

    const planted = detectPlanted(tracks, clip);
    expect(planted.length).toBeGreaterThanOrEqual(1);
    expect(planted[0].foot).toBe('L');
    expect(planted[0].from).toBeCloseTo(5 / 30, 2);
    expect(planted[0].to).toBeCloseTo(15 / 30, 2);
  });
});

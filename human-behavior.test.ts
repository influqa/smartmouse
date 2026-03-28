/**
 * Test Cases for Human Behavior Simulation (human-behavior.ts)
 * Tests human-like mouse movement features including:
 * - Bezier curve path generation
 * - Micro-jitter simulation
 * - Natural acceleration/deceleration
 * - Variable speed profiles
 * - Gaussian-distributed delays
 */

import { describe, it, expect } from 'bun:test';
import {
  randomBetween,
  randomDelay,
  generateBezierPath,
  generateHumanPath,
  Point
} from './human-behavior';

describe('randomBetween', () => {
  it('should return a number between min and max', () => {
    for (let i = 0; i < 100; i++) {
      const result = randomBetween(10, 20);
      expect(result).toBeGreaterThanOrEqual(10);
      expect(result).toBeLessThanOrEqual(20);
    }
  });

  it('should return integer values', () => {
    const result = randomBetween(5, 10);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('should handle min === max', () => {
    const result = randomBetween(7, 7);
    expect(result).toBe(7);
  });
});

describe('randomDelay', () => {
  it('should return a non-negative number', () => {
    for (let i = 0; i < 100; i++) {
      const result = randomDelay(50, 10);
      expect(result).toBeGreaterThanOrEqual(0);
    }
  });

  it('should return values around the mean', () => {
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      samples.push(randomDelay(100, 20));
    }

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    // Average should be close to mean (within 2 standard deviations)
    expect(avg).toBeGreaterThan(60);
    expect(avg).toBeLessThan(140);
  });

  it('should have variation based on stdDev', () => {
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      samples.push(randomDelay(100, 30));
    }

    const min = Math.min(...samples);
    const max = Math.max(...samples);
    // Should have reasonable spread
    expect(max - min).toBeGreaterThan(50);
  });
});

describe('generateBezierPath', () => {
  it('should generate a path from start to end', () => {
    const start = { x: 100, y: 200 };
    const end = { x: 500, y: 600 };
    const path = generateBezierPath(start, end);

    expect(path.length).toBeGreaterThan(0);
    expect(path[0].x).toBeCloseTo(start.x, 0);
    expect(path[0].y).toBeCloseTo(start.y, 0);

    const lastPoint = path[path.length - 1];
    expect(lastPoint.x).toBeCloseTo(end.x, 0);
    expect(lastPoint.y).toBeCloseTo(end.y, 0);
  });

  it('should generate smooth curved paths', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 1000, y: 0 };
    
    // Run multiple times since control points are random
    let hasCurvature = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const path = generateBezierPath(start, end);
      
      // Path should have some curvature (not perfectly straight)
      for (const point of path) {
        if (Math.abs(point.y - start.y) > 5) {
          hasCurvature = true;
          break;
        }
      }
      if (hasCurvature) break;
    }
    
    // At least one attempt should show curvature
    expect(hasCurvature).toBe(true);
  });

  it('should generate variable length paths', () => {
    const start = { x: 100, y: 200 };
    const end = { x: 300, y: 400 };

    const path1 = generateBezierPath(start, end);
    const path2 = generateBezierPath(start, end);

    // Paths should have similar but potentially different lengths
    expect(path1.length).toBeGreaterThan(10);
    expect(path2.length).toBeGreaterThan(10);
  });
});

describe('generateHumanPath', () => {
  it('should generate path with points and delays', () => {
    const start = { x: 100, y: 200 };
    const end = { x: 500, y: 600 };
    const config = {
      useBezier: true,
      addJitter: false,
      jitterAmplitude: 1.0,
      variableSpeed: false,
      baseDelay: 10,
      acceleration: false
    };

    const { points, delays } = generateHumanPath(start, end, config);

    expect(points.length).toBeGreaterThan(0);
    expect(delays.length).toBe(points.length);
    expect(points[0].x).toBeCloseTo(start.x, 0);
    expect(points[0].y).toBeCloseTo(start.y, 0);
  });

  it('should add jitter to path when enabled', () => {
    const start = { x: 500, y: 500 };
    const end = { x: 600, y: 600 };
    const config = {
      useBezier: false, // Use linear for predictable test
      addJitter: true,
      jitterAmplitude: 2.0,
      variableSpeed: false,
      baseDelay: 10,
      acceleration: false
    };

    const { points } = generateHumanPath(start, end, config);

    // Points should have some variation from perfect line
    let hasJitter = false;
    for (let i = 1; i < points.length - 1; i++) {
      const point = points[i];
      const expectedX = start.x + (end.x - start.x) * (i / points.length);
      const deviation = Math.abs(point.x - expectedX);
      if (deviation > 0.5) {
        hasJitter = true;
      }
      // Jitter should be within reasonable bounds (amplitude * 2 + margin)
      expect(deviation).toBeLessThan(8);
    }
    expect(hasJitter).toBe(true);
  });

  it('should generate acceleration/deceleration profile', () => {
    const start = { x: 100, y: 200 };
    const end = { x: 500, y: 600 };
    const config = {
      useBezier: false,
      addJitter: false,
      jitterAmplitude: 0,
      variableSpeed: true,
      baseDelay: 10,
      acceleration: true
    };

    const { delays } = generateHumanPath(start, end, config);

    expect(delays.length).toBeGreaterThan(0);
    // First delays should be larger (slower movement at start)
    expect(delays[0]).toBeGreaterThan(5);
    // Last delays should be larger (slower movement at end)
    const lastDelay = delays[delays.length - 1];
    expect(lastDelay).toBeGreaterThan(5);
  });

  it('should use constant speed when acceleration disabled', () => {
    const start = { x: 100, y: 200 };
    const end = { x: 500, y: 600 };
    const config = {
      useBezier: false,
      addJitter: false,
      jitterAmplitude: 0,
      variableSpeed: false,
      baseDelay: 10,
      acceleration: false
    };

    const { delays } = generateHumanPath(start, end, config);

    expect(delays.length).toBeGreaterThan(0);
    // Delays should be relatively consistent
    const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
    for (const delay of delays) {
      // Each delay should be close to average (within 30% due to random variation)
      expect(delay).toBeGreaterThan(avgDelay * 0.5);
      expect(delay).toBeLessThan(avgDelay * 1.5);
    }
  });

  it('should handle different movement distances', () => {
    const shortStart = { x: 100, y: 200 };
    const shortEnd = { x: 150, y: 250 };
    const longStart = { x: 100, y: 200 };
    const longEnd = { x: 900, y: 850 };

    const config = {
      useBezier: true,
      addJitter: false,
      jitterAmplitude: 0,
      variableSpeed: false,
      baseDelay: 10,
      acceleration: false
    };

    const shortPath = generateHumanPath(shortStart, shortEnd, config);
    const longPath = generateHumanPath(longStart, longEnd, config);

    expect(shortPath.points.length).toBeGreaterThan(0);
    expect(longPath.points.length).toBeGreaterThan(0);
  });

  it('should generate natural curved paths with Bezier', () => {
    const start = { x: 0, y: 500 };
    const end = { x: 1000, y: 500 };
    const config = {
      useBezier: true,
      addJitter: false,
      jitterAmplitude: 0,
      variableSpeed: false,
      baseDelay: 10,
      acceleration: false
    };

    const { points } = generateHumanPath(start, end, config);

    // Bezier path should curve away from straight line
    let maxDeviation = 0;
    for (const point of points) {
      const expectedY = 500; // Straight line Y
      const deviation = Math.abs(point.y - expectedY);
      maxDeviation = Math.max(maxDeviation, deviation);
    }

    // Bezier curves should create some deviation (may be subtle sometimes)
    expect(maxDeviation).toBeGreaterThan(0);
  });
});

describe('generateHumanPath - Integration', () => {
  it('should work with full configuration', () => {
    const start = { x: 100, y: 200 };
    const end = { x: 800, y: 600 };
    const config = {
      useBezier: true,
      addJitter: true,
      jitterAmplitude: 1.5,
      variableSpeed: true,
      baseDelay: 8,
      acceleration: true
    };

    const { points, delays } = generateHumanPath(start, end, config);

    expect(points.length).toBeGreaterThan(10);
    expect(delays.length).toBe(points.length);

    // Verify path starts near start point (allowing for jitter and Bezier control points)
    expect(Math.abs(points[0].x - start.x)).toBeLessThan(5);
    expect(Math.abs(points[0].y - start.y)).toBeLessThan(5);

    // Verify path ends near end point (allowing for jitter and Bezier control points)
    const lastPoint = points[points.length - 1];
    expect(Math.abs(lastPoint.x - end.x)).toBeLessThan(5);
    expect(Math.abs(lastPoint.y - end.y)).toBeLessThan(5);

    // Verify delays are reasonable (between 2ms and 100ms)
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(2);
      expect(delay).toBeLessThan(100);
    }
  });

  it('should generate different paths on each call', () => {
    const start = { x: 100, y: 200 };
    const end = { x: 500, y: 600 };
    const config = {
      useBezier: true,
      addJitter: true,
      jitterAmplitude: 1.0,
      variableSpeed: true,
      baseDelay: 10,
      acceleration: true
    };

    const path1 = generateHumanPath(start, end, config);
    const path2 = generateHumanPath(start, end, config);

    // Paths should differ due to randomness
    let pathsDiffer = false;
    for (let i = 0; i < Math.min(path1.points.length, path2.points.length); i++) {
      if (
        Math.abs(path1.points[i].x - path2.points[i].x) > 1 ||
        Math.abs(path1.points[i].y - path2.points[i].y) > 1
      ) {
        pathsDiffer = true;
        break;
      }
    }
    expect(pathsDiffer).toBe(true);
  });
});

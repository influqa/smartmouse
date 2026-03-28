/**
 * Human Behavior Simulation for SmartMouse
 * Provides realistic mouse movements, typing patterns, and scrolling behavior
 * for natural interaction patterns
 */

// Random number between min and max
export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random delay with Gaussian distribution (more natural)
export function randomDelay(mean: number, stdDev: number): number {
  // Box-Muller transform for normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return Math.max(0, mean + z0 * stdDev);
}

// Bezier curve point calculation
interface Point {
  x: number;
  y: number;
}

function cubicBezier(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const cx = 3 * (p1.x - p0.x);
  const bx = 3 * (p2.x - p1.x) - cx;
  const ax = p3.x - p0.x - cx - bx;

  const cy = 3 * (p1.y - p0.y);
  const by = 3 * (p2.y - p1.y) - cy;
  const ay = p3.y - p0.y - cy - by;

  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: ax * t3 + bx * t2 + cx * t + p0.x,
    y: ay * t3 + by * t2 + cy * t + p0.y
  };
}

// Generate human-like mouse path using Bezier curves
export function generateBezierPath(
  start: Point,
  end: Point,
  controlPoints: number = 2
): Point[] {
  const points: Point[] = [];
  const steps = randomBetween(15, 35); // Variable number of steps

  // Generate random control points for natural curves
  const cp1: Point = {
    x: start.x + (end.x - start.x) * (0.2 + Math.random() * 0.3),
    y: start.y + (end.y - start.y) * (0.1 + Math.random() * 0.3) + randomBetween(-50, 50)
  };

  const cp2: Point = {
    x: start.x + (end.x - start.x) * (0.6 + Math.random() * 0.3),
    y: start.y + (end.y - start.y) * (0.6 + Math.random() * 0.3) + randomBetween(-50, 50)
  };

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(cubicBezier(t, start, cp1, cp2, end));
  }

  return points;
}

// Export sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

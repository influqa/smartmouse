/**
 * Human Behavior Simulation for SmartMouse
 * Provides realistic mouse movements, typing patterns, and scrolling behavior
 * for natural interaction patterns
 * 
 * Features:
 * - Bezier curve-based mouse paths
 * - Natural acceleration/deceleration
 * - Micro-jitter and hand tremor simulation
 * - Variable speed profiles
 * - Human-like timing patterns
 */

import { getCursorPosition, moveMouse } from './actions';

// Random number between min and max
export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random float between min and max
export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// Random delay with Gaussian distribution (more natural)
export function randomDelay(mean: number, stdDev: number): number {
  // Box-Muller transform for normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return Math.max(0, mean + z0 * stdDev);
}

// Point interface
export interface Point {
  x: number;
  y: number;
}

// Bezier curve point calculation
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

// Add micro-jitter to simulate hand tremor
export function addJitter(point: Point, amplitude: number = 1.5): Point {
  return {
    x: point.x + randomFloat(-amplitude, amplitude),
    y: point.y + randomFloat(-amplitude, amplitude)
  };
}

// Generate speed profile with natural acceleration/deceleration
// Uses ease-in-out curve: slow start, fast middle, slow end
export function generateSpeedProfile(totalSteps: number): number[] {
  const speeds: number[] = [];
  
  for (let i = 0; i < totalSteps; i++) {
    const t = i / (totalSteps - 1);
    // Ease-in-out cubic: 3t² - 2t³
    const speed = 3 * t * t - 2 * t * t * t;
    // Add small variation
    const variedSpeed = speed + randomFloat(-0.05, 0.05);
    speeds.push(Math.max(0.1, Math.min(1, variedSpeed)));
  }
  
  return speeds;
}

// Calculate delay between points based on speed profile
export function calculateStepDelay(baseDelay: number, speed: number): number {
  // Slower speed = longer delay
  const speedFactor = 1.5 - speed * 0.8; // Range: 0.7 to 1.5
  return baseDelay * speedFactor;
}

// Generate a complete human-like mouse movement path
export interface MovementOptions {
  useBezier?: boolean;
  addJitter?: boolean;
  jitterAmplitude?: number;
  variableSpeed?: boolean;
  baseDelay?: number;
  acceleration?: boolean;
}

export function generateHumanPath(
  start: Point,
  end: Point,
  options: MovementOptions = {}
): { points: Point[]; delays: number[] } {
  const {
    useBezier = true,
    addJitter: applyJitter = true,
    jitterAmplitude = 1.5,
    variableSpeed = true,
    baseDelay = 8,
    acceleration = true
  } = options;

  // Generate base path
  let points: Point[];
  if (useBezier) {
    points = generateBezierPath(start, end);
  } else {
    // Linear interpolation
    const steps = randomBetween(20, 40);
    points = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t
      });
    }
  }

  // Apply jitter to each point
  if (applyJitter) {
    points = points.map(p => addJitter(p, jitterAmplitude));
  }

  // Generate speed profile and delays
  const speeds = variableSpeed && acceleration 
    ? generateSpeedProfile(points.length)
    : points.map(() => 0.5); // Constant medium speed
  
  const delays = speeds.map(speed => calculateStepDelay(baseDelay, speed));

  return { points, delays };
}

// Execute human-like mouse movement
export async function humanMoveMouse(startX: number, startY: number, endX: number, endY: number): Promise<void> {
  const start: Point = { x: startX, y: startY };
  const end: Point = { x: endX, y: endY };
  
  const { points, delays } = generateHumanPath(start, end, {
    useBezier: true,
    addJitter: true,
    jitterAmplitude: 1.2,
    variableSpeed: true,
    baseDelay: 6,
    acceleration: true
  });

  // Execute the movement
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    await moveMouse(Math.round(point.x), Math.round(point.y));
    
    // Add delay between steps
    if (i < delays.length) {
      await sleep(delays[i]);
    }
  }
}

// Human-like typing delay between keystrokes
export function getTypingDelay(): number {
  // Average human typing: 40-80 WPM = 150-300ms per character
  // With variation for natural feel
  return randomDelay(200, 50);
}

// Human-like scroll pattern with acceleration
export function generateScrollPattern(
  totalSteps: number,
  direction: 'up' | 'down'
): { delays: number[]; amounts: number[] } {
  const delays: number[] = [];
  const amounts: number[] = [];
  
  // Start slow, speed up, then slow down
  const speeds = generateSpeedProfile(totalSteps);
  
  for (let i = 0; i < totalSteps; i++) {
    // Scroll amount varies slightly (1-3 lines typically)
    const baseAmount = direction === 'down' ? 1 : -1;
    const variation = randomFloat(0.8, 1.2);
    amounts.push(baseAmount * variation);
    
    // Delay based on speed
    delays.push(randomDelay(80, 20) * (1.5 - speeds[i]));
  }
  
  return { delays, amounts };
}

// Export sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

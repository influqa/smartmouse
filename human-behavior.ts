/**
 * Human Behavior Simulation for SmartMouse
 * Provides realistic mouse movements, typing patterns, and scrolling behavior
 * for natural interaction patterns
 *
 * Features:
 * - Bezier curve-based mouse paths
 * - Micro-jitter simulation
 * - Natural acceleration/deceleration
 * - Variable speed profiles
 * - Gaussian-distributed delays
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
export interface Point {
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

// Configuration for human-like movement generation
export interface HumanMovementConfig {
  useBezier: boolean;
  addJitter: boolean;
  jitterAmplitude: number;
  variableSpeed: boolean;
  baseDelay: number;
  acceleration: boolean;
}

// Generate human-like mouse path with jitter, acceleration, and variable speed
export function generateHumanPath(
  start: Point,
  end: Point,
  config: HumanMovementConfig
): { points: Point[]; delays: number[] } {
  const points: Point[] = [];
  const delays: number[] = [];

  // Generate base path using Bezier curves
  const basePath = config.useBezier ? generateBezierPath(start, end) : generateLinearPath(start, end);

  // Calculate distance for speed profiling
  const totalDistance = calculatePathLength(basePath);
  const numSteps = basePath.length;

  // Generate speed profile (acceleration/deceleration)
  const speeds = generateSpeedProfile(numSteps, totalDistance, config);

  for (let i = 0; i < basePath.length; i++) {
    let point = { ...basePath[i] };

    // Add micro-jitter for natural hand tremor effect
    if (config.addJitter) {
      point = {
        x: point.x + (Math.random() - 0.5) * 2 * config.jitterAmplitude,
        y: point.y + (Math.random() - 0.5) * 2 * config.jitterAmplitude
      };
    }

    points.push(point);

    // Calculate delay based on speed profile
    const baseDelay = config.baseDelay;
    let delay = baseDelay;

    if (config.variableSpeed && speeds[i] !== undefined) {
      // Slower at start and end (acceleration/deceleration)
      const speedFactor = speeds[i];
      delay = baseDelay / speedFactor;
    }

    // Add natural variation to delay
    delay = randomDelay(delay, delay * 0.2);

    delays.push(Math.round(delay));
  }

  return { points, delays };
}

// Generate linear path (fallback when Bezier is disabled)
function generateLinearPath(start: Point, end: Point): Point[] {
  const points: Point[] = [];
  const steps = randomBetween(20, 40);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t
    });
  }

  return points;
}

// Calculate total path length
function calculatePathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

// Generate speed profile with natural acceleration/deceleration
function generateSpeedProfile(numSteps: number, totalDistance: number, config: HumanMovementConfig): number[] {
  const speeds: number[] = [];

  if (!config.acceleration && !config.variableSpeed) {
    // Constant speed
    return Array(numSteps).fill(1);
  }

  // Calculate acceleration phases
  const accelPhase = Math.floor(numSteps * 0.2); // First 20% for acceleration
  const decelPhase = Math.floor(numSteps * 0.2); // Last 20% for deceleration
  const cruisePhase = numSteps - accelPhase - decelPhase;

  // Speed profile: slow start, fast middle, slow end
  const maxSpeed = 2.5; // Peak speed multiplier
  const minSpeed = 0.3; // Starting/ending speed

  for (let i = 0; i < numSteps; i++) {
    let speed: number;

    if (i < accelPhase) {
      // Acceleration phase: ease-in
      const t = i / accelPhase;
      speed = minSpeed + (maxSpeed - minSpeed) * easeInOut(t);
    } else if (i < accelPhase + cruisePhase) {
      // Cruise phase: near max speed with slight variation
      const cruiseT = (i - accelPhase) / cruisePhase;
      // Add slight sine wave for natural variation
      speed = maxSpeed * (0.9 + 0.1 * Math.sin(cruiseT * Math.PI * 4));
    } else {
      // Deceleration phase: ease-out
      const t = (i - accelPhase - cruisePhase) / decelPhase;
      speed = maxSpeed - (maxSpeed - minSpeed) * easeInOut(t);
    }

    speeds.push(Math.max(0.2, speed));
  }

  return speeds;
}

// Ease-in-out function for smooth acceleration/deceleration
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Export sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

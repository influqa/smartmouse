/**
 * Human Behavior Simulation for SmartMouse Playwright Integration
 * Provides realistic mouse movements, typing patterns, and scrolling behavior
 * to avoid detection by advanced bot detection systems
 */

import { Page } from 'playwright-core';

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

// Extend Window interface for mouse tracking
declare global {
  interface Window {
    lastMouseX?: number;
    lastMouseY?: number;
  }
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

// Human-like mouse movement
export async function humanLikeMouseMove(
  page: Page,
  targetX: number,
  targetY: number,
  options: {
    speed?: 'slow' | 'normal' | 'fast';
    randomness?: number;
  } = {}
): Promise<void> {
  const { speed = 'normal', randomness = 0.5 } = options;

  // Get current mouse position
  const currentPos = await page.evaluate(() => {
    // Try to get last known position or default to center
    return {
      x: window.lastMouseX || window.innerWidth / 2,
      y: window.lastMouseY || window.innerHeight / 2
    };
  });

  // Generate path
  const path = generateBezierPath(currentPos, { x: targetX, y: targetY });

  // Speed settings
  const speedSettings = {
    slow: { baseDelay: 15, variance: 10 },
    normal: { baseDelay: 8, variance: 5 },
    fast: { baseDelay: 4, variance: 3 }
  };

  const settings = speedSettings[speed];

  // Move along path with variable speed
  for (let i = 0; i < path.length; i++) {
    const point = path[i];

    // Add slight randomness to position
    const jitterX = (Math.random() - 0.5) * randomness * 2;
    const jitterY = (Math.random() - 0.5) * randomness * 2;

    await page.mouse.move(point.x + jitterX, point.y + jitterY);

    // Variable delay between movements
    const delay = randomBetween(
      settings.baseDelay - settings.variance,
      settings.baseDelay + settings.variance
    );
    await page.waitForTimeout(delay);

    // Occasionally pause (simulating hesitation)
    if (Math.random() < 0.02) {
      await page.waitForTimeout(randomBetween(50, 150));
    }
  }

  // Update last known position
  await page.evaluate(([x, y]: [number, number]) => {
    window.lastMouseX = x;
    window.lastMouseY = y;
  }, [targetX, targetY] as [number, number]);
}

// Human-like typing with variable delays
export async function humanLikeType(
  page: Page,
  selector: string,
  text: string,
  options: {
    wpm?: number; // Words per minute (affects typing speed)
    mistakeRate?: number; // Chance of making a typo
    correctionDelay?: number; // Delay before correcting mistakes
  } = {}
): Promise<void> {
  const {
    wpm = 60,
    mistakeRate = 0.02,
    correctionDelay = 300
  } = options;

  // Calculate base delay from WPM (average word is 5 characters)
  const baseDelay = (60000 / wpm) / 5;

  // Focus the element first
  await page.focus(selector);
  await page.waitForTimeout(randomBetween(100, 300));

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    // Occasionally make a typo
    if (Math.random() < mistakeRate && i > 0) {
      // Type a random wrong character
      const wrongChars = 'abcdefghijklmnopqrstuvwxyz';
      const wrongChar = wrongChars[Math.floor(Math.random() * wrongChars.length)];
      await page.keyboard.type(wrongChar, { delay: randomBetween(50, 150) });

      // Pause (realizing the mistake)
      await page.waitForTimeout(correctionDelay + randomBetween(-100, 100));

      // Backspace to delete
      await page.keyboard.press('Backspace', { delay: randomBetween(50, 100) });

      // Small pause before continuing
      await page.waitForTimeout(randomBetween(50, 150));
    }

    // Type the correct character
    const delay = randomDelay(baseDelay, baseDelay * 0.3);
    await page.keyboard.type(char, { delay: Math.max(20, delay) });

    // Occasionally pause (thinking)
    if (Math.random() < 0.03) {
      await page.waitForTimeout(randomBetween(200, 800));
    }

    // Pause longer at punctuation
    if ('.!?'.includes(char)) {
      await page.waitForTimeout(randomBetween(300, 600));
    } else if (',;'.includes(char)) {
      await page.waitForTimeout(randomBetween(150, 300));
    }

    i++;
  }

  // Final pause after typing
  await page.waitForTimeout(randomBetween(200, 500));
}

// Human-like scrolling
export async function humanLikeScroll(
  page: Page,
  direction: 'up' | 'down',
  amount: number,
  options: {
    speed?: 'slow' | 'normal' | 'fast';
    readPauseChance?: number; // Chance to pause while "reading"
  } = {}
): Promise<void> {
  const { speed = 'normal', readPauseChance = 0.15 } = options;

  const speedSettings = {
    slow: { scrollAmount: 100, delay: 80 },
    normal: { scrollAmount: 200, delay: 50 },
    fast: { scrollAmount: 400, delay: 30 }
  };

  const settings = speedSettings[speed];
  const delta = direction === 'up' ? -settings.scrollAmount : settings.scrollAmount;
  const steps = Math.ceil(amount / settings.scrollAmount);

  for (let i = 0; i < steps; i++) {
    // Scroll
    await page.mouse.wheel(0, delta);

    // Variable delay
    const delay = randomBetween(
      settings.delay - 20,
      settings.delay + 30
    );
    await page.waitForTimeout(delay);

    // Occasionally pause while "reading"
    if (Math.random() < readPauseChance) {
      const readTime = randomBetween(800, 2500);
      await page.waitForTimeout(readTime);

      // Sometimes scroll back up a bit (re-reading)
      if (Math.random() < 0.3) {
        await page.mouse.wheel(0, -delta * 0.3);
        await page.waitForTimeout(randomBetween(300, 600));
      }
    }
  }
}

// Human-like click with pre-click movement
export async function humanLikeClick(
  page: Page,
  selector: string,
  options: {
    hoverTime?: number; // Time to hover before clicking
    clickDelay?: number; // Delay between mouse down and up
  } = {}
): Promise<void> {
  const { hoverTime = randomBetween(200, 800), clickDelay = randomBetween(50, 150) } = options;

  // Get element position
  const element = await page.locator(selector).first();
  const box = await element.boundingBox();

  if (!box) {
    throw new Error(`Element not found: ${selector}`);
  }

  // Calculate click position (slightly random within element)
  const clickX = box.x + box.width * (0.3 + Math.random() * 0.4);
  const clickY = box.y + box.height * (0.3 + Math.random() * 0.4);

  // Move to element with human-like path
  await humanLikeMouseMove(page, clickX, clickY, { speed: 'normal' });

  // Hover
  await page.waitForTimeout(hoverTime);

  // Click with realistic timing
  await page.mouse.down();
  await page.waitForTimeout(clickDelay);
  await page.mouse.up();

  // Post-click delay
  await page.waitForTimeout(randomBetween(100, 300));
}

// Simulate human reading behavior
export async function simulateReading(
  page: Page,
  duration: number = randomBetween(3000, 8000)
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < duration) {
    // Small scroll
    const scrollAmount = randomBetween(50, 150);
    await page.mouse.wheel(0, scrollAmount);

    // Reading pause
    const readTime = randomBetween(500, 1500);
    await page.waitForTimeout(readTime);

    // Occasionally scroll back up
    if (Math.random() < 0.2) {
      await page.mouse.wheel(0, -scrollAmount * 0.5);
      await page.waitForTimeout(randomBetween(300, 600));
    }
  }
}

// Add random "thinking" pauses
export async function thinkingPause(
  page: Page,
  minMs: number = 500,
  maxMs: number = 2000
): Promise<void> {
  const duration = randomBetween(minMs, maxMs);

  // Occasionally move mouse slightly (thinking gesture)
  if (Math.random() < 0.3) {
    const currentPos = await page.evaluate(() => ({
      x: window.lastMouseX || window.innerWidth / 2,
      y: window.lastMouseY || window.innerHeight / 2
    }));

    const offsetX = randomBetween(-30, 30);
    const offsetY = randomBetween(-30, 30);

    await humanLikeMouseMove(
      page,
      currentPos.x + offsetX,
      currentPos.y + offsetY,
      { speed: 'slow' }
    );
  }

  await page.waitForTimeout(duration);
}

// Complete human-like interaction sequence
export async function humanLikeInteraction(
  page: Page,
  actions: Array<{
    type: 'click' | 'type' | 'scroll' | 'wait' | 'read';
    selector?: string;
    text?: string;
    direction?: 'up' | 'down';
    amount?: number;
    duration?: number;
  }>
): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case 'click':
        if (action.selector) {
          await humanLikeClick(page, action.selector);
        }
        break;

      case 'type':
        if (action.selector && action.text) {
          await humanLikeType(page, action.selector, action.text);
        }
        break;

      case 'scroll':
        if (action.direction && action.amount) {
          await humanLikeScroll(page, action.direction, action.amount);
        }
        break;

      case 'read':
        await simulateReading(page, action.duration);
        break;

      case 'wait':
        await page.waitForTimeout(action.duration || 1000);
        break;
    }

    // Random pause between actions
    if (Math.random() < 0.4) {
      await thinkingPause(page, 200, 800);
    }
  }
}

// Export sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

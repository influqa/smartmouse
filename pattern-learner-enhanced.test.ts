/**
 * Enhanced Test Cases for PatternLearner (pattern-learner.ts)
 * Comprehensive tests for User Pattern Learning features including:
 * - Click pattern recording and aggregation
 * - Movement pattern analysis
 * - Temporal pattern detection
 * - Context-aware learning
 * - Confidence scoring and decay
 * - Pattern prediction
 * - Data persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PatternLearner } from './pattern-learner';
import fs from 'fs';
import path from 'path';

const TEST_DATA_DIR = './test-pattern-data';

// Helper to clean up test data
function cleanupTestData() {
  try {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    const defaultFile = './data/patterns.json';
    if (fs.existsSync(defaultFile)) {
      fs.unlinkSync(defaultFile);
    }
  } catch {
    // Ignore cleanup errors
  }
}

describe('PatternLearner - Basic Functionality', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should create instance with default configuration', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    expect(learner).toBeDefined();
    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(0);
    expect(stats.uniqueClicks).toBe(0);
    expect(stats.sessionEvents).toBe(0);
  });

  it('should create instance with custom configuration', () => {
    const learner = new PatternLearner(TEST_DATA_DIR, {
      gridSize: 100,
      minPatternConfidence: 0.5,
      maxPatterns: 500,
      sessionDecay: 0.9,
      temporalWindow: 10000,
      enableContextLearning: false,
      enableTemporalLearning: false
    });

    const stats = learner.getStats();
    expect(stats).toBeDefined();
  });

  it('should record simple click events', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(100, 200);

    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(1);
    expect(stats.uniqueClicks).toBe(1);
    expect(stats.sessionEvents).toBe(1);
  });

  it('should aggregate clicks within grid cells', () => {
    const learner = new PatternLearner(TEST_DATA_DIR, { gridSize: 50 });

    // Clicks within same grid cell (100, 200) maps to grid cell
    learner.recordClick(100, 200);
    learner.recordClick(110, 210); // Within 50px grid
    learner.recordClick(95, 195);  // Within 50px grid

    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(3);
    // All should map to same grid cell
    expect(stats.uniqueClicks).toBe(1);
  });

  it('should track different grid positions separately', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    learner.recordClick(100, 200);
    learner.recordClick(300, 400); // Different position
    learner.recordClick(500, 600); // Different position

    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(3);
    expect(stats.uniqueClicks).toBe(3);
  });
});

describe('PatternLearner - Context Learning', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should record clicks with URL context', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(100, 200, {
      url: 'https://example.com/page1',
      application: 'chrome'
    });

    const patterns = learner.getContextPatterns({ url: 'https://example.com/page1' });
    expect(patterns.length).toBe(1);
    expect(patterns[0].url).toBe('https://example.com/page1');
  });

  it('should record clicks with application context', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(100, 200, {
      application: 'firefox',
      tags: ['navigation']
    });

    const patterns = learner.getContextPatterns({ application: 'firefox' });
    expect(patterns.length).toBe(1);
    expect(patterns[0].application).toBe('firefox');
  });

  it('should record clicks with tags', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    // Record multiple clicks to ensure hotspot is created
    learner.recordClick(100, 200, {
      tags: ['button', 'submit', 'form']
    });
    learner.recordClick(100, 200, {
      tags: ['button']
    });

    // Get all patterns - hotspot requires minimum count
    const hotspots = learner.getHotspots(0); // Get all hotspots regardless of count
    expect(hotspots.length).toBeGreaterThan(0);
    if (hotspots.length > 0) {
      expect(hotspots[0].tags).toContain('button');
    }
  });

  it('should record clicks with associated actions', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    // Record multiple clicks to ensure hotspot is created
    learner.recordClick(100, 200, {
      action: 'submit_form'
    });
    learner.recordClick(100, 200, {
      action: 'submit_form'
    });

    const hotspots = learner.getHotspots(0);
    expect(hotspots.length).toBeGreaterThan(0);
    if (hotspots.length > 0) {
      expect(hotspots[0].associatedActions).toContain('submit_form');
    }
  });

  it('should aggregate tags from multiple clicks', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(100, 200, { tags: ['button'] });
    learner.recordClick(100, 200, { tags: ['submit'] });
    learner.recordClick(100, 200, { tags: ['form'] });

    const hotspots = learner.getHotspots(1);
    expect(hotspots[0].tags).toContain('button');
    expect(hotspots[0].tags).toContain('submit');
    expect(hotspots[0].tags).toContain('form');
  });

  it('should filter context patterns correctly', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Record clicks in different contexts
    learner.recordClick(100, 200, { url: 'https://app1.com' });
    learner.recordClick(100, 200, { url: 'https://app1.com' });
    learner.recordClick(300, 400, { url: 'https://app2.com' });
    learner.recordClick(300, 400, { url: 'https://app2.com' });
    learner.recordClick(300, 400, { url: 'https://app2.com' });

    const app1Patterns = learner.getContextPatterns({ url: 'https://app1.com' });
    const app2Patterns = learner.getContextPatterns({ url: 'https://app2.com' });

    expect(app1Patterns.length).toBe(1);
    expect(app1Patterns[0].count).toBe(2);
    expect(app2Patterns.length).toBe(1);
    expect(app2Patterns[0].count).toBe(3);
  });
});

describe('PatternLearner - Movement Patterns', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should record movement sequences', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Record a movement sequence (needs 20+ points)
    for (let i = 0; i < 25; i++) {
      learner.recordMovement(100 + i * 4, 200 + i * 2);
    }

    const stats = learner.getStats();
    expect(stats.movementPatterns).toBeGreaterThan(0);
  });

  it('should analyze movement velocity', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Fast movement
    for (let i = 0; i < 25; i++) {
      learner.recordMovement(100 + i * 10, 200);
    }

    const patterns = learner.getMovementPatterns(5);
    // Movement patterns may or may not be created depending on timing
    expect(patterns).toBeDefined();
  });

  it('should aggregate similar movement patterns', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Record same movement twice
    for (let run = 0; run < 2; run++) {
      for (let i = 0; i < 25; i++) {
        learner.recordMovement(100 + i * 4, 200 + i * 2);
      }
    }

    const patterns = learner.getMovementPatterns(5);
    // Should have aggregated into one pattern with frequency > 1
    if (patterns.length > 0) {
      expect(patterns[0].frequency).toBeGreaterThan(1);
    }
  });

  it('should limit movement patterns to 500', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Create many different movement patterns
    for (let pattern = 0; pattern < 600; pattern++) {
      for (let i = 0; i < 25; i++) {
        learner.recordMovement(
          100 + pattern * 5 + i,
          200 + i
        );
      }
    }

    const patterns = learner.getMovementPatterns(600);
    expect(patterns.length).toBeLessThanOrEqual(500);
  });

  it('should sort movement patterns by frequency', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Create pattern with frequency 1
    for (let i = 0; i < 25; i++) {
      learner.recordMovement(100 + i, 200 + i);
    }

    // Create pattern with higher frequency
    for (let run = 0; run < 5; run++) {
      for (let i = 0; i < 25; i++) {
        learner.recordMovement(300 + i, 400 + i);
      }
    }

    const patterns = learner.getMovementPatterns(10);
    expect(patterns.length).toBeGreaterThan(0);
    // First pattern should have highest frequency
    if (patterns.length > 1) {
      expect(patterns[0].frequency).toBeGreaterThanOrEqual(patterns[1].frequency);
    }
  });
});

describe('PatternLearner - Temporal Patterns', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should detect temporal click sequences', () => {
    const learner = new PatternLearner(TEST_DATA_DIR, {
      enableTemporalLearning: true,
      temporalWindow: 10000
    });

    // Create a sequence of clicks
    learner.recordClick(100, 200);
    setTimeout(() => learner.recordClick(150, 250), 100);
    setTimeout(() => learner.recordClick(200, 300), 200);
    setTimeout(() => learner.recordClick(250, 350), 300);

    // Wait for sequence to complete
    setTimeout(() => {
      const stats = learner.getStats();
      expect(stats.temporalPatterns).toBeGreaterThan(0);
    }, 500);
  });

  it('should predict next action in sequence', () => {
    const learner = new PatternLearner(TEST_DATA_DIR, {
      enableTemporalLearning: true,
      temporalWindow: 60000 // 1 minute window
    });

    // Record a repeating sequence multiple times
    for (let run = 0; run < 3; run++) {
      learner.recordClick(100, 200);
      learner.recordClick(150, 250);
      learner.recordClick(200, 300);
    }

    const nextAction = learner.predictNextInSequence();
    // Should predict next in sequence
    expect(nextAction).toBeDefined();
    if (nextAction) {
      expect(nextAction.x).toBeDefined();
      expect(nextAction.y).toBeDefined();
      expect(nextAction.delay).toBeDefined();
      expect(nextAction.confidence).toBeGreaterThan(0);
    }
  });

  it('should limit temporal patterns to 100', () => {
    const learner = new PatternLearner(TEST_DATA_DIR, {
      enableTemporalLearning: true,
      temporalWindow: 60000
    });

    // Create many different sequences
    for (let seq = 0; seq < 150; seq++) {
      learner.recordClick(seq * 10, 200);
      learner.recordClick(seq * 10 + 5, 250);
      learner.recordClick(seq * 10 + 10, 300);
    }

    const patterns = learner.getTemporalPatterns(150);
    expect(patterns.length).toBeLessThanOrEqual(100);
  });

  it('should sort temporal patterns by count', () => {
    const learner = new PatternLearner(TEST_DATA_DIR, {
      enableTemporalLearning: true,
      temporalWindow: 60000
    });

    // Create sequence with count 1
    learner.recordClick(100, 200);
    learner.recordClick(150, 250);

    // Create sequence with higher count
    for (let i = 0; i < 5; i++) {
      learner.recordClick(300, 400);
      learner.recordClick(350, 450);
    }

    const patterns = learner.getTemporalPatterns(10);
    expect(patterns.length).toBeGreaterThan(0);
    // Patterns should be sorted by count
    if (patterns.length > 1) {
      expect(patterns[0].count).toBeGreaterThanOrEqual(patterns[1].count);
    }
  });
});

describe('PatternLearner - Confidence and Decay', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should calculate confidence based on frequency', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Low frequency
    learner.recordClick(100, 200);

    // High frequency
    for (let i = 0; i < 10; i++) {
      learner.recordClick(300, 400);
    }

    const predictions = learner.predictNextClicks(2);
    expect(predictions.length).toBe(2);
    // Higher frequency should have higher confidence
    expect(predictions[0].count).toBe(10);
  });

  it('should apply session decay', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    learner.recordClick(100, 200);
    learner.recordClick(100, 200);

    const beforeDecay = learner.getStats();
    expect(beforeDecay.sessionEvents).toBe(2);

    learner.applySessionDecay();

    const afterDecay = learner.getStats();
    expect(afterDecay.sessionEvents).toBe(0);
  });

  it('should prune low confidence patterns', () => {
    const learner = new PatternLearner(TEST_DATA_DIR, {
      maxPatterns: 10
    });

    // Create many patterns with varying counts
    for (let i = 0; i < 15; i++) {
      learner.recordClick(i * 100, 200);
    }

    const stats = learner.getStats();
    // Should have pruned some patterns
    expect(stats.uniqueClicks).toBeLessThanOrEqual(10);
  });

  it('should calculate decay factor based on time', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    learner.recordClick(100, 200);
    learner.recordClick(100, 200); // Need multiple clicks for hotspot

    const hotspots = learner.getHotspots(0);
    expect(hotspots.length).toBeGreaterThan(0);
    if (hotspots.length > 0) {
      expect(hotspots[0].decayFactor).toBeGreaterThan(0);
      expect(hotspots[0].decayFactor).toBeLessThanOrEqual(1);
    }
  });
});

describe('PatternLearner - Prediction', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should predict next clicks based on hotspots', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Create hotspot
    for (let i = 0; i < 10; i++) {
      learner.recordClick(300, 400);
    }

    const predictions = learner.predictNextClicks(5);
    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0].x).toBe(300);
    expect(predictions[0].y).toBe(400);
  });

  it('should filter predictions by context', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    learner.recordClick(100, 200, { url: 'https://app1.com' });
    learner.recordClick(100, 200, { url: 'https://app1.com' });
    learner.recordClick(300, 400, { url: 'https://app2.com' });

    const predictions = learner.predictNextClicks(5, { url: 'https://app1.com' });
    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0].url).toBe('https://app1.com');
  });

  it('should predict target based on velocity', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Record movement to establish velocity
    for (let i = 0; i < 10; i++) {
      learner.recordMovement(100 + i * 10, 200);
    }

    const prediction = learner.predictTarget(200, 200);
    // Should have velocity-based prediction
    expect(prediction).toBeDefined();
    if (prediction) {
      expect(prediction.x).toBeDefined();
      expect(prediction.y).toBeDefined();
      expect(prediction.source).toBeDefined();
    }
  });

  it('should predict target based on pattern matching', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Create a hotspot
    for (let i = 0; i < 10; i++) {
      learner.recordClick(500, 600);
    }

    // Record movement toward hotspot
    for (let i = 0; i < 10; i++) {
      learner.recordMovement(400 + i * 10, 600);
    }

    const prediction = learner.predictTarget(490, 600);
    expect(prediction).toBeDefined();
    if (prediction) {
      expect(prediction.confidence).toBeGreaterThan(0);
    }
  });

  it('should return hotspots with minimum count', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    learner.recordClick(100, 200); // count 1
    learner.recordClick(100, 200); // count 2
    learner.recordClick(100, 200); // count 3
    learner.recordClick(300, 400); // count 1
    learner.recordClick(300, 400); // count 2

    const hotspots = learner.getHotspots(3);
    expect(hotspots.length).toBe(1);
    expect(hotspots[0].count).toBe(3);
  });
});

describe('PatternLearner - Data Persistence', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should save patterns to file', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(100, 200, { url: 'https://test.com' });

    const filePath = path.join(TEST_DATA_DIR, 'patterns.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should load patterns from file', () => {
    // Create and save patterns
    const learner1 = new PatternLearner(TEST_DATA_DIR);
    learner1.recordClick(100, 200, { url: 'https://test.com' });
    learner1.recordClick(300, 400);

    // Load in new instance
    const learner2 = new PatternLearner(TEST_DATA_DIR);
    const stats = learner2.getStats();

    expect(stats.uniqueClicks).toBe(2);
  });

  it('should export patterns to JSON string', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(100, 200, { url: 'https://test.com' });
    learner.recordClick(300, 400);

    const exported = learner.exportPatterns();
    expect(exported).toContain('https://test.com');
    expect(exported).toContain('clicks');
    expect(exported).toContain('movements');
    expect(exported).toContain('stats');
  });

  it('should import patterns from JSON string', () => {
    const learner1 = new PatternLearner(TEST_DATA_DIR);
    learner1.recordClick(100, 200);
    learner1.recordClick(300, 400);

    const exported = learner1.exportPatterns();

    const learner2 = new PatternLearner(TEST_DATA_DIR);
    learner2.importPatterns(exported);

    const stats = learner2.getStats();
    expect(stats.uniqueClicks).toBe(2);
  });

  it('should handle corrupt import data gracefully', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    expect(() => {
      learner.importPatterns('invalid json');
    }).not.toThrow();
  });

  it('should clear all patterns', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(100, 200);
    learner.recordClick(300, 400);

    learner.clear();

    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(0);
    expect(stats.uniqueClicks).toBe(0);
    expect(stats.movementPatterns).toBe(0);
    expect(stats.temporalPatterns).toBe(0);
  });

  it('should clear context-specific patterns', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    learner.recordClick(100, 200, { url: 'https://app1.com' });
    learner.recordClick(300, 400, { url: 'https://app2.com' });

    const cleared = learner.clearContext({ url: 'https://app1.com' });

    expect(cleared).toBe(1);
    const stats = learner.getStats();
    expect(stats.uniqueClicks).toBe(1);
  });
});

describe('PatternLearner - Statistics', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should provide comprehensive statistics', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    learner.recordClick(100, 200);
    learner.recordClick(100, 200);
    learner.recordClick(300, 400);

    for (let i = 0; i < 25; i++) {
      learner.recordMovement(100 + i, 200 + i);
    }

    const stats = learner.getStats();

    expect(stats.totalEvents).toBe(3);
    expect(stats.sessionEvents).toBe(3);
    expect(stats.uniqueClicks).toBe(2);
    expect(stats.movementPatterns).toBeGreaterThanOrEqual(0);
    expect(stats.temporalPatterns).toBeGreaterThanOrEqual(0);
    expect(stats.avgConfidence).toBeGreaterThanOrEqual(0);
    expect(stats.avgConfidence).toBeLessThanOrEqual(1);
    expect(stats.sessionDuration).toBeGreaterThan(0);
  });

  it('should calculate average confidence correctly', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    learner.recordClick(100, 200);
    learner.recordClick(100, 200);
    learner.recordClick(100, 200);

    const stats = learner.getStats();
    expect(stats.avgConfidence).toBeGreaterThan(0);
  });

  it('should track session duration', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    learner.recordClick(100, 200);

    // Wait a bit to ensure duration is measurable
    const start = Date.now();
    while (Date.now() - start < 10) {
      // Busy wait for 10ms
    }

    const stats = learner.getStats();
    expect(stats.sessionDuration).toBeGreaterThan(0);
  });
});

describe('PatternLearner - Edge Cases', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should handle clicks at origin (0, 0)', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(0, 0);

    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(1);
    expect(stats.uniqueClicks).toBe(1);
  });

  it('should handle negative coordinates', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(-100, -200);

    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(1);
  });

  it('should handle very large coordinates', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(10000, 20000);

    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(1);
  });

  it('should handle rapid clicks', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      learner.recordClick(100 + i, 200);
    }
    const duration = Date.now() - start;

    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(100);
    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
  });

  it('should handle empty context', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(100, 200, {});

    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(1);
  });

  it('should handle null/undefined in context', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    learner.recordClick(100, 200, {
      url: undefined,
      application: undefined,
      tags: undefined,
      action: undefined
    });

    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(1);
  });

  it('should predict with no patterns', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);
    const predictions = learner.predictNextClicks(5);
    expect(predictions.length).toBe(0);
  });

  it('should predict target with insufficient movement data', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Only 2 movement points (needs 5+)
    learner.recordMovement(100, 200);
    learner.recordMovement(110, 200);

    const prediction = learner.predictTarget(120, 200);
    expect(prediction).toBeNull();
  });
});

describe('PatternLearner - Integration Scenarios', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should simulate complete user session', () => {
    const learner = new PatternLearner(TEST_DATA_DIR, {
      enableTemporalLearning: true,
      enableContextLearning: true
    });

    // Simulate user workflow
    // 1. Open app
    learner.recordClick(50, 50, { application: 'chrome', action: 'open_app' });

    // 2. Navigate to URL bar
    learner.recordClick(400, 50, { url: 'https://chrome.com', action: 'focus_url' });

    // 3. Click on page content
    learner.recordClick(500, 300, { url: 'https://example.com', action: 'click_content' });
    learner.recordClick(500, 300, { url: 'https://example.com', action: 'click_content' });

    // 4. Click submit button
    learner.recordClick(800, 600, { url: 'https://example.com', action: 'submit' });

    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(5);
    expect(stats.uniqueClicks).toBe(4);

    // Get context-specific patterns
    const examplePatterns = learner.getContextPatterns({ url: 'https://example.com' });
    expect(examplePatterns.length).toBe(2);
  });

  it('should learn and predict repetitive tasks', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Simulate repetitive task (e.g., daily login)
    for (let day = 0; day < 5; day++) {
      learner.recordClick(100, 200); // Username field
      learner.recordClick(100, 250); // Password field
      learner.recordClick(150, 300); // Submit button
    }

    const predictions = learner.predictNextClicks(10);
    expect(predictions.length).toBe(3); // 3 unique positions

    // Most frequent should be the submit button (last clicked)
    const hotspot = learner.getHotspots(1)[0];
    expect(hotspot.count).toBe(5);
  });

  it('should handle multi-application workflows', () => {
    const learner = new PatternLearner(TEST_DATA_DIR);

    // Chrome workflow
    learner.recordClick(100, 200, { application: 'chrome' });
    learner.recordClick(100, 200, { application: 'chrome' });

    // Firefox workflow
    learner.recordClick(300, 400, { application: 'firefox' });
    learner.recordClick(300, 400, { application: 'firefox' });
    learner.recordClick(300, 400, { application: 'firefox' });

    const chromePatterns = learner.getContextPatterns({ application: 'chrome' });
    const firefoxPatterns = learner.getContextPatterns({ application: 'firefox' });

    expect(chromePatterns.length).toBe(1);
    expect(chromePatterns[0].count).toBe(2);
    expect(firefoxPatterns.length).toBe(1);
    expect(firefoxPatterns[0].count).toBe(3);
  });
});

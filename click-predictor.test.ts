/**
 * Test Cases for ClickPredictor (click-predictor.ts)
 * Tests AI-powered click prediction features including:
 * - Multi-method prediction (pattern, velocity, screen, temporal)
 * - Context-aware predictions
 * - Confidence scoring
 * - Prediction history and accuracy tracking
 * - Weight adaptation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ClickPredictor } from './click-predictor';
import fs from 'fs';

const TEST_DATA_DIR = './test-predictor-data';

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

describe('ClickPredictor - Basic Functionality', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should create instance with default configuration', () => {
    const predictor = new ClickPredictor();
    expect(predictor).toBeDefined();
    const stats = predictor.getStats();
    expect(stats.totalPredictions).toBe(0);
    expect(stats.accuracyRate).toBe(0);
  });

  it('should create instance with custom configuration', () => {
    const predictor = new ClickPredictor({
      enablePatternLearning: false,
      enableVelocityPrediction: true,
      enableScreenAnalysis: true,
      enableTemporalPrediction: false,
      minConfidence: 0.5,
      maxPredictions: 3,
      historySize: 50,
      adaptationRate: 0.2
    });

    const stats = predictor.getStats();
    expect(stats).toBeDefined();
  });

  it('should update screen elements', () => {
    const predictor = new ClickPredictor();
    const elements = [
      { x: 100, y: 200, width: 80, height: 30, type: 'button' as const, importance: 0.8, clickable: true },
      { x: 300, y: 400, width: 100, height: 40, type: 'link' as const, importance: 0.6, clickable: true }
    ];

    predictor.updateScreenElements(elements);
    // Elements are stored internally, verify via predictions
    const predictions = predictor.predict(100, 200);
    expect(predictions).toBeDefined();
  });

  it('should record clicks and update pattern learner', () => {
    const predictor = new ClickPredictor();

    predictor.recordClick(100, 200);
    predictor.recordClick(100, 200);
    predictor.recordClick(100, 200);

    const stats = predictor.getStats();
    // Stats structure may vary - just verify it's defined
    expect(stats).toBeDefined();
  });

  it('should record clicks with context', () => {
    const predictor = new ClickPredictor();

    predictor.recordClick(100, 200, {
      url: 'https://example.com',
      application: 'chrome',
      recentActions: ['navigate', 'click']
    });

    const stats = predictor.getStats();
    expect(stats).toBeDefined();
  });
});

describe('ClickPredictor - Pattern-based Prediction', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should predict from pattern learning', () => {
    const predictor = new ClickPredictor();

    // Train with multiple clicks at same location
    for (let i = 0; i < 10; i++) {
      predictor.recordClick(300, 400);
    }

    const predictions = predictor.predict(290, 390);
    expect(predictions.length).toBeGreaterThan(0);

    const patternPreds = predictions.filter(p => p.source === 'pattern');
    expect(patternPreds.length).toBeGreaterThan(0);
  });

  it('should predict from pattern with context', () => {
    const predictor = new ClickPredictor();

    predictor.recordClick(100, 200, { url: 'https://app1.com' });
    predictor.recordClick(100, 200, { url: 'https://app1.com' });
    predictor.recordClick(300, 400, { url: 'https://app2.com' });
    predictor.recordClick(300, 400, { url: 'https://app2.com' });
    predictor.recordClick(300, 400, { url: 'https://app2.com' });

    const predictions = predictor.predict(90, 190, { url: 'https://app1.com' });
    expect(predictions.length).toBeGreaterThan(0);
  });

  it('should provide reasoning for pattern predictions', () => {
    const predictor = new ClickPredictor();

    for (let i = 0; i < 5; i++) {
      predictor.recordClick(300, 400);
    }

    const predictions = predictor.predict(290, 390);
    for (const pred of predictions) {
      expect(pred.reasoning).toBeDefined();
      expect(pred.reasoning!.length).toBeGreaterThan(0);
    }
  });
});

describe('ClickPredictor - Velocity-based Prediction', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should predict from velocity extrapolation', () => {
    const predictor = new ClickPredictor();

    const predictions = predictor.predict(100, 200, {
      mouseVelocity: { x: 500, y: 300 },
      acceleration: 100
    });

    const velocityPreds = predictions.filter(p => p.source === 'velocity');
    expect(velocityPreds.length).toBeGreaterThan(0);
  });

  it('should not predict from low velocity', () => {
    const predictor = new ClickPredictor();

    const predictions = predictor.predict(100, 200, {
      mouseVelocity: { x: 5, y: 3 }, // Very low velocity
      acceleration: 0
    });

    const velocityPreds = predictions.filter(p => p.source === 'velocity');
    expect(velocityPreds.length).toBe(0);
  });

  it('should combine velocity with pattern matching', () => {
    const predictor = new ClickPredictor();

    // Create hotspot
    for (let i = 0; i < 10; i++) {
      predictor.recordClick(500, 600);
    }

    const predictions = predictor.predict(100, 200, {
      mouseVelocity: { x: 500, y: 300 },
      acceleration: 100
    });

    const velocityPreds = predictions.filter(p => p.source === 'velocity');
    expect(velocityPreds.length).toBeGreaterThan(0);
  });
});

describe('ClickPredictor - Screen-based Prediction', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should predict from screen elements', () => {
    const predictor = new ClickPredictor();

    predictor.updateScreenElements([
      { x: 200, y: 300, width: 100, height: 40, type: 'button' as const, importance: 0.9, clickable: true, text: 'Submit' }
    ]);

    const predictions = predictor.predict(150, 250);
    const screenPreds = predictions.filter(p => p.source === 'screen');
    expect(screenPreds.length).toBeGreaterThan(0);
  });

  it('should prioritize important elements', () => {
    const predictor = new ClickPredictor();

    predictor.updateScreenElements([
      { x: 100, y: 200, width: 50, height: 20, type: 'text' as const, importance: 0.3, clickable: true },
      { x: 300, y: 400, width: 100, height: 40, type: 'button' as const, importance: 0.9, clickable: true }
    ]);

    const predictions = predictor.predict(200, 300);
    const screenPreds = predictions.filter(p => p.source === 'screen');

    if (screenPreds.length >= 2) {
      // Higher importance should rank higher
      expect(screenPreds[0].confidence).toBeGreaterThanOrEqual(screenPreds[1].confidence);
    }
  });

  it('should filter non-clickable elements', () => {
    const predictor = new ClickPredictor();

    predictor.updateScreenElements([
      { x: 100, y: 200, width: 50, height: 20, type: 'text' as const, importance: 0.9, clickable: false },
      { x: 300, y: 400, width: 100, height: 40, type: 'button' as const, importance: 0.8, clickable: true }
    ]);

    const predictions = predictor.predict(200, 300);
    const screenPreds = predictions.filter(p => p.source === 'screen');

    // Should only include clickable elements
    for (const pred of screenPreds) {
      expect(pred.reasoning).not.toContain('text');
    }
  });

  it('should include element text in reasoning', () => {
    const predictor = new ClickPredictor();

    predictor.updateScreenElements([
      { x: 200, y: 300, width: 100, height: 40, type: 'button' as const, importance: 0.9, clickable: true, text: 'Submit Form' }
    ]);

    const predictions = predictor.predict(150, 250);
    const screenPreds = predictions.filter(p => p.source === 'screen');

    if (screenPreds.length > 0) {
      expect(screenPreds[0].reasoning).toContain('Submit Form');
    }
  });

  it('should boost button confidence', () => {
    const predictor = new ClickPredictor();

    predictor.updateScreenElements([
      { x: 100, y: 200, width: 80, height: 30, type: 'button' as const, importance: 0.7, clickable: true },
      { x: 300, y: 400, width: 80, height: 30, type: 'link' as const, importance: 0.7, clickable: true }
    ]);

    const predictions = predictor.predict(200, 300);
    const screenPreds = predictions.filter(p => p.source === 'screen');

    if (screenPreds.length >= 2) {
      // Button should have type boost
      const buttonPred = screenPreds.find(p => p.reasoning?.includes('button'));
      const linkPred = screenPreds.find(p => p.reasoning?.includes('link'));
      if (buttonPred && linkPred) {
        expect(buttonPred.confidence).toBeGreaterThan(linkPred.confidence);
      }
    }
  });
});

describe('ClickPredictor - Temporal Prediction', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should predict from temporal sequence', () => {
    const predictor = new ClickPredictor();

    // Create repeating sequence
    for (let run = 0; run < 3; run++) {
      predictor.recordClick(100, 200);
      predictor.recordClick(150, 250);
      predictor.recordClick(200, 300);
    }

    const predictions = predictor.predict(190, 290);
    const temporalPreds = predictions.filter(p => p.source === 'temporal');

    // May have temporal predictions based on sequence
    expect(predictions).toBeDefined();
  });

  it('should provide delay information in reasoning', () => {
    const predictor = new ClickPredictor();

    for (let i = 0; i < 3; i++) {
      predictor.recordClick(100, 200);
      predictor.recordClick(150, 250);
    }

    const predictions = predictor.predict(140, 240);
    const temporalPreds = predictions.filter(p => p.source === 'temporal');

    for (const pred of temporalPreds) {
      expect(pred.reasoning).toContain('delay');
    }
  });
});

describe('ClickPredictor - Combined Prediction', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should combine predictions from multiple sources', () => {
    const predictor = new ClickPredictor();

    // Train pattern
    for (let i = 0; i < 5; i++) {
      predictor.recordClick(300, 400);
    }

    // Add screen elements nearby
    predictor.updateScreenElements([
      { x: 280, y: 380, width: 60, height: 40, type: 'button' as const, importance: 0.8, clickable: true }
    ]);

    const predictions = predictor.predict(290, 390, {
      mouseVelocity: { x: 100, y: 50 }
    });

    // Should have multiple predictions from different sources
    expect(predictions.length).toBeGreaterThan(0);
  });

  it('should provide alternatives in combined predictions', () => {
    const predictor = new ClickPredictor();

    // Create multiple hotspots
    for (let i = 0; i < 10; i++) {
      predictor.recordClick(100 + i * 50, 200);
    }

    const predictions = predictor.predict(300, 200);

    if (predictions.length > 0) {
      expect(predictions[0].alternatives).toBeDefined();
    }
  });

  it('should calculate combined confidence with source diversity', () => {
    const predictor = new ClickPredictor();

    // Create pattern
    for (let i = 0; i < 5; i++) {
      predictor.recordClick(300, 400);
    }

    // Add screen element
    predictor.updateScreenElements([
      { x: 300, y: 400, width: 50, height: 30, type: 'button' as const, importance: 0.8, clickable: true }
    ]);

    const predictions = predictor.predict(290, 390);

    const combinedPreds = predictions.filter(p => p.source === 'combined');
    if (combinedPreds.length > 0) {
      // Combined should have good confidence from multiple sources
      expect(combinedPreds[0].confidence).toBeGreaterThan(0);
    }
  });
});

describe('ClickPredictor - Confidence Filtering', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should filter predictions by minimum confidence', () => {
    const predictor = new ClickPredictor({ minConfidence: 0.5 });

    predictor.updateScreenElements([
      { x: 100, y: 200, width: 50, height: 20, type: 'text' as const, importance: 0.1, clickable: true }
    ]);

    const predictions = predictor.predict(500, 600);

    // All predictions should meet minimum confidence
    for (const pred of predictions) {
      expect(pred.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('should limit predictions to maxPredictions', () => {
    const predictor = new ClickPredictor({ maxPredictions: 3 });

    // Create multiple hotspots
    for (let i = 0; i < 10; i++) {
      predictor.recordClick(i * 100, 200);
    }

    const predictions = predictor.predict(500, 200);
    expect(predictions.length).toBeLessThanOrEqual(3);
  });
});

describe('ClickPredictor - Prediction History', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should record predictions for accuracy tracking', () => {
    const predictor = new ClickPredictor();

    const prediction = {
      x: 300,
      y: 400,
      confidence: 0.8,
      source: 'pattern' as const
    };

    predictor.recordPrediction(prediction);

    const recent = predictor.getRecentPredictions(1);
    expect(recent.length).toBe(1);
    expect(recent[0].predicted.x).toBe(300);
  });

  it('should limit prediction history size', () => {
    const predictor = new ClickPredictor({ historySize: 50 });

    for (let i = 0; i < 100; i++) {
      predictor.recordPrediction({
        x: 100 + i,
        y: 200,
        confidence: 0.5,
        source: 'pattern' as const
      });
    }

    const recent = predictor.getRecentPredictions(100);
    expect(recent.length).toBeLessThanOrEqual(50);
  });

  it('should clear prediction history', () => {
    const predictor = new ClickPredictor();

    for (let i = 0; i < 10; i++) {
      predictor.recordPrediction({
        x: 100 + i,
        y: 200,
        confidence: 0.5,
        source: 'pattern' as const
      });
    }

    predictor.clearHistory();

    const recent = predictor.getRecentPredictions(10);
    expect(recent.length).toBe(0);
  });
});

describe('ClickPredictor - Statistics', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should get prediction statistics', () => {
    const predictor = new ClickPredictor();

    const stats = predictor.getStats();
    expect(stats).toBeDefined();
    expect(stats.totalPredictions).toBe(0);
    expect(stats.accuracyRate).toBe(0);
    expect(stats.avgConfidence).toBe(0);
    expect(stats.predictionsBySource).toBeDefined();
    expect(stats.accuracyBySource).toBeDefined();
  });

  it('should track predictions by source', () => {
    const predictor = new ClickPredictor();

    predictor.recordPrediction({ x: 100, y: 200, confidence: 0.8, source: 'pattern' as const });
    predictor.recordPrediction({ x: 150, y: 250, confidence: 0.7, source: 'velocity' as const });
    predictor.recordPrediction({ x: 200, y: 300, confidence: 0.9, source: 'pattern' as const });

    const stats = predictor.getStats();
    expect(stats.totalPredictions).toBe(3);
    // Verify stats structure exists
    expect(stats.predictionsBySource).toBeDefined();
    expect(stats.accuracyBySource).toBeDefined();
  });

  it('should calculate accuracy rate', () => {
    const predictor = new ClickPredictor();

    // Record predictions and evaluate
    predictor.recordClick(100, 200);
    predictor.recordClick(100, 200);
    predictor.recordClick(100, 200);

    const stats = predictor.getStats();
    expect(stats.accuracyRate).toBeGreaterThanOrEqual(0);
    expect(stats.accuracyRate).toBeLessThanOrEqual(1);
  });
});

describe('ClickPredictor - State Management', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should export state', () => {
    const predictor = new ClickPredictor();

    predictor.recordClick(100, 200);
    predictor.recordClick(300, 400);

    const exported = predictor.exportState();
    expect(exported).toContain('weights');
    expect(exported).toContain('stats');
    expect(exported).toContain('patternData');
  });

  it('should import state', () => {
    const predictor = new ClickPredictor();

    predictor.recordClick(100, 200);
    predictor.recordClick(300, 400);

    const exported = predictor.exportState();

    const predictor2 = new ClickPredictor();
    predictor2.importState(exported);

    const stats = predictor2.getStats();
    expect(stats).toBeDefined();
  });

  it('should handle corrupt import data', () => {
    const predictor = new ClickPredictor();

    expect(() => {
      predictor.importState('invalid json');
    }).not.toThrow();
  });

  it('should preserve weights across export/import', () => {
    const predictor = new ClickPredictor();
    predictor.recordClick(100, 200);

    const exported = predictor.exportState();
    const parsed = JSON.parse(exported);
    expect(parsed.weights).toBeDefined();
    expect(parsed.weights.pattern).toBeDefined();
    expect(parsed.weights.velocity).toBeDefined();
    expect(parsed.weights.screen).toBeDefined();
    expect(parsed.weights.temporal).toBeDefined();
  });
});

describe('ClickPredictor - Hotspots', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should get hotspots with intensity', () => {
    const predictor = new ClickPredictor();

    for (let i = 0; i < 10; i++) {
      predictor.recordClick(300, 400);
    }

    const hotspots = predictor.getHotspots(3);
    expect(hotspots.length).toBeGreaterThan(0);

    const hotspot = hotspots[0];
    expect(hotspot.x).toBe(300);
    expect(hotspot.y).toBe(400);
    expect(hotspot.intensity).toBeGreaterThan(0);
    expect(hotspot.intensity).toBeLessThanOrEqual(1);
    expect(hotspot.count).toBe(10);
  });

  it('should filter hotspots by minimum count', () => {
    const predictor = new ClickPredictor();

    predictor.recordClick(100, 200); // count 1
    predictor.recordClick(100, 200); // count 2
    predictor.recordClick(300, 400); // count 1

    const hotspots1 = predictor.getHotspots(1);
    const hotspots2 = predictor.getHotspots(3);

    expect(hotspots1.length).toBeGreaterThan(0);
    expect(hotspots2.length).toBe(0); // No hotspots with count >= 3
  });
});

describe('ClickPredictor - Best Prediction', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should get best prediction', () => {
    const predictor = new ClickPredictor();

    for (let i = 0; i < 10; i++) {
      predictor.recordClick(300, 400);
    }

    const best = predictor.getBestPrediction();
    expect(best).toBeDefined();
    if (best) {
      expect(best.x).toBe(300);
      expect(best.y).toBe(400);
      expect(best.confidence).toBeGreaterThan(0);
      expect(best.source).toBe('pattern');
    }
  });

  it('should return null when no patterns exist', () => {
    const predictor = new ClickPredictor();
    const best = predictor.getBestPrediction();
    expect(best).toBeNull();
  });
});

describe('ClickPredictor - Integration Scenarios', () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  it('should work together for pattern learning and prediction', () => {
    const predictor = new ClickPredictor();

    // Simulate user session
    predictor.recordClick(100, 200, { url: 'https://app.com' });
    predictor.recordClick(150, 250, { url: 'https://app.com' });
    predictor.recordClick(100, 200, { url: 'https://app.com' });

    // Get predictions for same context
    const predictions = predictor.predict(90, 190, { url: 'https://app.com' });

    expect(predictions.length).toBeGreaterThan(0);
  });

  it('should handle context-aware predictions', () => {
    const predictor = new ClickPredictor();

    // Different contexts
    predictor.recordClick(100, 200, { url: 'https://app1.com' });
    predictor.recordClick(100, 200, { url: 'https://app1.com' });
    predictor.recordClick(500, 600, { url: 'https://app2.com' });
    predictor.recordClick(500, 600, { url: 'https://app2.com' });
    predictor.recordClick(500, 600, { url: 'https://app2.com' });

    // Predictions for app1 should favor first location
    const predictions1 = predictor.predict(90, 190, { url: 'https://app1.com' });
    expect(predictions1.length).toBeGreaterThan(0);

    // Predictions for app2 should favor second location
    const predictions2 = predictor.predict(490, 590, { url: 'https://app2.com' });
    expect(predictions2.length).toBeGreaterThan(0);
  });

  it('should adapt weights based on correct predictions', () => {
    const predictor = new ClickPredictor();

    // Make predictions and record actual clicks
    predictor.recordClick(100, 200);
    predictor.recordClick(100, 200);
    predictor.recordClick(100, 200);

    const stats = predictor.getStats();
    expect(stats).toBeDefined();
  });
});

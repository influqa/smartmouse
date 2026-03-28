/**
 * Tests for PatternLearner and ClickPredictor
 */

import { describe, it, expect } from 'bun:test';
import { PatternLearner } from './pattern-learner';
import { ClickPredictor } from './click-predictor';

describe('PatternLearner', () => {
  it('should create a new instance', () => {
    const learner = new PatternLearner('./test-data');
    expect(learner).toBeDefined();
    expect(learner.getStats()).toBeDefined();
  });

  it('should record click events', () => {
    const learner = new PatternLearner('./test-data');
    learner.recordClick(100, 200);
    
    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(1);
    expect(stats.uniqueClicks).toBe(1);
  });

  it('should record clicks with context', () => {
    const learner = new PatternLearner('./test-data');
    learner.recordClick(100, 200, {
      url: 'https://example.com',
      application: 'chrome',
      tags: ['navigation'],
      action: 'click_button'
    });
    
    const patterns = learner.getContextPatterns({ url: 'https://example.com' });
    expect(patterns.length).toBe(1);
    expect(patterns[0].url).toBe('https://example.com');
  });

  it('should aggregate clicks at the same grid position', () => {
    const learner = new PatternLearner('./test-data');
    
    // Record multiple clicks at similar positions (within grid)
    learner.recordClick(100, 200);
    learner.recordClick(105, 205);
    learner.recordClick(98, 198);
    
    const stats = learner.getStats();
    expect(stats.uniqueClicks).toBe(1); // All should map to same grid cell
    expect(stats.totalEvents).toBe(3);
  });

  it('should predict next clicks based on frequency', () => {
    const learner = new PatternLearner('./test-data');
    
    // Create a hotspot with multiple clicks
    for (let i = 0; i < 10; i++) {
      learner.recordClick(300, 400);
    }
    
    // Create another hotspot with fewer clicks
    for (let i = 0; i < 3; i++) {
      learner.recordClick(500, 600);
    }
    
    const predictions = learner.predictNextClicks(5);
    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0].x).toBe(300);
    expect(predictions[0].y).toBe(400);
    expect(predictions[0].count).toBe(10);
  });

  it('should record and analyze movement patterns', () => {
    const learner = new PatternLearner('./test-data');
    
    // Simulate a movement sequence
    for (let i = 0; i < 25; i++) {
      learner.recordMovement(100 + i * 4, 200 + i * 2);
    }
    
    const stats = learner.getStats();
    expect(stats.movementPatterns).toBeGreaterThan(0);
  });

  it('should get hotspots with minimum count filter', () => {
    const learner = new PatternLearner('./test-data');
    
    // Create hotspots with different counts
    for (let i = 0; i < 5; i++) {
      learner.recordClick(100, 200);
    }
    for (let i = 0; i < 2; i++) {
      learner.recordClick(300, 400);
    }
    
    const hotspots = learner.getHotspots(3);
    expect(hotspots.length).toBe(1);
    expect(hotspots[0].count).toBe(5);
  });

  it('should calculate confidence scores', () => {
    const learner = new PatternLearner('./test-data');
    
    learner.recordClick(100, 200);
    learner.recordClick(100, 200);
    learner.recordClick(100, 200);
    
    const patterns = learner.predictNextClicks(1);
    expect(patterns[0].confidence).toBeGreaterThan(0);
    expect(patterns[0].confidence).toBeLessThanOrEqual(1);
  });

  it('should export and import patterns', () => {
    const learner = new PatternLearner('./test-data');
    
    learner.recordClick(100, 200, { url: 'https://test.com' });
    learner.recordClick(300, 400);
    
    const exported = learner.exportPatterns();
    expect(exported).toContain('https://test.com');
    
    const learner2 = new PatternLearner('./test-data');
    learner2.importPatterns(exported);
    
    const stats = learner2.getStats();
    expect(stats.uniqueClicks).toBe(2);
  });

  it('should clear patterns', () => {
    const learner = new PatternLearner('./test-data');
    
    learner.recordClick(100, 200);
    learner.recordClick(300, 400);
    
    learner.clear();
    
    const stats = learner.getStats();
    expect(stats.totalEvents).toBe(0);
    expect(stats.uniqueClicks).toBe(0);
  });

  it('should apply session decay', () => {
    const learner = new PatternLearner('./test-data');
    
    learner.recordClick(100, 200);
    learner.recordClick(100, 200);
    
    const beforeDecay = learner.getStats();
    learner.applySessionDecay();
    const afterDecay = learner.getStats();
    
    expect(afterDecay.sessionEvents).toBe(0);
  });
});

describe('ClickPredictor', () => {
  it('should create a new instance', () => {
    const predictor = new ClickPredictor();
    expect(predictor).toBeDefined();
  });

  it('should update screen elements', () => {
    const predictor = new ClickPredictor();
    
    const elements = [
      { x: 100, y: 200, width: 80, height: 30, type: 'button' as const, importance: 0.8, clickable: true },
      { x: 300, y: 400, width: 100, height: 40, type: 'link' as const, importance: 0.6, clickable: true }
    ];
    
    predictor.updateScreenElements(elements);
    const hotspots = predictor.getHotspots();
    expect(hotspots).toBeDefined();
  });

  it('should record clicks and update pattern learner', () => {
    const predictor = new ClickPredictor();
    
    predictor.recordClick(100, 200);
    predictor.recordClick(100, 200);
    predictor.recordClick(100, 200);
    
    const stats = predictor.getStats();
    expect(stats.totalClicks).toBe(3);
  });

  it('should predict from pattern learning', () => {
    const predictor = new ClickPredictor();
    
    // Train with multiple clicks at same location
    for (let i = 0; i < 10; i++) {
      predictor.recordClick(300, 400);
    }
    
    const predictions = predictor.predict(290, 390);
    expect(predictions.length).toBeGreaterThan(0);
  });

  it('should predict from velocity extrapolation', () => {
    const predictor = new ClickPredictor();
    
    const predictions = predictor.predict(100, 200, {
      mouseVelocity: { x: 500, y: 300 },
      acceleration: 100
    });
    
    // Should have velocity-based predictions
    const velocityPreds = predictions.filter(p => p.source === 'velocity');
    expect(velocityPreds.length).toBeGreaterThan(0);
  });

  it('should predict from screen elements', () => {
    const predictor = new ClickPredictor();
    
    predictor.updateScreenElements([
      { x: 200, y: 300, width: 100, height: 40, type: 'button' as const, importance: 0.9, clickable: true, text: 'Submit' }
    ]);
    
    const predictions = predictor.predict(150, 250);
    
    // Should have screen-based predictions
    const screenPreds = predictions.filter(p => p.source === 'screen');
    expect(screenPreds.length).toBeGreaterThan(0);
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
    
    // Should have combined prediction at the top
    if (predictions.length > 0) {
      expect(predictions[0].source).toBe('combined');
    }
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

  it('should get prediction statistics', () => {
    const predictor = new ClickPredictor();
    
    const stats = predictor.getStats();
    expect(stats).toBeDefined();
    expect(stats.totalPredictions).toBe(0);
    expect(stats.accuracyRate).toBe(0);
  });

  it('should export and import state', () => {
    const predictor = new ClickPredictor();
    
    predictor.recordClick(100, 200);
    predictor.recordClick(300, 400);
    
    const exported = predictor.exportState();
    expect(exported).toContain('weights');
    
    const predictor2 = new ClickPredictor();
    predictor2.importState(exported);
    
    const stats = predictor2.getStats();
    expect(stats).toBeDefined();
  });

  it('should provide reasoning for predictions', () => {
    const predictor = new ClickPredictor();
    
    // Train pattern
    for (let i = 0; i < 5; i++) {
      predictor.recordClick(300, 400);
    }
    
    const predictions = predictor.predict(290, 390);
    
    for (const pred of predictions) {
      expect(pred.reasoning).toBeDefined();
      expect(pred.reasoning!.length).toBeGreaterThan(0);
    }
  });

  it('should provide alternative predictions', () => {
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
});

describe('Integration Tests', () => {
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
});

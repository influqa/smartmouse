/**
 * Click Predictor - AI-powered prediction of likely click targets
 * Uses pattern learning + screen analysis to predict user intent
 */

import PatternLearner from './pattern-learner';

interface PredictionResult {
  x: number;
  y: number;
  confidence: number;
  source: 'pattern' | 'velocity' | 'screen' | 'combined';
}

interface ScreenElement {
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;  // 'button', 'link', 'input', 'icon', etc.
  importance: number;
}

export class ClickPredictor {
  private patternLearner: PatternLearner;
  private screenElements: ScreenElement[] = [];
  private recentClicks: { x: number; y: number; time: number }[] = [];
  
  constructor() {
    this.patternLearner = new PatternLearner();
  }

  // Update screen elements from vision analysis
  updateScreenElements(elements: ScreenElement[]): void {
    this.screenElements = elements;
  }

  // Record a click for learning
  recordClick(x: number, y: number): void {
    this.recentClicks.push({ x, y, time: Date.now() });
    if (this.recentClicks.length > 50) {
      this.recentClicks.shift();
    }
    this.patternLearner.recordClick(x, y);
  }

  // Predict the most likely click target
  predict(
    mouseX: number, 
    mouseY: number, 
    velocityX: number = 0, 
    velocityY: number = 0
  ): PredictionResult[] {
    const predictions: PredictionResult[] = [];

    // Method 1: Pattern-based prediction
    const patternPrediction = this.patternLearner.predictTarget(mouseX, mouseY);
    if (patternPrediction) {
      predictions.push({
        x: patternPrediction.x,
        y: patternPrediction.y,
        confidence: patternPrediction.confidence,
        source: 'pattern'
      });
    }

    // Method 2: Velocity extrapolation
    if (Math.abs(velocityX) > 10 || Math.abs(velocityY) > 10) {
      const futureX = mouseX + velocityX * 0.5;
      const futureY = mouseY + velocityY * 0.5;
      
      predictions.push({
        x: Math.round(futureX),
        y: Math.round(futureY),
        confidence: 0.3,
        source: 'velocity'
      });
    }

    // Method 3: Screen element importance
    const nearbyElements = this.screenElements.filter(el => 
      Math.abs(el.x - mouseX) < 300 &&
      Math.abs(el.y - mouseY) < 300
    ).sort((a, b) => b.importance - a.importance);

    for (const el of nearbyElements.slice(0, 3)) {
      predictions.push({
        x: el.x + el.width / 2,
        y: el.y + el.height / 2,
        confidence: el.importance * 0.5,
        source: 'screen'
      });
    }

    // Method 4: Combine predictions
    const combined = this.combinePredictions(predictions);
    if (combined) {
      predictions.unshift(combined);
    }

    // Sort by confidence and return
    return predictions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  private combinePredictions(predictions: PredictionResult[]): PredictionResult | null {
    if (predictions.length < 2) return null;

    // Group by proximity
    const groups: { x: number; y: number; totalConfidence: number; count: number }[] = [];
    
    for (const pred of predictions) {
      // Find nearby group
      const group = groups.find(g => 
        Math.abs(g.x - pred.x) < 50 && Math.abs(g.y - pred.y) < 50
      );

      if (group) {
        group.x = (group.x * group.count + pred.x) / (group.count + 1);
        group.y = (group.y * group.count + pred.y) / (group.count + 1);
        group.totalConfidence += pred.confidence;
        group.count++;
      } else {
        groups.push({
          x: pred.x,
          y: pred.y,
          totalConfidence: pred.confidence,
          count: 1
        });
      }
    }

    // Find best group
    const bestGroup = groups
      .map(g => ({ ...g, avgConfidence: g.totalConfidence / g.count * g.count }))
      .sort((a, b) => b.avgConfidence - a.avgConfidence)[0];

    if (bestGroup && bestGroup.count >= 2) {
      return {
        x: Math.round(bestGroup.x),
        y: Math.round(bestGroup.y),
        confidence: bestGroup.avgConfidence,
        source: 'combined'
      };
    }

    return null;
  }

  // Get prediction for AI planning
  getBestPrediction(): PredictionResult | null {
    const hotspots = this.patternLearner.getHotspots();
    if (hotspots.length === 0) return null;

    const best = hotspots[0];
    return {
      x: best.x,
      y: best.y,
      confidence: best.count / (this.patternLearner.getStats().totalEvents || 1),
      source: 'pattern'
    };
  }

  // Get hotspots for visualization
  getHotspots(): { x: number; y: number; intensity: number }[] {
    return this.patternLearner.getHotspots().map(h => ({
      x: h.x,
      y: h.y,
      intensity: Math.min(h.count / 10, 1)
    }));
  }

  // Get statistics
  getStats(): { totalClicks: number; patternsLearned: number; predictionsToday: number } {
    const stats = this.patternLearner.getStats();
    return {
      totalClicks: stats.totalEvents,
      patternsLearned: stats.uniqueClicks,
      predictionsToday: stats.patterns
    };
  }
}

export default ClickPredictor;
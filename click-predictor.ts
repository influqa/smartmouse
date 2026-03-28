/**
 * Click Predictor - AI-powered prediction of likely click targets
 * Uses pattern learning, screen analysis, and behavioral modeling
 * to predict user intent with high accuracy
 * 
 * Features:
 * - Multi-method prediction (pattern, velocity, screen elements, temporal)
 * - Context-aware predictions (URL, application, time of day)
 * - Confidence scoring with multiple factors
 * - Prediction history and accuracy tracking
 * - Real-time adaptation based on user feedback
 */

import PatternLearner from './pattern-learner';

interface PredictionResult {
  x: number;
  y: number;
  confidence: number;
  source: 'pattern' | 'velocity' | 'screen' | 'temporal' | 'combined';
  reasoning?: string;
  alternatives?: { x: number; y: number; confidence: number }[];
}

interface ScreenElement {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'button' | 'link' | 'input' | 'icon' | 'text' | 'image' | 'menu' | 'other';
  importance: number;
  clickable?: boolean;
  text?: string;
  id?: string;
  class?: string;
}

interface PredictionContext {
  url?: string;
  application?: string;
  timeOfDay?: number;
  dayOfWeek?: number;
  recentActions?: string[];
  mouseVelocity?: { x: number; y: number };
  acceleration?: number;
}

interface PredictionHistory {
  predicted: { x: number; y: number; time: number };
  actual?: { x: number; y: number; time: number };
  correct: boolean;
  confidence: number;
  context?: PredictionContext;
}

interface PredictionStats {
  totalPredictions: number;
  accuratePredictions: number;
  accuracyRate: number;
  avgConfidence: number;
  predictionsBySource: Record<string, number>;
  accuracyBySource: Record<string, number>;
}

interface PredictorConfig {
  enablePatternLearning: boolean;
  enableVelocityPrediction: boolean;
  enableScreenAnalysis: boolean;
  enableTemporalPrediction: boolean;
  minConfidence: number;
  maxPredictions: number;
  historySize: number;
  adaptationRate: number;
}

export class ClickPredictor {
  private patternLearner: PatternLearner;
  private screenElements: ScreenElement[] = [];
  private recentClicks: { x: number; y: number; time: number; context?: PredictionContext }[] = [];
  private predictionHistory: PredictionHistory[] = [];
  private config: PredictorConfig;
  private weights: { pattern: number; velocity: number; screen: number; temporal: number };

  constructor(config?: Partial<PredictorConfig>) {
    this.config = {
      enablePatternLearning: true,
      enableVelocityPrediction: true,
      enableScreenAnalysis: true,
      enableTemporalPrediction: true,
      minConfidence: 0.2,
      maxPredictions: 5,
      historySize: 100,
      adaptationRate: 0.1,
      ...config
    };

    this.patternLearner = new PatternLearner();
    
    this.weights = {
      pattern: 0.35,
      velocity: 0.2,
      screen: 0.25,
      temporal: 0.2
    };
  }

  updateScreenElements(elements: ScreenElement[]): void {
    this.screenElements = elements;
  }

  recordClick(x: number, y: number, context?: PredictionContext): void {
    const clickData = { x, y, time: Date.now(), context };
    this.recentClicks.push(clickData);
    
    if (this.recentClicks.length > 50) {
      this.recentClicks.shift();
    }

    this.patternLearner.recordClick(x, y, {
      url: context?.url,
      application: context?.application,
      tags: context?.recentActions,
      action: context?.recentActions?.[0]
    });

    this.evaluateLastPrediction(x, y);
  }

  private evaluateLastPrediction(actualX: number, actualY: number): void {
    const lastPrediction = this.predictionHistory.find(p => !p.actual);
    if (!lastPrediction) return;

    const distance = Math.sqrt(
      Math.pow(actualX - lastPrediction.predicted.x, 2) + 
      Math.pow(actualY - lastPrediction.predicted.y, 2)
    );

    lastPrediction.actual = { x: actualX, y: actualY, time: Date.now() };
    lastPrediction.correct = distance < 100;

    if (lastPrediction.correct) {
      this.adaptWeights(lastPrediction);
    }

    if (this.predictionHistory.length > this.config.historySize) {
      this.predictionHistory.shift();
    }
  }

  private adaptWeights(prediction: PredictionHistory): void {
    if (prediction.correct) {
      const sourceKey = prediction.predicted.x as unknown as keyof typeof this.weights;
      if (this.weights[sourceKey] !== undefined) {
        this.weights[sourceKey] = Math.min(this.weights[sourceKey] + this.config.adaptationRate, 0.5);
      }
    }
  }

  predict(mouseX: number, mouseY: number, context?: PredictionContext): PredictionResult[] {
    const predictions: PredictionResult[] = [];

    if (this.config.enablePatternLearning) {
      const patternPred = this.predictFromPattern(mouseX, mouseY, context);
      if (patternPred) predictions.push(patternPred);
    }

    if (this.config.enableVelocityPrediction && context?.mouseVelocity) {
      const velocityPred = this.predictFromVelocity(
        mouseX, mouseY, context.mouseVelocity.x, context.mouseVelocity.y, context.acceleration
      );
      if (velocityPred) predictions.push(velocityPred);
    }

    if (this.config.enableScreenAnalysis) {
      const screenPreds = this.predictFromScreenElements(mouseX, mouseY);
      predictions.push(...screenPreds);
    }

    if (this.config.enableTemporalPrediction) {
      const temporalPred = this.predictFromTemporalSequence();
      if (temporalPred) predictions.push(temporalPred);
    }

    const combined = this.combinePredictions(predictions);
    if (combined) predictions.unshift(combined);

    const filtered = predictions
      .filter(p => p.confidence >= this.config.minConfidence)
      .sort((a, b) => b.confidence - a.confidence);

    return filtered.slice(0, this.config.maxPredictions).map(p => ({
      ...p,
      alternatives: filtered.filter(a => a !== p).slice(0, 3).map(a => ({
        x: a.x,
        y: a.y,
        confidence: a.confidence
      }))
    }));
  }

  private predictFromPattern(mouseX: number, mouseY: number, context?: PredictionContext): PredictionResult | null {
    const patternContext = context ? { url: context.url, application: context.application } : undefined;
    const hotspots = this.patternLearner.predictNextClicks(5, patternContext);
    
    if (hotspots.length === 0) return null;

    const nearbyHotspots = hotspots.filter(h =>
      Math.abs(h.x - mouseX) < 500 && Math.abs(h.y - mouseY) < 500
    );

    if (nearbyHotspots.length === 0) return null;

    const best = nearbyHotspots[0];
    const distance = Math.sqrt(Math.pow(best.x - mouseX, 2) + Math.pow(best.y - mouseY, 2));
    const distanceFactor = Math.max(0, 1 - distance / 500);
    
    const confidence = best.confidence * best.decayFactor * distanceFactor;

    return {
      x: best.x,
      y: best.y,
      confidence,
      source: 'pattern',
      reasoning: `Pattern match: ${best.count} clicks at this location, confidence: ${(confidence * 100).toFixed(1)}%`
    };
  }

  private predictFromVelocity(mouseX: number, mouseY: number, velocityX: number, velocityY: number, acceleration?: number): PredictionResult | null {
    if (Math.abs(velocityX) < 10 && Math.abs(velocityY) < 10) return null;

    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
    const horizon = Math.min(1000, 200 + speed * 2);

    const futureX = mouseX + velocityX * horizon;
    const futureY = mouseY + velocityY * horizon;

    const hotspots = this.patternLearner.getHotspots(2);
    const nearbyHotspot = hotspots.find(h =>
      Math.abs(h.x - futureX) < 150 && Math.abs(h.y - futureY) < 150
    );

    if (nearbyHotspot) {
      return {
        x: nearbyHotspot.x,
        y: nearbyHotspot.y,
        confidence: nearbyHotspot.confidence * 0.6,
        source: 'velocity',
        reasoning: `Velocity trajectory + pattern match at (${nearbyHotspot.x}, ${nearbyHotspot.y})`
      };
    }

    const confidence = Math.min(speed / 2000, 0.5);
    return {
      x: Math.round(futureX),
      y: Math.round(futureY),
      confidence,
      source: 'velocity',
      reasoning: `Velocity extrapolation: ${speed.toFixed(1)} px/s, ${horizon.toFixed(0)}ms horizon`
    };
  }

  private predictFromScreenElements(mouseX: number, mouseY: number): PredictionResult[] {
    const predictions: PredictionResult[] = [];

    const nearbyElements = this.screenElements
      .filter(el => el.clickable !== false)
      .filter(el =>
        Math.abs(el.x + el.width / 2 - mouseX) < 400 &&
        Math.abs(el.y + el.height / 2 - mouseY) < 400
      )
      .sort((a, b) => {
        const distA = Math.sqrt(Math.pow(a.x + a.width / 2 - mouseX, 2) + Math.pow(a.y + a.height / 2 - mouseY, 2));
        const distB = Math.sqrt(Math.pow(b.x + b.width / 2 - mouseX, 2) + Math.pow(b.y + b.height / 2 - mouseY, 2));
        return (b.importance * 100 - distB) - (a.importance * 100 - distA);
      });

    for (const el of nearbyElements.slice(0, 5)) {
      const centerX = el.x + el.width / 2;
      const centerY = el.y + el.height / 2;
      const distance = Math.sqrt(Math.pow(centerX - mouseX, 2) + Math.pow(centerY - mouseY, 2));
      const distanceFactor = Math.max(0, 1 - distance / 400);
      const typeBoost = el.type === 'button' ? 1.2 : el.type === 'link' ? 1.1 : 1.0;
      const confidence = el.importance * distanceFactor * typeBoost * 0.7;

      predictions.push({
        x: Math.round(centerX),
        y: Math.round(centerY),
        confidence,
        source: 'screen',
        reasoning: `${el.type} element${el.text ? `: "${el.text}"` : ''}, importance: ${el.importance}`
      });
    }

    return predictions;
  }

  private predictFromTemporalSequence(): PredictionResult | null {
    const nextAction = this.patternLearner.predictNextInSequence();
    
    if (!nextAction) return null;

    return {
      x: nextAction.x,
      y: nextAction.y,
      confidence: nextAction.confidence * 0.8,
      source: 'temporal',
      reasoning: `Next in sequence (delay: ${nextAction.delay}ms)`
    };
  }

  private combinePredictions(predictions: PredictionResult[]): PredictionResult | null {
    if (predictions.length < 2) return null;

    const clusters: { x: number; y: number; totalWeight: number; predictions: PredictionResult[]; sources: Set<string> }[] = [];

    for (const pred of predictions) {
      let cluster = clusters.find(c =>
        Math.abs(c.x - pred.x) < 75 && Math.abs(c.y - pred.y) < 75
      );

      if (cluster) {
        const weight = pred.confidence * (this.weights[pred.source] || 0.25);
        cluster.x = (cluster.x * cluster.totalWeight + pred.x * weight) / (cluster.totalWeight + weight);
        cluster.y = (cluster.y * cluster.totalWeight + pred.y * weight) / (cluster.totalWeight + weight);
        cluster.totalWeight += weight;
        cluster.predictions.push(pred);
        cluster.sources.add(pred.source);
      } else {
        const weight = pred.confidence * (this.weights[pred.source] || 0.25);
        clusters.push({ x: pred.x, y: pred.y, totalWeight: weight, predictions: [pred], sources: new Set([pred.source]) });
      }
    }

    const scoredClusters = clusters.map(c => {
      const avgConfidence = c.predictions.reduce((sum, p) => sum + p.confidence, 0) / c.predictions.length;
      const sourceDiversity = c.sources.size / 4;
      const combinedConfidence = avgConfidence * (0.7 + 0.3 * sourceDiversity);
      
      return { ...c, combinedConfidence, avgConfidence };
    });

    const best = scoredClusters.sort((a, b) => b.combinedConfidence - a.combinedConfidence)[0];

    if (best && best.predictions.length >= 2) {
      return {
        x: Math.round(best.x),
        y: Math.round(best.y),
        confidence: Math.min(best.combinedConfidence, 0.95),
        source: 'combined',
        reasoning: `Combined ${best.predictions.length} predictions from ${best.sources.size} methods`,
        alternatives: best.predictions.slice(1, 4).map(p => ({ x: p.x, y: p.y, confidence: p.confidence }))
      };
    }

    return null;
  }

  getBestPrediction(context?: PredictionContext): PredictionResult | null {
    const hotspots = this.patternLearner.getHotspots(1);
    if (hotspots.length === 0) return null;

    const best = hotspots[0];
    return {
      x: best.x,
      y: best.y,
      confidence: best.confidence,
      source: 'pattern',
      reasoning: `Most frequent click location (${best.count} times)`
    };
  }

  getHotspots(minCount: number = 3): { x: number; y: number; intensity: number; count: number }[] {
    return this.patternLearner.getHotspots(minCount).map(h => ({
      x: h.x,
      y: h.y,
      intensity: Math.min(h.count / 10, 1),
      count: h.count
    }));
  }

  getStats(): PredictionStats {
    const total = this.predictionHistory.length;
    const accurate = this.predictionHistory.filter(p => p.correct).length;
    
    const bySource: Record<string, { total: number; accurate: number }> = {};
    for (const pred of this.predictionHistory) {
      const source = pred.predicted.x as unknown as string;
      if (!bySource[source]) bySource[source] = { total: 0, accurate: 0 };
      bySource[source].total++;
      if (pred.correct) bySource[source].accurate++;
    }

    const confidences = this.predictionHistory.map(p => p.confidence);
    const avgConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

    return {
      totalPredictions: total,
      accuratePredictions: accurate,
      accuracyRate: total > 0 ? accurate / total : 0,
      avgConfidence,
      predictionsBySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, v.total])),
      accuracyBySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, v.total > 0 ? v.accurate / v.total : 0]))
    };
  }

  recordPrediction(prediction: PredictionResult, context?: PredictionContext): void {
    this.predictionHistory.push({
      predicted: { x: prediction.x, y: prediction.y, time: Date.now() },
      correct: false,
      confidence: prediction.confidence,
      context
    });

    if (this.predictionHistory.length > this.config.historySize) {
      this.predictionHistory.shift();
    }
  }

  getRecentPredictions(count: number = 10): PredictionHistory[] {
    return this.predictionHistory.slice(-count);
  }

  clearHistory(): void {
    this.predictionHistory = [];
  }

  exportState(): string {
    return JSON.stringify({
      weights: this.weights,
      stats: this.getStats(),
      patternData: JSON.parse(this.patternLearner.exportPatterns())
    }, null, 2);
  }

  importState(json: string): void {
    try {
      const parsed = JSON.parse(json);
      this.weights = parsed.weights || this.weights;
      this.patternLearner.importPatterns(JSON.stringify(parsed.patternData));
    } catch (e) {
      console.error('Failed to import predictor state:', e);
    }
  }
}

export default ClickPredictor;

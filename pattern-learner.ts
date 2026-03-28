/**
 * Pattern Learner - Advanced user behavior pattern learning system
 * Records and analyzes mouse movements, clicks, and timing patterns
 * to predict user intent and automate repetitive actions
 * 
 * Features:
 * - Temporal pattern learning (time-based click sequences)
 * - Context-aware pattern matching (URL, window title, application)
 * - Grid-based spatial clustering with adaptive resolution
 * - Movement trajectory analysis
 * - Session-based learning with decay factors
 * - Pattern confidence scoring
 */

import fs from 'fs';
import path from 'path';

interface ClickPattern {
  x: number;
  y: number;
  count: number;
  lastClicked: number;
  firstClicked: number;
  avgInterval: number;
  intervals: number[];
  context?: string;
  url?: string;
  application?: string;
  confidence: number;
  decayFactor: number;
  tags: string[];
  successRate: number;
  associatedActions: string[];
}

interface MovementPattern {
  startPos: { x: number; y: number };
  endPos: { x: number; y: number };
  duration: number;
  frequency: number;
  pathPoints: { x: number; y: number; time: number }[];
  avgVelocity: number;
  context?: string;
}

interface TemporalPattern {
  sequence: { x: number; y: number; delay: number }[];
  count: number;
  avgTotalTime: number;
  contexts: string[];
}

interface PatternData {
  clicks: Map<string, ClickPattern>;
  movements: MovementPattern[];
  temporalPatterns: TemporalPattern[];
  totalEvents: number;
  sessionEvents: number;
  lastUpdate: number;
  sessionStart: number;
  learningRate: number;
  decayRate: number;
}

interface LearningConfig {
  gridSize: number;
  minPatternConfidence: number;
  maxPatterns: number;
  sessionDecay: number;
  temporalWindow: number;
  enableContextLearning: boolean;
  enableTemporalLearning: boolean;
}

export class PatternLearner {
  private data: PatternData;
  private filePath: string;
  private recentPositions: { x: number; y: number; time: number }[] = [];
  private clickSequence: { x: number; y: number; time: number; context?: string }[] = [];
  private config: LearningConfig;

  constructor(dataDir: string = './data', config?: Partial<LearningConfig>) {
    this.config = {
      gridSize: 50,
      minPatternConfidence: 0.3,
      maxPatterns: 1000,
      sessionDecay: 0.95,
      temporalWindow: 5000,
      enableContextLearning: true,
      enableTemporalLearning: true,
      ...config
    };

    this.filePath = path.join(dataDir, 'patterns.json');
    this.data = {
      clicks: new Map(),
      movements: [],
      temporalPatterns: [],
      totalEvents: 0,
      sessionEvents: 0,
      lastUpdate: Date.now(),
      sessionStart: Date.now(),
      learningRate: 1.0,
      decayRate: this.config.sessionDecay
    };
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data.clicks = new Map(Object.entries(parsed.clicks || {}));
        this.data.movements = parsed.movements || [];
        this.data.temporalPatterns = parsed.temporalPatterns || [];
        this.data.totalEvents = parsed.totalEvents || 0;
        this.data.sessionEvents = parsed.sessionEvents || 0;
        this.data.learningRate = parsed.learningRate || 1.0;
        
        for (const [key, pattern] of this.data.clicks.entries()) {
          if (!pattern.firstClicked) pattern.firstClicked = pattern.lastClicked;
          if (!pattern.intervals) pattern.intervals = [];
          if (!pattern.confidence) pattern.confidence = this.calculateConfidence(pattern);
          if (!pattern.decayFactor) pattern.decayFactor = 1.0;
          if (!pattern.tags) pattern.tags = [];
          if (!pattern.successRate) pattern.successRate = 1.0;
          if (!pattern.associatedActions) pattern.associatedActions = [];
        }
      }
    } catch (e) {
      console.log('No existing pattern data, starting fresh');
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const obj = {
        clicks: Object.fromEntries(this.data.clicks),
        movements: this.data.movements,
        temporalPatterns: this.data.temporalPatterns,
        totalEvents: this.data.totalEvents,
        sessionEvents: this.data.sessionEvents,
        lastUpdate: this.data.lastUpdate,
        sessionStart: this.data.sessionStart,
        learningRate: this.data.learningRate,
        decayRate: this.data.decayRate
      };
      fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2));
    } catch (e) {
      console.error('Failed to save patterns:', e);
    }
  }

  recordClick(x: number, y: number, context?: {
    url?: string;
    application?: string;
    tags?: string[];
    action?: string;
  }): void {
    const gridX = Math.round(x / this.config.gridSize) * this.config.gridSize;
    const gridY = Math.round(y / this.config.gridSize) * this.config.gridSize;
    const key = `${gridX},${gridY}`;
    const now = Date.now();

    const existing = this.data.clicks.get(key);
    if (existing) {
      const interval = now - existing.lastClicked;
      existing.intervals.push(interval);
      if (existing.intervals.length > 10) existing.intervals.shift();
      existing.avgInterval = existing.intervals.reduce((a, b) => a + b, 0) / existing.intervals.length;
      
      existing.count++;
      existing.lastClicked = now;
      if (!existing.firstClicked) existing.firstClicked = now;
      
      if (context?.url) existing.url = context.url;
      if (context?.application) existing.application = context.application;
      if (context?.tags) {
        existing.tags = [...new Set([...existing.tags, ...(context.tags || [])])];
      }
      if (context?.action) {
        if (!existing.associatedActions.includes(context.action)) {
          existing.associatedActions.push(context.action);
        }
      }
      
      existing.confidence = this.calculateConfidence(existing);
      existing.decayFactor = this.calculateDecay(existing);
    } else {
      this.data.clicks.set(key, {
        x: gridX,
        y: gridY,
        count: 1,
        lastClicked: now,
        firstClicked: now,
        avgInterval: 0,
        intervals: [],
        context: context?.application,
        url: context?.url,
        application: context?.application,
        confidence: 0.1,
        decayFactor: 1.0,
        tags: context?.tags || [],
        successRate: 1.0,
        associatedActions: context?.action ? [context.action] : []
      });
    }

    this.data.totalEvents++;
    this.data.sessionEvents++;
    this.data.lastUpdate = now;

    if (this.config.enableTemporalLearning) {
      this.clickSequence.push({ x: gridX, y: gridY, time: now, context: context?.url });
      this.pruneClickSequence();
      this.detectTemporalPatterns();
    }

    if (this.data.clicks.size > this.config.maxPatterns) {
      this.pruneLowConfidencePatterns();
    }

    this.save();
  }

  recordMovement(x: number, y: number, context?: string): void {
    const now = Date.now();
    this.recentPositions.push({ x, y, time: now });

    if (this.recentPositions.length > 100) {
      this.recentPositions.shift();
    }

    if (this.recentPositions.length >= 20) {
      this.analyzeMovement(context);
    }
  }

  private analyzeMovement(context?: string): void {
    const start = this.recentPositions[0];
    const end = this.recentPositions[this.recentPositions.length - 1];
    const duration = end.time - start.time;
    
    let totalDistance = 0;
    for (let i = 1; i < this.recentPositions.length; i++) {
      const dx = this.recentPositions[i].x - this.recentPositions[i - 1].x;
      const dy = this.recentPositions[i].y - this.recentPositions[i - 1].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    const avgVelocity = duration > 0 ? totalDistance / duration : 0;

    const similar = this.data.movements.find(p =>
      Math.abs(p.startPos.x - start.x) < 100 &&
      Math.abs(p.startPos.y - start.y) < 100 &&
      Math.abs(p.endPos.x - end.x) < 100 &&
      Math.abs(p.endPos.y - end.y) < 100
    );

    if (similar) {
      similar.frequency++;
      similar.avgVelocity = (similar.avgVelocity * (similar.frequency - 1) + avgVelocity) / similar.frequency;
      if (context && !similar.context) similar.context = context;
    } else {
      this.data.movements.push({
        startPos: { x: start.x, y: start.y },
        endPos: { x: end.x, y: end.y },
        duration,
        frequency: 1,
        pathPoints: [...this.recentPositions],
        avgVelocity,
        context
      });
    }

    if (this.data.movements.length > 500) {
      this.data.movements = this.data.movements.sort((a, b) => b.frequency - a.frequency).slice(0, 500);
    }
  }

  private detectTemporalPatterns(): void {
    if (this.clickSequence.length < 3) return;

    const now = Date.now();
    const recentSequence = this.clickSequence.filter(c => now - c.time < this.config.temporalWindow);

    if (recentSequence.length < 3) return;

    const patternSignature = recentSequence.slice(-5).map((c, i, arr) => {
      if (i === 0) return `${c.x},${c.y}`;
      const delay = c.time - arr[i - 1].time;
      return `${c.x},${c.y},${delay}`;
    }).join('|');

    const existing = this.data.temporalPatterns.find(p => {
      const sig = p.sequence.map((s, i) => i === 0 ? `${s.x},${s.y}` : `${s.x},${s.y},${s.delay}`).join('|');
      return sig === patternSignature;
    });

    if (existing) {
      existing.count++;
      const totalTime = recentSequence[recentSequence.length - 1].time - recentSequence[0].time;
      existing.avgTotalTime = (existing.avgTotalTime * (existing.count - 1) + totalTime) / existing.count;
    } else {
      const sequence = recentSequence.slice(-5).map((c, i, arr) => ({
        x: c.x,
        y: c.y,
        delay: i === 0 ? 0 : c.time - arr[i - 1].time
      }));
      
      this.data.temporalPatterns.push({
        sequence,
        count: 1,
        avgTotalTime: recentSequence[recentSequence.length - 1].time - recentSequence[0].time,
        contexts: recentSequence.map(c => c.context).filter(Boolean) as string[]
      });
    }

    if (this.data.temporalPatterns.length > 100) {
      this.data.temporalPatterns = this.data.temporalPatterns.sort((a, b) => b.count - a.count).slice(0, 100);
    }
  }

  private pruneClickSequence(): void {
    const now = Date.now();
    this.clickSequence = this.clickSequence.filter(c => now - c.time < this.config.temporalWindow);
  }

  private calculateConfidence(pattern: ClickPattern): number {
    const now = Date.now();
    const recencyFactor = Math.exp(-(now - pattern.lastClicked) / (1000 * 60 * 60));
    const frequencyFactor = Math.min(pattern.count / 10, 1);
    const consistencyFactor = pattern.intervals.length > 1 
      ? 1 - (Math.std?.(pattern.intervals) || 0) / (pattern.avgInterval || 1)
      : 0.5;
    
    return Math.min(recencyFactor * 0.4 + frequencyFactor * 0.4 + consistencyFactor * 0.2, 1);
  }

  private calculateDecay(pattern: ClickPattern): number {
    const hoursSinceLastClick = (Date.now() - pattern.lastClicked) / (1000 * 60 * 60);
    return Math.exp(-hoursSinceLastClick * this.data.decayRate);
  }

  private pruneLowConfidencePatterns(): void {
    const entries = Array.from(this.data.clicks.entries());
    entries.sort((a, b) => {
      const scoreA = a[1].confidence * a[1].decayFactor * a[1].count;
      const scoreB = b[1].confidence * b[1].decayFactor * b[1].count;
      return scoreB - scoreA;
    });
    
    const keepCount = Math.floor(entries.length * 0.8);
    const toRemove = entries.slice(keepCount);
    
    for (const [key] of toRemove) {
      this.data.clicks.delete(key);
    }
  }

  applySessionDecay(): void {
    for (const pattern of this.data.clicks.values()) {
      pattern.confidence *= this.data.decayRate;
      pattern.decayFactor = this.calculateDecay(pattern);
    }
    this.data.sessionEvents = 0;
    this.data.sessionStart = Date.now();
    this.save();
  }

  predictNextClicks(topK: number = 5, context?: { url?: string; application?: string }): ClickPattern[] {
    let patterns = Array.from(this.data.clicks.values());
    
    if (context?.url) patterns = patterns.filter(p => p.url === context.url || !p.url);
    if (context?.application) patterns = patterns.filter(p => p.application === context.application || !p.application);

    const scored = patterns.map(p => ({
      ...p,
      score: p.confidence * p.decayFactor * p.count * (p.successRate || 1)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  predictTarget(currentX: number, currentY: number, context?: { url?: string; application?: string }): { x: number; y: number; confidence: number; source: string } | null {
    if (this.recentPositions.length < 5) return null;

    const recent = this.recentPositions.slice(-10);
    const timeDiff = recent[recent.length - 1].time - recent[0].time;
    
    if (timeDiff === 0) return null;

    const velocity = {
      x: (recent[recent.length - 1].x - recent[0].x) / timeDiff,
      y: (recent[recent.length - 1].y - recent[0].y) / timeDiff
    };

    const predictedX = currentX + velocity.x * 500;
    const predictedY = currentY + velocity.y * 500;

    const hotspots = this.predictNextClicks(10, context);
    const match = hotspots.find(h =>
      Math.abs(h.x - predictedX) < 100 &&
      Math.abs(h.y - predictedY) < 100
    );

    if (match) {
      const confidence = match.confidence * match.decayFactor;
      return { x: match.x, y: match.y, confidence, source: 'pattern_match' };
    }

    return { x: Math.round(predictedX), y: Math.round(predictedY), confidence: 0.3, source: 'velocity_extrapolation' };
  }

  predictNextInSequence(): { x: number; y: number; delay: number; confidence: number } | null {
    if (!this.config.enableTemporalLearning || this.clickSequence.length < 2) return null;

    const currentPattern = this.clickSequence.slice(-3).map((c, i, arr) => ({
      x: c.x,
      y: c.y,
      delay: i === 0 ? 0 : c.time - arr[i - 1].time
    }));

    const match = this.data.temporalPatterns.find(p => {
      const patternStart = p.sequence.slice(0, currentPattern.length);
      return patternStart.every((s, i) => 
        Math.abs(s.x - currentPattern[i].x) < this.config.gridSize &&
        Math.abs(s.y - currentPattern[i].y) < this.config.gridSize
      );
    });

    if (match && match.sequence.length > currentPattern.length) {
      const nextAction = match.sequence[currentPattern.length];
      const confidence = match.count / (this.data.temporalPatterns[0]?.count || 1);
      return { x: nextAction.x, y: nextAction.y, delay: nextAction.delay, confidence };
    }

    return null;
  }

  getHotspots(minCount: number = 3): ClickPattern[] {
    return Array.from(this.data.clicks.values())
      .filter(p => p.count >= minCount && p.confidence >= this.config.minPatternConfidence)
      .sort((a, b) => (b.count * b.confidence) - (a.count * a.confidence));
  }

  getContextPatterns(context: { url?: string; application?: string }): ClickPattern[] {
    return Array.from(this.data.clicks.values()).filter(p => {
      if (context.url && p.url !== context.url) return false;
      if (context.application && p.application !== context.application) return false;
      return true;
    }).sort((a, b) => b.count - a.count);
  }

  getMovementPatterns(topK: number = 10): MovementPattern[] {
    return this.data.movements.sort((a, b) => b.frequency - a.frequency).slice(0, topK);
  }

  getTemporalPatterns(topK: number = 10): TemporalPattern[] {
    return this.data.temporalPatterns.sort((a, b) => b.count - a.count).slice(0, topK);
  }

  getStats(): { totalEvents: number; sessionEvents: number; uniqueClicks: number; movementPatterns: number; temporalPatterns: number; avgConfidence: number; sessionDuration: number } {
    const confidences = Array.from(this.data.clicks.values()).map(p => p.confidence);
    const avgConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

    return {
      totalEvents: this.data.totalEvents,
      sessionEvents: this.data.sessionEvents,
      uniqueClicks: this.data.clicks.size,
      movementPatterns: this.data.movements.length,
      temporalPatterns: this.data.temporalPatterns.length,
      avgConfidence,
      sessionDuration: Date.now() - this.data.sessionStart
    };
  }

  exportPatterns(): string {
    return JSON.stringify({
      clicks: Object.fromEntries(this.data.clicks),
      movements: this.data.movements,
      temporalPatterns: this.data.temporalPatterns,
      stats: this.getStats()
    }, null, 2);
  }

  importPatterns(json: string): void {
    try {
      const parsed = JSON.parse(json);
      this.data.clicks = new Map(Object.entries(parsed.clicks || {}));
      this.data.movements = parsed.movements || [];
      this.data.temporalPatterns = parsed.temporalPatterns || [];
      this.data.totalEvents = parsed.stats?.totalEvents || this.data.totalEvents;
      this.save();
    } catch (e) {
      console.error('Failed to import patterns:', e);
    }
  }

  clear(): void {
    this.data.clicks.clear();
    this.data.movements = [];
    this.data.temporalPatterns = [];
    this.data.totalEvents = 0;
    this.data.sessionEvents = 0;
    this.recentPositions = [];
    this.clickSequence = [];
    this.save();
  }

  clearContext(context: { url?: string; application?: string }): number {
    let cleared = 0;
    for (const [key, pattern] of this.data.clicks.entries()) {
      if (context.url && pattern.url === context.url) {
        this.data.clicks.delete(key);
        cleared++;
      } else if (context.application && pattern.application === context.application) {
        this.data.clicks.delete(key);
        cleared++;
      }
    }
    this.save();
    return cleared;
  }
}

export default PatternLearner;

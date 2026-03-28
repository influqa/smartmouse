/**
 * Pattern Learner - Learns from user behavior patterns
 * Records and analyzes mouse movements, clicks, and timing
 * to predict user intent and automate repetitive actions
 */

import fs from 'fs';
import path from 'path';

interface ClickPattern {
  x: number;
  y: number;
  count: number;
  lastClicked: number;
  avgInterval: number;
  context?: string;
}

interface MovementPattern {
  startPos: { x: number; y: number };
  endPos: { x: number; y: number };
  duration: number;
  frequency: number;
}

interface PatternData {
  clicks: Map<string, ClickPattern>;
  movements: MovementPattern[];
  totalEvents: number;
  lastUpdate: number;
}

export class PatternLearner {
  private data: PatternData;
  private filePath: string;
  private recentPositions: { x: number; y: number; time: number }[] = [];
  
  constructor(dataDir: string = './data') {
    this.filePath = path.join(dataDir, 'patterns.json');
    this.data = {
      clicks: new Map(),
      movements: [],
      totalEvents: 0,
      lastUpdate: Date.now()
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
        this.data.totalEvents = parsed.totalEvents || 0;
      }
    } catch (e) {
      console.log('No existing pattern data, starting fresh');
    }
  }

  private save(): void {
    try {
      const obj = {
        clicks: Object.fromEntries(this.data.clicks),
        movements: this.data.movements,
        totalEvents: this.data.totalEvents,
        lastUpdate: this.data.lastUpdate
      };
      fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2));
    } catch (e) {
      console.error('Failed to save patterns:', e);
    }
  }

  // Record a click event
  recordClick(x: number, y: number, context?: string): void {
    // Grid position for pattern matching (50px grid)
    const gridX = Math.round(x / 50) * 50;
    const gridY = Math.round(y / 50) * 50;
    const key = `${gridX},${gridY}`;

    const existing = this.data.clicks.get(key);
    if (existing) {
      existing.count++;
      existing.lastClicked = Date.now();
      if (context) existing.context = context;
    } else {
      this.data.clicks.set(key, {
        x: gridX,
        y: gridY,
        count: 1,
        lastClicked: Date.now(),
        avgInterval: 0,
        context
      });
    }

    this.data.totalEvents++;
    this.data.lastUpdate = Date.now();
    this.save();
  }

  // Record a movement event
  recordMovement(x: number, y: number): void {
    this.recentPositions.push({ x, y, time: Date.now() });
    
    // Keep only last 100 positions
    if (this.recentPositions.length > 100) {
      this.recentPositions.shift();
    }

    // Analyze movement pattern when we have enough data
    if (this.recentPositions.length >= 20) {
      this.analyzeMovement();
    }
  }

  private analyzeMovement(): void {
    const start = this.recentPositions[0];
    const end = this.recentPositions[this.recentPositions.length - 1];
    const duration = end.time - start.time;

    // Find similar existing pattern
    const similar = this.data.movements.find(p => 
      Math.abs(p.startPos.x - start.x) < 100 &&
      Math.abs(p.startPos.y - start.y) < 100 &&
      Math.abs(p.endPos.x - end.x) < 100 &&
      Math.abs(p.endPos.y - end.y) < 100
    );

    if (similar) {
      similar.frequency++;
    } else {
      this.data.movements.push({
        startPos: { x: start.x, y: start.y },
        endPos: { x: end.x, y: end.y },
        duration,
        frequency: 1
      });
    }
  }

  // Predict likely next click positions
  predictNextClicks(topK: number = 5): ClickPattern[] {
    const sorted = Array.from(this.data.clicks.values())
      .sort((a, b) => b.count - a.count);
    
    return sorted.slice(0, topK);
  }

  // Predict target based on current trajectory
  predictTarget(currentX: number, currentY: number): { x: number; y: number; confidence: number } | null {
    if (this.recentPositions.length < 5) return null;

    const recent = this.recentPositions.slice(-10);
    const velocity = {
      x: (recent[recent.length - 1].x - recent[0].x) / (recent[recent.length - 1].time - recent[0].time),
      y: (recent[recent.length - 1].y - recent[0].y) / (recent[recent.length - 1].time - recent[0].time)
    };

    // Extrapolate position
    const predictedX = currentX + velocity.x * 500; // 500ms ahead
    const predictedY = currentY + velocity.y * 500;

    // Find matching hotspot
    const hotspots = this.predictNextClicks(10);
    const match = hotspots.find(h => 
      Math.abs(h.x - predictedX) < 100 &&
      Math.abs(h.y - predictedY) < 100
    );

    if (match) {
      const confidence = match.count / this.data.totalEvents;
      return { x: match.x, y: match.y, confidence };
    }

    return null;
  }

  // Get click hotspots for visualization
  getHotspots(): ClickPattern[] {
    return Array.from(this.data.clicks.values())
      .filter(p => p.count >= 3)
      .sort((a, b) => b.count - a.count);
  }

  // Get statistics
  getStats(): { totalEvents: number; uniqueClicks: number; patterns: number } {
    return {
      totalEvents: this.data.totalEvents,
      uniqueClicks: this.data.clicks.size,
      patterns: this.data.movements.length
    };
  }

  // Clear all learned patterns
  clear(): void {
    this.data.clicks.clear();
    this.data.movements = [];
    this.data.totalEvents = 0;
    this.recentPositions = [];
    this.save();
  }
}

export default PatternLearner;
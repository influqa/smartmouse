/**
 * SmartMouse Vision - LOCAL Screen Analysis
 * Advanced object detection using transformers.js - NO image data sent anywhere
 */

import screenshot from 'screenshot-desktop';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { env, pipeline, RawImage } from '@xenova/transformers';
import { workflowBuildContext } from './workflow-memory.ts';

// Allow remote models for initial download
env.allowRemoteModels = true;
env.allowLocalModels = true;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ZERO_SHOT_LABELS = [
  'button',
  'input field',
  'search box',
  'text box',
  'menu',
  'link',
  'icon',
  'address bar',
  'tab',
  'post',
  'like button',
  'play button',
  'profile icon'
];

type DetectorMode = 'zero-shot' | 'generic';
const runtimeIsBun = typeof (globalThis as any).Bun !== 'undefined';

export interface DetectedObject {
  id: string;
  label: string;
  text?: string;
  source: 'detector' | 'ocr';
  confidence: number;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  center: {
    x: number;
    y: number;
  };
}

export interface VisionResult {
  description: string;
  screen_size: { width: number; height: number };
  screenshot_path: string;
  timestamp: number;
  local_processing: boolean;
  detected_objects: DetectedObject[];
  error?: string;
}

let detector: any = null;
let detectorMode: DetectorMode | 'ocr-only' = 'generic';
let lastScreenWidth = 1920;
let lastScreenHeight = 1080;
let lastError: string | null = null;

function ensureScreenshotDir(): string {
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  return screenshotDir;
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeBox(box: any): { x: number; y: number; width: number; height: number } | null {
  if (!box) return null;

  const xmin = Number(box.xmin ?? box.x ?? 0);
  const ymin = Number(box.ymin ?? box.y ?? 0);
  const xmax = Number(box.xmax ?? (box.x !== undefined && box.width !== undefined ? box.x + box.width : 0));
  const ymax = Number(box.ymax ?? (box.y !== undefined && box.height !== undefined ? box.y + box.height : 0));

  const x = Math.max(0, Math.round(xmin));
  const y = Math.max(0, Math.round(ymin));
  const width = Math.max(0, Math.round(xmax - xmin));
  const height = Math.max(0, Math.round(ymax - ymin));

  if (width < 4 || height < 4) return null;

  return { x, y, width, height };
}

function scoreMatch(query: string, object: DetectedObject): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const candidates = [object.label, object.text || '']
    .map(value => value.toLowerCase().trim())
    .filter(Boolean);

  let score = 0;
  for (const candidate of candidates) {
    if (candidate === normalizedQuery) {
      score = Math.max(score, 1.0);
      continue;
    }
    if (candidate.includes(normalizedQuery) || normalizedQuery.includes(candidate)) {
      score = Math.max(score, 0.7);
      continue;
    }

    const queryWords = new Set(normalizedQuery.split(/\s+/));
    const candidateWords = new Set(candidate.split(/\s+/));
    let overlap = 0;
    for (const word of queryWords) {
      if (candidateWords.has(word)) overlap += 1;
    }
    if (overlap > 0) {
      score = Math.max(score, overlap / Math.max(queryWords.size, 1) * 0.6);
    }
  }

  return score;
}

function dedupeObjects(objects: DetectedObject[]): DetectedObject[] {
  const map = new Map<string, DetectedObject>();

  for (const object of objects) {
    const key = [
      object.source,
      object.label.toLowerCase(),
      Math.round(object.center.x / 3),
      Math.round(object.center.y / 3)
    ].join('|');

    const existing = map.get(key);
    if (!existing || object.confidence > existing.confidence) {
      map.set(key, object);
    }
  }

  const deduped = Array.from(map.values());
  deduped.forEach((object, index) => {
    object.id = `${object.source}_${index + 1}`;
  });
  return deduped;
}

function parseDetectorResults(outputs: any[]): DetectedObject[] {
  const results: DetectedObject[] = [];

  for (const output of outputs) {
    if (!output) continue;

    const label = String(output.label || 'object').trim();
    const box = normalizeBox(output.box);
    if (!box) continue;

    const center = {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2)
    };

    results.push({
      id: '',
      label,
      source: 'detector',
      confidence: clampConfidence(Number(output.score ?? output.confidence ?? 0)),
      box,
      center
    });
  }

  return results;
}

function parseTesseractTSV(tsv: string): DetectedObject[] {
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const header = lines[0].split('\t');
  const indexOf = (name: string) => header.indexOf(name);

  const leftIndex = indexOf('left');
  const topIndex = indexOf('top');
  const widthIndex = indexOf('width');
  const heightIndex = indexOf('height');
  const confIndex = indexOf('conf');
  const textIndex = indexOf('text');
  const levelIndex = indexOf('level');

  if ([leftIndex, topIndex, widthIndex, heightIndex, confIndex, textIndex].some(i => i < 0)) {
    return [];
  }

  const results: DetectedObject[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const columns = lines[lineIndex].split('\t');
    if (columns.length <= textIndex) continue;

    const level = levelIndex >= 0 ? Number(columns[levelIndex]) : 5;
    if (levelIndex >= 0 && level !== 5) continue;

    const text = (columns[textIndex] || '').trim();
    if (!text) continue;

    const confidence = Number(columns[confIndex] ?? -1);
    if (Number.isNaN(confidence) || confidence < 35) continue;

    const x = Number(columns[leftIndex]);
    const y = Number(columns[topIndex]);
    const width = Number(columns[widthIndex]);
    const height = Number(columns[heightIndex]);

    if ([x, y, width, height].some(Number.isNaN)) continue;
    if (width < 4 || height < 4) continue;

    const center = {
      x: Math.round(x + width / 2),
      y: Math.round(y + height / 2)
    };

    results.push({
      id: '',
      label: `text:${text.toLowerCase()}`,
      text,
      source: 'ocr',
      confidence: clampConfidence(confidence / 100),
      box: {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height)
      },
      center
    });
  }

  return results;
}

function getLocalOCRDetections(imagePath: string): DetectedObject[] {
  try {
    const result = spawnSync('tesseract', [imagePath, 'stdout', '--psm', '6', 'tsv'], {
      encoding: 'utf-8',
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10
    });

    if (result.error || result.status !== 0 || !result.stdout) {
      return [];
    }

    return parseTesseractTSV(result.stdout);
  } catch {
    return [];
  }
}

/**
 * Initialize the vision system with object detection model
 */
export async function initVision(): Promise<boolean> {
  console.log('\n===========================================');
  console.log('🔄 Loading vision model...');

  if (runtimeIsBun) {
    detector = null;
    detectorMode = 'ocr-only';
    lastError = 'Transformers image pipelines are unstable on Bun/Windows in this environment. Running local OCR-only mode.';
    console.log('⚠️ Transformers object detection disabled for Bun runtime');
    console.log('✅ Vision ready in OCR-only local mode');
    console.log('===========================================\n');
    return true;
  }
  
  try {
    try {
      detector = await pipeline('zero-shot-object-detection', 'Xenova/owlv2-base-patch16-ensemble');
      detectorMode = 'zero-shot';
      console.log('✅ Vision model loaded: Xenova/owlv2-base-patch16-ensemble (zero-shot)');
      console.log('===========================================\n');
      return true;
    } catch (zeroShotError: any) {
      console.log(`⚠️ Zero-shot model unavailable: ${zeroShotError?.message || String(zeroShotError)}`);
      console.log('🔄 Falling back to generic detector...');
    }

    detector = await pipeline('object-detection', 'Xenova/detr-resnet-50');
    detectorMode = 'generic';
    console.log('✅ Vision model loaded: Xenova/detr-resnet-50 (generic)');
    console.log('===========================================\n');
    return true;
  } catch (error: any) {
    lastError = `Failed to load vision model: ${error.message}`;
    console.error(`❌ ${lastError}`);
    console.log('===========================================\n');
    return false;
  }
}

/**
 * Get last error
 */
export function getLastError(): string | null {
  return lastError;
}

/**
 * Take screenshot
 */
export async function takeScreenshot(): Promise<{ path: string; width: number; height: number; buffer: Buffer }> {
  const tmpDir = ensureScreenshotDir();

  const savePath = path.join(tmpDir, `screen_${Date.now()}.png`);
  const imgBuffer = await screenshot({ format: 'png' });
  fs.writeFileSync(savePath, imgBuffer);

  // Get dimensions from PNG header
  const width = imgBuffer.readUInt32BE(16);
  const height = imgBuffer.readUInt32BE(20);

  return { path: savePath, width, height, buffer: imgBuffer };
}

/**
 * Analyze screen - returns actual object detection results
 */
export async function analyzeScreen(): Promise<VisionResult> {
  try {
    const screenshotInfo = await takeScreenshot();
    console.log(`📸 Screenshot: ${screenshotInfo.width}x${screenshotInfo.height}`);

    lastScreenWidth = screenshotInfo.width;
    lastScreenHeight = screenshotInfo.height;

    // Check if detector is initialized
    if (!detector && detectorMode !== 'ocr-only') {
      console.log('🔄 Loading vision model...');
      await initVision();
    }

    let modelDetections: DetectedObject[] = [];
    if (detector) {
      try {
        const rawImage = await RawImage.read(screenshotInfo.path);
        console.log(`🔍 Performing ${detectorMode} object detection...`);
        let detectorOutputs: any[] = [];

        if (detectorMode === 'zero-shot') {
          detectorOutputs = await detector(rawImage, ZERO_SHOT_LABELS, { threshold: 0.08 });
        } else {
          detectorOutputs = await detector(rawImage, { threshold: 0.2 });
        }

        modelDetections = parseDetectorResults(Array.isArray(detectorOutputs) ? detectorOutputs : []);
      } catch (detectorError: any) {
        const rawMessage = detectorError?.message || String(detectorError);
        const sanitized = rawMessage.length > 240 ? `${rawMessage.slice(0, 240)}...` : rawMessage;
        lastError = `Object detection unavailable, switched to OCR-only mode: ${sanitized}`;
        console.log(`⚠️ ${lastError}`);
        detector = null;
        detectorMode = 'ocr-only';
      }
    }

    // Local OCR for reliable clickable text coordinates
    console.log('📝 Running local OCR (tesseract if available)...');
    const ocrDetections = getLocalOCRDetections(screenshotInfo.path);

    const detectedObjects = dedupeObjects([...modelDetections, ...ocrDetections])
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 400);

    const description = `Screen ${screenshotInfo.width}x${screenshotInfo.height}. Objects: ${detectedObjects.length} (mode ${detectorMode}, model ${modelDetections.length}, ocr ${ocrDetections.length})`;

    console.log(`👁️ Vision: Found ${detectedObjects.length} objects (model=${modelDetections.length}, ocr=${ocrDetections.length})`);

    // Save detailed JSON with object positions
    const detailedJson = {
      screen_info: {
        width: screenshotInfo.width,
        height: screenshotInfo.height,
        timestamp: Date.now(),
        screenshot_path: screenshotInfo.path
      },
      detector_mode: detectorMode,
      local_processing: true,
      detected_objects: detectedObjects.map(obj => ({
        id: obj.id,
        label: obj.label,
        text: obj.text || null,
        source: obj.source,
        confidence: obj.confidence,
        center_x: obj.center.x,
        center_y: obj.center.y,
        bounding_box: {
          x: obj.box.x,
          y: obj.box.y,
          width: obj.box.width,
          height: obj.box.height
        },
        center_coordinates: [obj.center.x, obj.center.y],
        bounding_box_coordinates: [obj.box.x, obj.box.y, obj.box.x + obj.box.width, obj.box.y + obj.box.height]
      }))
    };

    // Write detailed JSON to file
    const jsonPath = path.join(ensureScreenshotDir(), `detection_${Date.now()}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(detailedJson, null, 2));

    return {
      description,
      screen_size: { width: screenshotInfo.width, height: screenshotInfo.height },
      screenshot_path: screenshotInfo.path,
      timestamp: Date.now(),
      local_processing: true,
      detected_objects: detectedObjects
    };

  } catch (error: any) {
    lastError = `Vision analysis error: ${error.message}`;
    console.error(`❌ ${lastError}`);

    return {
      description: `Screen analysis failed: ${error.message}`,
      screen_size: { width: lastScreenWidth, height: lastScreenHeight },
      screenshot_path: '',
      timestamp: Date.now(),
      local_processing: false,
      detected_objects: [],
      error: error.message
    };
  }
}

/**
 * Find specific UI element by label
 */
export function findElement(objects: DetectedObject[], label: string): DetectedObject | null {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return null;

  const scored = objects
    .map(object => ({ object, score: scoreMatch(normalized, object) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.object.confidence - a.object.confidence;
    });

  return scored[0]?.object || null;
}

/**
 * Find all matching UI elements
 */
export function findElements(objects: DetectedObject[], label: string): DetectedObject[] {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return [];

  return objects
    .map(object => ({ object, score: scoreMatch(normalized, object) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.object.confidence - a.object.confidence;
    })
    .map(entry => entry.object);
}

export function isVisionReady(): boolean {
  return detector !== null || detectorMode === 'ocr-only';
}

export default {
  initVision,
  getLastError,
  takeScreenshot,
  analyzeScreen,
  isVisionReady,
  findElement,
  findElements
};

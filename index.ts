/**
 * SmartMouse v2.0 - TypeScript/Node.js
 * LOCAL Vision with Transformers.js + configurable AI Brain
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
// @ts-ignore Bun resolves TypeScript modules directly during local runtime.
import { initVision, analyzeScreen, isVisionReady, getLastError, findElement, findElements, type DetectedObject } from './vision.ts';
// @ts-ignore Bun resolves TypeScript modules directly during local runtime.
import { loadConfig, reloadConfig, isConfigured, decideAction, clearHistory, getIteration, trackAction, getSessionLinks, addSessionLink, type SessionLink, getApiError, getKeyboardOnlySystemPrompt, callAPI } from './brain.ts';
// @ts-ignore Bun resolves TypeScript modules directly during local runtime.
import { executeAction, captureActiveChromeUrl, getCursorPosition, sleep } from './actions.ts';
// @ts-ignore Bun resolves TypeScript modules directly during local runtime.
import {
  beginWorkflowRun,
  deriveWorkflowSection,
  getWorkflowPromptHints,
  getWorkflowReplaySuggestion,
  recordWorkflowActionOutcome,
  finalizeWorkflowRun,
  getWorkflowMemoryStats,
  type WorkflowActionSource
} from './workflow-memory.ts';

const args = process.argv.slice(2);
const portArg = args.find(a => a.startsWith('--port='));
const PORT = portArg ? parseInt(portArg.split('=')[1]) : 7901;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isRunning = false;
let currentGoal = '';
let shouldStop = false;
let currentRunId: string | null = null;

type TaskRunStatus = 'completed' | 'stopped' | 'max_iterations' | 'failed';
type RunProgressStatus = 'idle' | 'running' | TaskRunStatus;

interface TaskReport {
  run_id: string;
  requested_by_agent: string | null;
  goal: string;
  target_comments: number | null;
  estimated_comments_submitted: number;
  status: TaskRunStatus;
  started_at: number;
  finished_at: number;
  iterations: number;
  actions_executed: number;
  completion_reason: string;
  final_url: string | null;
  done_link: string | null;
  chrome_opened: boolean;
  chrome_closed: boolean;
  links_interacted: number;
  workflow_memory_sections_touched: number;
  workflow_memory_sections_saved: number;
  workflow_memory_replay_steps_used: number;
  workflow_memory_replay_steps_succeeded: number;
  workflow_memory_replay_steps_failed: number;
  required_comments_before_done: number;
  comment_submit_attempts: number;
  comment_submit_successes: number;
  comment_submit_failures: number;
  duplicate_comments_blocked: number;
  done_actions_blocked: number;
  grace_iterations_added: number;
  fallback_submit_overrides: number;
  prepared_comment_autofills: number;
}

interface RunProgress {
  run_id: string | null;
  status: RunProgressStatus;
  goal: string | null;
  started_at: number | null;
  finished_at: number | null;
  iteration: number;
  iteration_limit: number | null;
  actions_executed: number;
  target_comments: number | null;
  required_comments_before_done: number;
  estimated_comments_submitted: number;
  pending_comment_draft: boolean;
  pending_comment_draft_iteration: number | null;
  comment_input_focused: boolean;
  last_comment_focus_iteration: number | null;
  comment_submit_attempts: number;
  comment_submit_successes: number;
  comment_submit_failures: number;
  duplicate_comments_blocked: number;
  done_actions_blocked: number;
  grace_iterations_added: number;
  fallback_submit_overrides: number;
  prepared_comment_ready: boolean;
  prepared_comment_autofills: number;
  completion_reason: string | null;
  last_action: string | null;
  last_action_reasoning: string | null;
  last_action_at: number | null;
  note: string | null;
  last_update_at: number;
}

type RecorderActionName =
  | 'click'
  | 'double_click'
  | 'right_click'
  | 'type'
  | 'press'
  | 'hotkey'
  | 'scroll'
  | 'wait'
  | 'open_url'
  | 'open_app'
  | 'move';

interface RecorderStep {
  action: RecorderActionName;
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  combo?: string[];
  direction?: 'up' | 'down';
  amount?: number;
  seconds?: number;
  url?: string;
  app_name?: string;
  delay_before_ms?: number;
  note?: string;
}

interface RecorderTemplate {
  name: string;
  title: string;
  description?: string;
  open_chrome_first?: boolean;
  start_delay_seconds?: number;
  stop_on_error?: boolean;
  ai_enhanced?: boolean;
  ai_model?: string;
  ai_summary?: string;
  ai_updated_at?: number;
  created_at: number;
  updated_at: number;
  steps: RecorderStep[];
}

interface RecorderStore {
  version: number;
  updated_at: number;
  templates: Record<string, RecorderTemplate>;
}

interface LiveRecorderConfig {
  name: string;
  title: string;
  description?: string;
  open_chrome_first: boolean;
  start_delay_seconds: number;
  stop_on_error: boolean;
  default_delay_ms: number;
  initial_ignore_ms: number;
}

interface LiveRecorderState {
  active: boolean;
  started_at: number | null;
  event_count: number;
  process: ChildProcessWithoutNullStreams | null;
  config: LiveRecorderConfig | null;
  steps: RecorderStep[];
  last_event_at: number | null;
  ignore_events_before: number;
  parse_errors: number;
  raw_log_tail: string[];
  ai_processing: boolean;
  ai_last_status: string | null;
  ai_last_error: string | null;
  ai_last_model: string | null;
}

const COMMENT_COUNT_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12
};

let lastTaskReport: TaskReport | null = null;
const reportsByRunId = new Map<string, TaskReport>();
const MAX_STORED_REPORTS = 100;
const processStartedAt = Date.now();
let runStartedAt: number | null = null;
let currentMaxIterations: number | null = null;
let lastActivityAt = processStartedAt;
let lastIterationAt: number | null = null;
let currentRunProgress: RunProgress = createInitialRunProgress();

const app = express();
app.use(cors());
app.use(express.json());
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON body',
      details: error.message
    });
  }

  return next(error);
});

function markActivity(): void {
  lastActivityAt = Date.now();
}

function markIterationProgress(): void {
  lastIterationAt = Date.now();
  markActivity();
}

function createRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAgentId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseMaxIterations(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
}

function createInitialRunProgress(): RunProgress {
  return {
    run_id: null,
    status: 'idle',
    goal: null,
    started_at: null,
    finished_at: null,
    iteration: 0,
    iteration_limit: null,
    actions_executed: 0,
    target_comments: null,
    required_comments_before_done: 0,
    estimated_comments_submitted: 0,
    pending_comment_draft: false,
    pending_comment_draft_iteration: null,
    comment_input_focused: false,
    last_comment_focus_iteration: null,
    comment_submit_attempts: 0,
    comment_submit_successes: 0,
    comment_submit_failures: 0,
    duplicate_comments_blocked: 0,
    done_actions_blocked: 0,
    grace_iterations_added: 0,
    fallback_submit_overrides: 0,
    prepared_comment_ready: false,
    prepared_comment_autofills: 0,
    completion_reason: null,
    last_action: null,
    last_action_reasoning: null,
    last_action_at: null,
    note: null,
    last_update_at: Date.now()
  };
}

function updateRunProgress(patch: Partial<RunProgress>): void {
  currentRunProgress = {
    ...currentRunProgress,
    ...patch,
    last_update_at: Date.now()
  };
}

function parseCommentTarget(goal: string): number | null {
  const countToken = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|single)';
  const singleCountToken = '(a|an|single)';
  const patterns = [
    new RegExp(`\\bleave\\s+${countToken}\\s+[^.\\n]*comments?\\b`, 'i'),
    new RegExp(`\\bpost\\s+${countToken}\\s+[^.\\n]*comments?\\b`, 'i'),
    new RegExp(`\\bwrite\\s+${countToken}\\s+[^.\\n]*comments?\\b`, 'i'),
    new RegExp(`\\badd\\s+${countToken}\\s+[^.\\n]*comments?\\b`, 'i'),
    new RegExp(`\\bexactly\\s+${countToken}\\s+[^.\\n]*comments?\\b`, 'i'),
    new RegExp(`\\b${countToken}\\s+[^.\\n]*comments?\\b`, 'i'),
    new RegExp(`\\bleave\\s+${singleCountToken}\\s+[^.\\n]*comments?\\b`, 'i'),
    new RegExp(`\\bpost\\s+${singleCountToken}\\s+[^.\\n]*comments?\\b`, 'i'),
    new RegExp(`\\bwrite\\s+${singleCountToken}\\s+[^.\\n]*comments?\\b`, 'i'),
    new RegExp(`\\badd\\s+${singleCountToken}\\s+[^.\\n]*comments?\\b`, 'i'),
    new RegExp(`\\bsend\\s+${countToken}\\s+[^.\\n]*(?:dms?|direct\\s+messages?|messages?)\\b`, 'i'),
    new RegExp(`\\bmessage\\s+${countToken}\\s+[^.\\n]*(?:influencers?|creators?|people|profiles?)\\b`, 'i'),
    new RegExp(`\\bcontact\\s+${countToken}\\s+[^.\\n]*(?:influencers?|creators?|people|profiles?)\\b`, 'i'),
    new RegExp(`\\breach\\s+out\\s+to\\s+${countToken}\\s+[^.\\n]*(?:influencers?|creators?|people|profiles?)\\b`, 'i'),
    new RegExp(`\\bsend\\s+${singleCountToken}\\s+[^.\\n]*(?:dm|direct\\s+message|message)\\b`, 'i'),
    new RegExp(`\\bmessage\\s+${singleCountToken}\\s+[^.\\n]*(?:influencer|creator|person|profile)\\b`, 'i'),
    new RegExp(`\\bcontact\\s+${singleCountToken}\\s+[^.\\n]*(?:influencer|creator|person|profile)\\b`, 'i')
  ];

  const parseCount = (rawCount: string): number | null => {
    const normalized = rawCount.trim().toLowerCase();
    if (normalized === 'a' || normalized === 'an' || normalized === 'single') {
      return 1;
    }

    const mapped = COMMENT_COUNT_WORDS[normalized];
    if (mapped) return mapped;

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    const integerValue = Math.floor(parsed);
    return integerValue > 0 ? integerValue : null;
  };

  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (!match) continue;
    const parsedCount = parseCount(match[1]);
    if (parsedCount !== null) return parsedCount;
  }

  return null;
}

function extractGoalSearchQuery(goal: string): string | null {
  const quotedMatch = goal.match(/\bsearch(?:\s+for)?\s+["']([^"']+)["']/i);
  if (quotedMatch && quotedMatch[1].trim().length > 0) {
    return quotedMatch[1].trim();
  }

  const unquotedMatch = goal.match(/\bsearch(?:\s+for)?\s+([^,.;\n]+)/i);
  if (unquotedMatch && unquotedMatch[1].trim().length > 0) {
    return unquotedMatch[1].trim();
  }

  return null;
}

function buildBootstrapUrl(goal: string, goalSite: string | null): string | null {
  const explicitUrlMatch = goal.match(/https?:\/\/[^\s"')]+/i);
  if (explicitUrlMatch) {
    return explicitUrlMatch[0].trim();
  }

  if (!goalSite) return null;

  const query = extractGoalSearchQuery(goal);
  const encodedQuery = query ? encodeURIComponent(query) : null;

  if (goalSite === 'instagram') {
    return encodedQuery
      ? `https://www.instagram.com/explore/search/keyword/?q=${encodedQuery}`
      : 'https://www.instagram.com/';
  }

  if (goalSite === 'tiktok') {
    return encodedQuery
      ? `https://www.tiktok.com/search?q=${encodedQuery}`
      : 'https://www.tiktok.com/';
  }

  if (goalSite === 'youtube') {
    return encodedQuery
      ? `https://www.youtube.com/results?search_query=${encodedQuery}`
      : 'https://www.youtube.com/';
  }

  return null;
}

const COMMENT_CONTEXT_PATTERN = /(comment|comments|reply|replies|message|messages|dm|direct\s*message|inbox|chat|conversation|add\s*comment|write\s*a\s*comment|say\s*something|send\s*message)/i;
const COMMENT_SUBMIT_STRONG_PATTERN = /\b(post|publish|send|submit)\b/i;
const COMMENT_REPLY_PATTERN = /\breply\b/i;
const COMMENT_INPUT_HINT_PATTERN = /(add\s+(a\s+)?(public\s+)?comment|write\s+(a\s+)?comment|leave\s+(a\s+)?comment|say\s+something|comment\s+(input|field|box|section)|type\s+(a\s+)?comment|view\s+repl(?:y|ies)|show\s+repl(?:y|ies)|message\s+(input|field|box|section)|type\s+(a\s+)?message|write\s+(a\s+)?message|send\s+(a\s+)?message|direct\s*message|dm\s+(input|field|box|section)|chat\s+(input|field|box|section))/i;
const COMMENT_POST_GOAL_PATTERN = /\b(leave|post|write|add|publish|send|message|contact|reply|respond|reach\s+out)\b[^.\n]{0,160}\b(comments?|repl(?:y|ies)|messages?|dms?|direct\s+messages?|inbox|influencers?)\b/i;
const COMMENT_AUTH_BLOCK_PATTERN = /(sign[\s-]?in|log[\s-]?in|authentication|auth required|requires (?:you to )?sign[\s-]?in|not (?:logged|authenticated))/i;
const COMMENT_DRAFT_MAX_PENDING_ITERATIONS = 4;
const COMMENT_FINISH_GRACE_BATCH = 3;
const COMMENT_FINISH_GRACE_MAX = 12;
const COMMENT_SUBMIT_FALLBACK_DEFERRALS = 1;
const COMMENT_PREPARED_DRAFT_MAX_AGE = 15;
const SOCIAL_SITE_HOSTS: Record<string, string[]> = {
  instagram: ['instagram.com'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  facebook: ['facebook.com'],
  linkedin: ['linkedin.com'],
  x: ['x.com', 'twitter.com']
};

function recorderFilePath(): string {
  return path.join(__dirname, 'logs', 'recorded-workflows.json');
}

function recorderScriptPath(): string {
  return path.join(__dirname, 'scripts', 'live-input-recorder.ps1');
}

const liveRecorder: LiveRecorderState = {
  active: false,
  started_at: null,
  event_count: 0,
  process: null,
  config: null,
  steps: [],
  last_event_at: null,
  ignore_events_before: 0,
  parse_errors: 0,
  raw_log_tail: [],
  ai_processing: false,
  ai_last_status: null,
  ai_last_error: null,
  ai_last_model: null
};

function loadRecorderStore(): RecorderStore {
  try {
    const filePath = recorderFilePath();
    if (!fs.existsSync(filePath)) {
      return {
        version: 1,
        updated_at: Date.now(),
        templates: {}
      };
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<RecorderStore>;
    return {
      version: 1,
      updated_at: Number(parsed.updated_at || Date.now()),
      templates: parsed.templates && typeof parsed.templates === 'object' ? parsed.templates as Record<string, RecorderTemplate> : {}
    };
  } catch {
    return {
      version: 1,
      updated_at: Date.now(),
      templates: {}
    };
  }
}

function saveRecorderStore(store: RecorderStore): void {
  const filePath = recorderFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');
}

function sanitizeTemplateName(rawName: unknown): string {
  const base = String(rawName || '').trim().toLowerCase();
  const normalized = base.replace(/[^a-z0-9-_]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  return normalized.slice(0, 80);
}

function interpolateTemplateValue(value: string, vars: Record<string, unknown>): string {
  return value.replace(/\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}/g, (_match, key) => {
    const replacement = vars[key];
    return replacement === undefined || replacement === null ? '' : String(replacement);
  });
}

function interpolateStep(step: RecorderStep, vars: Record<string, unknown>): RecorderStep {
  return {
    ...step,
    text: typeof step.text === 'string' ? interpolateTemplateValue(step.text, vars) : step.text,
    url: typeof step.url === 'string' ? interpolateTemplateValue(step.url, vars) : step.url,
    app_name: typeof step.app_name === 'string' ? interpolateTemplateValue(step.app_name, vars) : step.app_name,
    key: typeof step.key === 'string' ? interpolateTemplateValue(step.key, vars) : step.key,
    combo: Array.isArray(step.combo)
      ? step.combo.map((part) => interpolateTemplateValue(String(part), vars))
      : step.combo
  };
}

function pushLiveRecorderLog(message: string): void {
  liveRecorder.raw_log_tail.push(`[${new Date().toISOString()}] ${message}`);
  if (liveRecorder.raw_log_tail.length > 20) {
    liveRecorder.raw_log_tail = liveRecorder.raw_log_tail.slice(-20);
  }
}

function normalizeRecordedKeyName(rawKey: string): string {
  const lower = rawKey.toLowerCase();
  const map: Record<string, string> = {
    return: 'enter',
    esc: 'escape',
    spacebar: 'space',
    space: 'space',
    back: 'backspace'
  };
  return map[lower] || lower;
}

function applyShiftToPrintableKey(key: string): string {
  if (key.length === 1 && /^[a-z]$/.test(key)) {
    return key.toUpperCase();
  }

  const shiftedMap: Record<string, string> = {
    '1': '!',
    '2': '@',
    '3': '#',
    '4': '$',
    '5': '%',
    '6': '^',
    '7': '&',
    '8': '*',
    '9': '(',
    '0': ')',
    '-': '_',
    '=': '+',
    '[': '{',
    ']': '}',
    ';': ':',
    "'": '"',
    ',': '<',
    '.': '>',
    '/': '?',
    '\\': '|',
    '`': '~'
  };

  return shiftedMap[key] || key;
}

const LIVE_TYPE_MERGE_MAX_GAP_MS = 1400;

const RECORDER_ALLOWED_ACTIONS = new Set<RecorderActionName>([
  'click',
  'double_click',
  'right_click',
  'type',
  'press',
  'hotkey',
  'scroll',
  'wait',
  'open_url',
  'open_app',
  'move'
]);

function sanitizeRecorderStep(raw: any): RecorderStep | null {
  const action = String(raw?.action || '').trim().toLowerCase() as RecorderActionName;
  if (!RECORDER_ALLOWED_ACTIONS.has(action)) return null;

  return {
    action,
    x: Number.isFinite(raw?.x) ? Number(raw.x) : undefined,
    y: Number.isFinite(raw?.y) ? Number(raw.y) : undefined,
    text: typeof raw?.text === 'string' ? raw.text : undefined,
    key: typeof raw?.key === 'string' ? raw.key : undefined,
    combo: Array.isArray(raw?.combo) ? raw.combo.map((part: any) => String(part)) : undefined,
    direction: raw?.direction === 'up' || raw?.direction === 'down' ? raw.direction : undefined,
    amount: Number.isFinite(raw?.amount) ? Number(raw.amount) : undefined,
    seconds: Number.isFinite(raw?.seconds) ? Number(raw.seconds) : undefined,
    url: typeof raw?.url === 'string' ? raw.url : undefined,
    app_name: typeof raw?.app_name === 'string' ? raw.app_name : undefined,
    delay_before_ms: Number.isFinite(raw?.delay_before_ms) ? Math.max(0, Number(raw.delay_before_ms)) : undefined,
    note: typeof raw?.note === 'string' ? raw.note : undefined
  };
}

function extractJsonObjectFromText(content: string): any | null {
  const trimmed = String(content || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue to block extraction
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  return null;
}

async function callRecorderModel(messages: Array<{ role: 'system' | 'user'; content: string }>, maxTokens = 1400): Promise<{ ok: true; content: string; model: string } | { ok: false; error: string }> {
  const cfg = loadConfig();
  if (!cfg.api_key) {
    return { ok: false, error: 'API key not configured' };
  }

  try {
    const model = cfg.model;
    const response = await fetch(`${cfg.api_base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown API error');
      return { ok: false, error: `API ${response.status}: ${errorText}` };
    }

    const payload = await response.json() as any;
    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      return { ok: false, error: 'Model returned empty content' };
    }

    return { ok: true, content, model };
  } catch (error: any) {
    return { ok: false, error: String(error?.message || error) };
  }
}

async function enhanceRecorderTemplateWithAI(template: RecorderTemplate): Promise<{ ok: true; template: RecorderTemplate; model: string; summary: string } | { ok: false; error: string }> {
  const system = [
    'You are improving desktop automation recording JSON for future agent reuse.',
    'Return ONLY valid JSON object with fields: title, description, steps, summary.',
    'Keep steps deterministic and executable with existing action schema.',
    'Merge noisy typing into meaningful text chunks.',
    'When obvious, replace reusable search/query text with {{keyword}}.',
    'When obvious, replace reusable comment body text with {{comment_text}}.',
    'Keep click coordinates unless clearly redundant.',
    'Never invent actions outside allowed set: click,double_click,right_click,type,press,hotkey,scroll,wait,open_url,open_app,move.'
  ].join(' ');

  const user = JSON.stringify({
    task_title: template.title,
    task_description: template.description || '',
    open_chrome_first: template.open_chrome_first !== false,
    start_delay_seconds: template.start_delay_seconds || 0,
    stop_on_error: template.stop_on_error !== false,
    steps: template.steps
  });

  const result = await callRecorderModel([
    { role: 'system', content: system },
    { role: 'user', content: `Improve this recording template JSON:\n${user}` }
  ]);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const parsed = extractJsonObjectFromText(result.content);
  if (!parsed || !Array.isArray(parsed.steps)) {
    return { ok: false, error: 'AI response did not include valid steps array' };
  }

  const sanitizedSteps = parsed.steps
    .map((step: any) => sanitizeRecorderStep(step))
    .filter((step: RecorderStep | null): step is RecorderStep => !!step);

  if (sanitizedSteps.length === 0) {
    return { ok: false, error: 'AI response produced no valid steps' };
  }

  const now = Date.now();
  const enhancedTemplate: RecorderTemplate = {
    ...template,
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : template.title,
    description: typeof parsed.description === 'string' ? parsed.description : (template.description || ''),
    ai_enhanced: true,
    ai_model: result.model,
    ai_summary: typeof parsed.summary === 'string' ? parsed.summary : 'AI-normalized recording template',
    ai_updated_at: now,
    updated_at: now,
    steps: annotateRecordedIntent(compactRecordedSteps(sanitizedSteps))
  };

  return {
    ok: true,
    template: enhancedTemplate,
    model: result.model,
    summary: enhancedTemplate.ai_summary || 'AI-normalized recording template'
  };
}

function persistRecorderTemplate(template: RecorderTemplate): void {
  const store = loadRecorderStore();
  store.templates[template.name] = template;
  store.updated_at = Date.now();
  saveRecorderStore(store);
}

async function maybeEnhanceSavedTemplateWithAI(template: RecorderTemplate, source: 'endpoint' | 'hotkey'): Promise<RecorderTemplate> {
  liveRecorder.ai_processing = true;
  liveRecorder.ai_last_status = `processing (${source})`;
  liveRecorder.ai_last_error = null;

  const enhanced = await enhanceRecorderTemplateWithAI(template);

  liveRecorder.ai_processing = false;
  if (!enhanced.ok) {
    liveRecorder.ai_last_status = 'failed';
    liveRecorder.ai_last_error = enhanced.error;
    pushLiveRecorderLog(`ai-enhance-failed ${enhanced.error}`);
    return template;
  }

  liveRecorder.ai_last_status = 'completed';
  liveRecorder.ai_last_model = enhanced.model;
  liveRecorder.ai_last_error = null;
  pushLiveRecorderLog(`ai-enhance-completed model=${enhanced.model}`);
  persistRecorderTemplate(enhanced.template);
  return enhanced.template;
}

function compactRecordedSteps(steps: RecorderStep[]): RecorderStep[] {
  const compacted: RecorderStep[] = [];
  let typeBuffer: RecorderStep | null = null;

  const flushTypeBuffer = () => {
    if (typeBuffer) {
      compacted.push(typeBuffer);
      typeBuffer = null;
    }
  };

  for (const step of steps) {
    const isTypeStep = step.action === 'type' && typeof step.text === 'string' && step.text.length > 0;
    if (!isTypeStep) {
      flushTypeBuffer();
      compacted.push({ ...step });
      continue;
    }

    if (!typeBuffer) {
      typeBuffer = { ...step };
      continue;
    }

    const gapMs = Math.max(0, Number(step.delay_before_ms || 0));
    if (gapMs <= LIVE_TYPE_MERGE_MAX_GAP_MS) {
      typeBuffer.text = `${typeBuffer.text || ''}${step.text || ''}`;
      continue;
    }

    flushTypeBuffer();
    typeBuffer = { ...step };
  }

  flushTypeBuffer();
  return compacted;
}

function annotateRecordedIntent(steps: RecorderStep[]): RecorderStep[] {
  const annotated = steps.map((step) => ({ ...step }));

  for (let i = 0; i < annotated.length; i++) {
    const prev = annotated[i - 1];
    const current = annotated[i];
    const next = annotated[i + 1];

    const looksLikeSearchQuery =
      current?.action === 'type'
      && typeof current.text === 'string'
      && current.text.trim().length > 0
      && prev?.action === 'click'
      && next?.action === 'press'
      && String(next.key || '').toLowerCase() === 'enter';

    if (looksLikeSearchQuery) {
      if (!current.note) current.note = 'search_query_candidate';
      if (!next.note) next.note = 'submit_search';
    }
  }

  return annotated;
}

function appendRecordedStepFromEvent(event: any): void {
  if (!liveRecorder.active) return;

  const kind = String(event?.kind || '').toLowerCase();
  if (kind === 'control' && String(event?.action || '').toLowerCase() === 'stop_and_save') {
    pushLiveRecorderLog('stop requested by hotkey');
    const stopResult = stopLiveRecorder(true);
    if (stopResult.success && stopResult.template) {
      void maybeEnhanceSavedTemplateWithAI(stopResult.template, 'hotkey');
    }
    return;
  }

  const now = Number(event?.timestamp || Date.now());
  if (now <= liveRecorder.ignore_events_before) {
    return;
  }

  const defaultDelayMs = Math.max(0, liveRecorder.config?.default_delay_ms || 0);
  const computedDelay = liveRecorder.last_event_at ? Math.max(0, now - liveRecorder.last_event_at) : defaultDelayMs;
  liveRecorder.last_event_at = now;

  let step: RecorderStep | null = null;

  if (kind === 'mouse_click') {
    const button = String(event?.button || 'left').toLowerCase();
    step = {
      action: button === 'right' ? 'right_click' : 'click',
      x: Number.isFinite(event?.x) ? Number(event.x) : undefined,
      y: Number.isFinite(event?.y) ? Number(event.y) : undefined
    };
  } else if (kind === 'key') {
    let key = normalizeRecordedKeyName(String(event?.key || ''));
    const ctrl = Boolean(event?.ctrl);
    const alt = Boolean(event?.alt);
    const shift = Boolean(event?.shift);

    if (!key) return;

    const printable = key.length === 1 || key === 'space';
    if (printable && shift) {
      key = key === 'space' ? ' ' : applyShiftToPrintableKey(key);
    }

    if (ctrl || alt) {
      const combo: string[] = [];
      if (ctrl) combo.push('ctrl');
      if (alt) combo.push('alt');
      if (shift) combo.push('shift');
      combo.push(key);
      step = { action: 'hotkey', combo };
    } else if (printable) {
      const textKey = key === 'space' ? ' ' : key;
      const last = liveRecorder.steps[liveRecorder.steps.length - 1];
      if (
        last
        && last.action === 'type'
        && typeof last.text === 'string'
        && computedDelay <= LIVE_TYPE_MERGE_MAX_GAP_MS
      ) {
        last.text += textKey;
        return;
      }
      step = { action: 'type', text: textKey };
    } else {
      step = { action: 'press', key };
    }
  }

  if (!step) return;
  if (computedDelay > 0) {
    step.delay_before_ms = computedDelay;
  }

  liveRecorder.steps.push(step);
  liveRecorder.event_count += 1;
}

function startLiveRecorder(config: LiveRecorderConfig): { success: boolean; error?: string } {
  if (liveRecorder.active) {
    return { success: false, error: 'Live recorder is already active' };
  }

  const scriptPath = recorderScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `Recorder script not found: ${scriptPath}` };
  }

  const process = spawn('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath
  ], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  liveRecorder.active = true;
  liveRecorder.started_at = Date.now();
  liveRecorder.event_count = 0;
  liveRecorder.steps = [];
  liveRecorder.last_event_at = null;
  liveRecorder.ignore_events_before = Date.now() + Math.max(0, Number(config.initial_ignore_ms || 0));
  liveRecorder.parse_errors = 0;
  liveRecorder.raw_log_tail = [];
  liveRecorder.ai_processing = false;
  liveRecorder.ai_last_status = 'pending';
  liveRecorder.ai_last_error = null;
  liveRecorder.ai_last_model = null;
  liveRecorder.config = config;
  liveRecorder.process = process;

  process.stdout.setEncoding('utf8');
  process.stderr.setEncoding('utf8');

  let stdoutBuffer = '';
  process.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed);
        appendRecordedStepFromEvent(event);
      } catch {
        liveRecorder.parse_errors += 1;
        pushLiveRecorderLog(`parse-error ${trimmed.slice(0, 120)}`);
      }
    }
  });

  process.stderr.on('data', (chunk: string) => {
    pushLiveRecorderLog(`stderr ${chunk.trim().slice(0, 160)}`);
  });

  process.on('exit', (code) => {
    pushLiveRecorderLog(`recorder-exit code=${code}`);
    if (liveRecorder.process === process) {
      liveRecorder.process = null;
      liveRecorder.active = false;
    }
  });

  return { success: true };
}

function stopLiveRecorder(saveTemplate = true): { success: boolean; error?: string; template?: RecorderTemplate } {
  if (!liveRecorder.active && !liveRecorder.process) {
    return { success: false, error: 'Live recorder is not active' };
  }

  const proc = liveRecorder.process;
  if (proc && !proc.killed) {
    try {
      proc.kill();
    } catch {
      // no-op
    }
  }

  liveRecorder.active = false;
  liveRecorder.process = null;

  if (!saveTemplate) {
    liveRecorder.config = null;
    liveRecorder.steps = [];
    liveRecorder.last_event_at = null;
    liveRecorder.ignore_events_before = 0;
    return { success: true };
  }

  const config = liveRecorder.config;
  if (!config) {
    return { success: false, error: 'Recorder configuration missing' };
  }

  if (liveRecorder.steps.length === 0) {
    return { success: false, error: 'No events captured. Nothing to save.' };
  }

  const now = Date.now();
  const store = loadRecorderStore();
  const existing = store.templates[config.name];
  const normalizedSteps = annotateRecordedIntent(compactRecordedSteps(liveRecorder.steps));

  const template: RecorderTemplate = {
    name: config.name,
    title: config.title,
    description: config.description || '',
    open_chrome_first: config.open_chrome_first,
    start_delay_seconds: config.start_delay_seconds,
    stop_on_error: config.stop_on_error,
    created_at: existing?.created_at || now,
    updated_at: now,
    steps: normalizedSteps
  };

  store.templates[config.name] = template;
  store.updated_at = now;
  saveRecorderStore(store);

  liveRecorder.config = null;
  liveRecorder.steps = [];
  liveRecorder.last_event_at = null;
  liveRecorder.ignore_events_before = 0;

  return { success: true, template };
}

async function runRecordedTemplate(template: RecorderTemplate, vars: Record<string, unknown>): Promise<any> {
  const startDelaySeconds = Math.max(0, Math.floor(Number(template.start_delay_seconds || 0)));
  const stopOnError = template.stop_on_error !== false;
  const openChromeFirst = template.open_chrome_first !== false;
  const startedAt = Date.now();
  const runLog: Array<Record<string, unknown>> = [];

  if (isRunning) {
    return {
      success: false,
      status: 'busy',
      error: 'SmartMouse is already running another task',
      current_run_id: currentRunId,
      current_goal: currentGoal
    };
  }

  isRunning = true;
  shouldStop = false;
  currentGoal = `recording:${template.name}`;
  currentRunId = createRunId();
  runStartedAt = Date.now();
  markActivity();

  try {
    if (startDelaySeconds > 0) {
      await sleep(startDelaySeconds * 1000);
      markActivity();
    }

    if (openChromeFirst) {
      const openResult = await executeAction({ action: 'open_app', app_name: 'chrome', reasoning: 'Recorder playback hard rule' });
      runLog.push({ step: 'open_chrome', success: openResult.success, message: openResult.message, timestamp: Date.now() });
      if (!openResult.success && stopOnError) {
        return {
          success: false,
          status: 'failed',
          reason: 'Failed to open Chrome before playback',
          run_log: runLog
        };
      }
      await sleep(1200);
      markActivity();
    }

    for (let index = 0; index < template.steps.length; index++) {
      if (shouldStop) {
        return {
          success: false,
          status: 'stopped',
          reason: 'Stopped by /stop during recorder playback',
          run_log: runLog
        };
      }

      const originalStep = template.steps[index];
      const step = interpolateStep(originalStep, vars);
      const delayBeforeMs = Math.max(0, Math.floor(Number(step.delay_before_ms || 0)));
      if (delayBeforeMs > 0) {
        await sleep(delayBeforeMs);
        markActivity();
      }

      const result = await executeAction(step);
      runLog.push({
        index,
        action: step.action,
        note: step.note,
        success: result.success,
        message: result.message,
        timestamp: Date.now()
      });
      markActivity();

      if (!result.success && stopOnError) {
        return {
          success: false,
          status: 'failed',
          reason: `Step ${index + 1} failed: ${result.message}`,
          run_log: runLog
        };
      }
    }

    const finalUrl = await captureActiveChromeUrl();
    return {
      success: true,
      status: 'completed',
      run_id: currentRunId,
      template: template.name,
      started_at: startedAt,
      finished_at: Date.now(),
      final_url: finalUrl.success ? finalUrl.url : null,
      run_log: runLog
    };
  } finally {
    isRunning = false;
    currentGoal = '';
    currentRunId = null;
    runStartedAt = null;
    currentMaxIterations = null;
    markActivity();
  }
}

function getActionTextCandidates(action: any): string[] {
  const candidates = [
    action?.target_text,
    action?.target_label,
    action?.target,
    action?.label,
    action?.text,
    action?.reasoning,
    action?.key
  ];

  return candidates
    .filter((value) => typeof value === 'string')
    .map((value) => (value as string).trim())
    .filter((value) => value.length > 0);
}

function isCommentContextAction(action: any): boolean {
  const texts = getActionTextCandidates(action);
  return texts.some((value) => COMMENT_CONTEXT_PATTERN.test(value));
}

function isLikelyCommentText(value: string): boolean {
  const text = value.trim();
  if (text.length < 12) return false;
  if (!/\s/.test(text)) return false;
  if (/^https?:\/\//i.test(text)) return false;
  return true;
}

function inferMinimumCommentGoalCount(goal: string, parsedTarget: number | null): number {
  if (parsedTarget !== null) {
    return parsedTarget;
  }

  return COMMENT_POST_GOAL_PATTERN.test(goal) ? 1 : 0;
}

function isLikelyCommentSubmitClick(actionName: string, actionTextCandidates: string[]): boolean {
  if (actionName !== 'click' && actionName !== 'double_click') {
    return false;
  }

  const normalizedCandidates = actionTextCandidates
    .map((value) => value.toLowerCase().trim())
    .filter((value) => value.length > 0);

  if (normalizedCandidates.length === 0) {
    return false;
  }

  if (normalizedCandidates.some((value) => COMMENT_SUBMIT_STRONG_PATTERN.test(value))) {
    return true;
  }

  const hasReplyVerb = normalizedCandidates.some((value) => COMMENT_REPLY_PATTERN.test(value));
  const hasInputHint = normalizedCandidates.some((value) => COMMENT_INPUT_HINT_PATTERN.test(value));

  if (hasReplyVerb && !hasInputHint) {
    return true;
  }

  return normalizedCandidates.some(
    (value) =>
      (
        value === 'comment' ||
        value === 'post comment' ||
        value === 'publish comment' ||
        value === 'send comment' ||
        value === 'send' ||
        value === 'message' ||
        value === 'send message' ||
        value === 'send dm' ||
        value === 'direct message'
      ) &&
      !hasInputHint
  );
}

function isAuthBlockedCommentCompletion(reasoning: string): boolean {
  return COMMENT_AUTH_BLOCK_PATTERN.test(reasoning);
}

function inferGoalSite(goal: string): string | null {
  const normalized = goal.toLowerCase();

  if (normalized.includes('instagram')) return 'instagram';
  if (normalized.includes('youtube')) return 'youtube';
  if (normalized.includes('tiktok')) return 'tiktok';
  if (normalized.includes('facebook')) return 'facebook';
  if (normalized.includes('linkedin')) return 'linkedin';
  if (normalized.includes('twitter') || normalized.includes('x.com')) return 'x';

  return null;
}

function urlMatchesGoalSite(goalSite: string | null, rawUrl: string): boolean {
  if (!goalSite) return true;

  const expectedHosts = SOCIAL_SITE_HOSTS[goalSite];
  if (!expectedHosts || expectedHosts.length === 0) return true;

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return expectedHosts.some((expectedHost) => host.includes(expectedHost));
  } catch {
    return false;
  }
}

function shouldRefocusCommentInput(
  action: any,
  goalSite: string | null,
  workflowSectionKey: string,
  currentUrl: string | null
): boolean {
  if (!isLikelyCommentText(typeof action?.text === 'string' ? action.text : '')) {
    return false;
  }

  if (!isCommentContextAction(action)) {
    return false;
  }

  if (!workflowSectionKey.includes(':comment_panel:') && !workflowSectionKey.includes(':notifications:')) {
    return false;
  }

  if (currentUrl && goalSite && !urlMatchesGoalSite(goalSite, currentUrl)) {
    return false;
  }

  if (currentUrl) {
    const normalizedUrl = currentUrl.toLowerCase();
    if (
      normalizedUrl.includes('/results') ||
      normalizedUrl.includes('/search') ||
      normalizedUrl.includes('/explore/search') ||
      normalizedUrl.includes('/feed')
    ) {
      return false;
    }
  }

  return true;
}

function normalizeCommentThreadUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();

    if (host.includes('youtube.com')) {
      const videoId = url.searchParams.get('v');
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }

      const shortsMatch = url.pathname.match(/^\/shorts\/([^\/?#]+)/i);
      if (shortsMatch) {
        return `https://www.youtube.com/shorts/${shortsMatch[1]}`;
      }
    }

    if (host.includes('youtu.be')) {
      const shortId = url.pathname.replace(/^\/+/, '').split('/')[0];
      if (shortId) {
        return `https://www.youtube.com/watch?v=${shortId}`;
      }
    }

    if (host.includes('instagram.com')) {
      const postMatch = url.pathname.match(/^\/p\/([^\/?#]+)/i);
      if (postMatch) {
        return `https://www.instagram.com/p/${postMatch[1]}/`;
      }

      const reelMatch = url.pathname.match(/^\/reel\/([^\/?#]+)/i);
      if (reelMatch) {
        return `https://www.instagram.com/reel/${reelMatch[1]}/`;
      }
    }

    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return trimmed;
  }
}

function findCommentInputCandidate(detectedObjects: DetectedObject[]): DetectedObject | null {
  let best: { obj: DetectedObject; score: number } | null = null;

  for (const obj of detectedObjects) {
    const label = String(obj.label || '').toLowerCase();
    const text = String((obj as any).text || '').toLowerCase();
    const combined = `${label} ${text}`.trim();

    if (!combined) continue;

    let score = 0;

    if (/add\s+(a\s+)?(public\s+)?comment|write\s+(a\s+)?comment|reply|write\s+(a\s+)?message|send\s+(a\s+)?message|direct\s*message|dm/.test(combined)) {
      score += 5;
    }

    if (/input|text\s*box|text\s*field|field|placeholder/.test(label)) {
      score += 3;
    }

    if (/comment|message|dm|chat/.test(combined)) {
      score += 2;
    }

    if (/button/.test(label)) {
      score -= 2;
    }

    score += Math.max(0, obj.confidence * 2);

    const area = Math.max(0, obj.box.width * obj.box.height);
    if (area > 6000) score += 1;

    if (score <= 0) continue;

    if (!best || score > best.score) {
      best = { obj, score };
    }
  }

  return best?.obj || null;
}

function findCommentSubmitCandidate(detectedObjects: DetectedObject[]): DetectedObject | null {
  let best: { obj: DetectedObject; score: number } | null = null;

  for (const obj of detectedObjects) {
    const label = String(obj.label || '').toLowerCase();
    const text = String((obj as any).text || '').toLowerCase();
    const combined = `${label} ${text}`.trim();

    if (!combined) continue;

    if (!/(post|publish|send|submit|reply|message|dm)/.test(combined)) {
      continue;
    }

    let score = 0;

    if (/(post|publish|send|submit)/.test(combined)) {
      score += 5;
    }

    if (/\breply\b/.test(combined)) {
      score += 3;
    }

    if (/button/.test(label)) {
      score += 2;
    }

    if (COMMENT_INPUT_HINT_PATTERN.test(combined)) {
      score -= 6;
    }

    if (/disabled|inactive|grayed/.test(combined)) {
      score -= 5;
    }

    score += Math.max(0, obj.confidence * 2);

    if (score <= 0) continue;

    if (!best || score > best.score) {
      best = { obj, score };
    }
  }

  return best?.obj || null;
}

async function appendTaskReportToLog(report: TaskReport): Promise<void> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const logsDir = path.join(__dirname, 'logs');
    const logFile = path.join(logsDir, 'task-reports.jsonl');

    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(logFile, `${JSON.stringify(report)}\n`, 'utf8');
  } catch (error) {
    console.error('⚠️ Failed to write task report log:', error);
  }
}

function rememberTaskReport(report: TaskReport): void {
  lastTaskReport = report;
  reportsByRunId.set(report.run_id, report);

  if (reportsByRunId.size > MAX_STORED_REPORTS) {
    const oldestKey = reportsByRunId.keys().next().value as string | undefined;
    if (oldestKey) reportsByRunId.delete(oldestKey);
  }
}

// Routes
app.get('/', (req, res) => {
  const now = Date.now();
  const activeConfig = loadConfig();
  res.json({
    name: 'SmartMouse v2.0 (TypeScript)',
    status: 'running',
    ai_model: activeConfig.model,
    vision: isVisionReady() ? 'ready' : 'not_loaded',
    api_configured: isConfigured(),
    current_goal: currentGoal || null,
    current_run_id: currentRunId,
    is_running: isRunning,
    iteration: getIteration(),
    last_error: getLastError(),
    process_started_at: processStartedAt,
    uptime_ms: now - processStartedAt,
    run_started_at: runStartedAt,
    current_max_iterations: currentMaxIterations,
    last_activity_at: lastActivityAt,
    last_activity_age_ms: now - lastActivityAt,
    last_iteration_at: lastIterationAt,
    workflow_memory: getWorkflowMemoryStats(loadConfig()),
    run_progress: currentRunProgress
  });
});

app.get('/status', (req, res) => {
  const now = Date.now();
  const activeConfig = loadConfig();
  res.json({
    vision_ready: isVisionReady(),
    api_configured: isConfigured(),
    ai_model: activeConfig.model,
    is_running: isRunning,
    current_goal: currentGoal || null,
    current_run_id: currentRunId,
    iteration: getIteration(),
    last_error: getLastError(),
    api_error: getApiError(),
    last_task_report: lastTaskReport,
    process_started_at: processStartedAt,
    uptime_ms: now - processStartedAt,
    run_started_at: runStartedAt,
    current_max_iterations: currentMaxIterations,
    last_activity_at: lastActivityAt,
    last_activity_age_ms: now - lastActivityAt,
    last_iteration_at: lastIterationAt,
    workflow_memory: getWorkflowMemoryStats(loadConfig()),
    run_progress: currentRunProgress
  });
});

app.get('/health', (req, res) => {
  const now = Date.now();
  const workflowMemory = getWorkflowMemoryStats(loadConfig());
  const activeConfig = loadConfig();

  res.json({
    ok: true,
    service: 'smartmouse-ts',
    status: 'healthy',
    port: PORT,
    ai_model: activeConfig.model,
    vision_ready: isVisionReady(),
    api_configured: isConfigured(),
    is_running: isRunning,
    current_run_id: currentRunId,
    last_error: getLastError(),
    api_error: getApiError(),
    workflow_memory_enabled: workflowMemory.enabled,
    workflow_memory_sections: workflowMemory.learned_sections,
    uptime_ms: now - processStartedAt,
    timestamp: now,
    run_progress: currentRunProgress
  });
});

app.get('/recorder', (req, res) => {
  res.sendFile(path.join(__dirname, 'recorder.html'));
});

app.get('/cursor', async (req, res) => {
  try {
    const position = await getCursorPosition();
    res.json(position);
  } catch (error) {
    res.status(500).json({
      success: false,
      x: null,
      y: null,
      message: String(error),
      timestamp: Date.now()
    });
  }
});

app.get('/recordings', (req, res) => {
  const store = loadRecorderStore();
  const templates = Object.values(store.templates)
    .sort((a, b) => b.updated_at - a.updated_at)
    .map((template) => ({
      name: template.name,
      title: template.title,
      description: template.description || '',
      updated_at: template.updated_at,
      step_count: template.steps.length,
      open_chrome_first: template.open_chrome_first !== false,
      start_delay_seconds: template.start_delay_seconds || 0,
      ai_enhanced: template.ai_enhanced === true,
      ai_model: template.ai_model || null,
      ai_summary: template.ai_summary || null
    }));

  res.json({
    templates,
    count: templates.length,
    file: recorderFilePath()
  });
});

app.get('/recordings/live/status', (req, res) => {
  res.json({
    success: true,
    active: liveRecorder.active,
    started_at: liveRecorder.started_at,
    event_count: liveRecorder.event_count,
    step_count: liveRecorder.steps.length,
    template_name: liveRecorder.config?.name || null,
    template_title: liveRecorder.config?.title || null,
    ai_processing: liveRecorder.ai_processing,
    ai_status: liveRecorder.ai_last_status,
    ai_error: liveRecorder.ai_last_error,
    ai_model: liveRecorder.ai_last_model,
    parse_errors: liveRecorder.parse_errors,
    recent_logs: liveRecorder.raw_log_tail
  });
});

app.post('/recordings/live/start', async (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const name = sanitizeTemplateName(body.name || title || 'recording-live');

  if (!title) {
    return res.status(400).json({ success: false, error: 'title is required' });
  }

  if (!name) {
    return res.status(400).json({ success: false, error: 'name is invalid after normalization' });
  }

  const openChromeFirst = body.open_chrome_first !== false;

  if (openChromeFirst) {
    try {
      await executeAction({ action: 'open_app', app_name: 'chrome', reasoning: 'Prepare browser before live capture' });
      await sleep(1200);
      markActivity();
    } catch {
      // continue and still allow recording start
    }
  }

  const config: LiveRecorderConfig = {
    name,
    title,
    description: typeof body.description === 'string' ? body.description : '',
    open_chrome_first: openChromeFirst,
    start_delay_seconds: Number.isFinite(body.start_delay_seconds)
      ? Math.max(0, Math.floor(Number(body.start_delay_seconds)))
      : 3,
    stop_on_error: body.stop_on_error !== false,
    default_delay_ms: Number.isFinite(body.default_delay_ms)
      ? Math.max(0, Math.floor(Number(body.default_delay_ms)))
      : 20000,
    initial_ignore_ms: Number.isFinite(body.initial_ignore_ms)
      ? Math.max(0, Math.floor(Number(body.initial_ignore_ms)))
      : (openChromeFirst ? 3000 : 1500)
  };

  const started = startLiveRecorder(config);
  if (!started.success) {
    return res.status(409).json({ success: false, error: started.error });
  }

  return res.json({
    success: true,
    message: 'Live recorder started. Use F8 anywhere to stop and save without returning to the recorder page.',
    config
  });
});

app.post('/recordings/live/stop', async (req, res) => {
  const save = req.body?.save !== false;
  const result = stopLiveRecorder(save);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  let finalTemplate: RecorderTemplate | null = result.template || null;
  if (save && result.template) {
    finalTemplate = await maybeEnhanceSavedTemplateWithAI(result.template, 'endpoint');
  }

  return res.json({
    success: true,
    message: save ? 'Live recording stopped and saved.' : 'Live recording stopped without saving.',
    template: finalTemplate,
    ai_status: liveRecorder.ai_last_status,
    ai_model: liveRecorder.ai_last_model,
    ai_error: liveRecorder.ai_last_error
  });
});

app.get('/recordings/:name', (req, res) => {
  const key = sanitizeTemplateName(req.params.name);
  const store = loadRecorderStore();
  const template = store.templates[key];

  if (!template) {
    return res.status(404).json({
      success: false,
      error: `Recording template not found: ${key}`
    });
  }

  res.json({ success: true, template });
});

app.post('/recordings', (req, res) => {
  const body = req.body || {};
  const name = sanitizeTemplateName(body.name || body.title || 'recording');
  const title = String(body.title || name).trim();
  const steps = Array.isArray(body.steps) ? body.steps : [];

  if (!name) {
    return res.status(400).json({ success: false, error: 'Template name or title is required' });
  }

  if (!title) {
    return res.status(400).json({ success: false, error: 'Template title is required' });
  }

  if (steps.length === 0) {
    return res.status(400).json({ success: false, error: 'Template must include at least one step' });
  }

  const normalizedSteps: RecorderStep[] = steps.map((raw: any) => ({
    action: String(raw?.action || '').trim().toLowerCase() as RecorderActionName,
    x: Number.isFinite(raw?.x) ? Number(raw.x) : undefined,
    y: Number.isFinite(raw?.y) ? Number(raw.y) : undefined,
    text: typeof raw?.text === 'string' ? raw.text : undefined,
    key: typeof raw?.key === 'string' ? raw.key : undefined,
    combo: Array.isArray(raw?.combo) ? raw.combo.map((part: any) => String(part)) : undefined,
    direction: raw?.direction === 'up' || raw?.direction === 'down' ? raw.direction : undefined,
    amount: Number.isFinite(raw?.amount) ? Number(raw.amount) : undefined,
    seconds: Number.isFinite(raw?.seconds) ? Number(raw.seconds) : undefined,
    url: typeof raw?.url === 'string' ? raw.url : undefined,
    app_name: typeof raw?.app_name === 'string' ? raw.app_name : undefined,
    delay_before_ms: Number.isFinite(raw?.delay_before_ms) ? Math.max(0, Number(raw.delay_before_ms)) : undefined,
    note: typeof raw?.note === 'string' ? raw.note : undefined
  }));

  const invalidStepIndex = normalizedSteps.findIndex((step) => !step.action);
  if (invalidStepIndex >= 0) {
    return res.status(400).json({
      success: false,
      error: `Step ${invalidStepIndex + 1} is missing an action`
    });
  }

  const now = Date.now();
  const store = loadRecorderStore();
  const existing = store.templates[name];
  const template: RecorderTemplate = {
    name,
    title,
    description: typeof body.description === 'string' ? body.description : '',
    open_chrome_first: body.open_chrome_first !== false,
    start_delay_seconds: Number.isFinite(body.start_delay_seconds) ? Math.max(0, Math.floor(Number(body.start_delay_seconds))) : 3,
    stop_on_error: body.stop_on_error !== false,
    created_at: existing?.created_at || now,
    updated_at: now,
    steps: normalizedSteps
  };

  store.templates[name] = template;
  store.updated_at = now;
  saveRecorderStore(store);

  res.json({
    success: true,
    template,
    message: existing ? 'Recording template updated' : 'Recording template created'
  });
});

app.delete('/recordings/:name', (req, res) => {
  const key = sanitizeTemplateName(req.params.name);
  const store = loadRecorderStore();

  if (!store.templates[key]) {
    return res.status(404).json({ success: false, error: `Recording template not found: ${key}` });
  }

  delete store.templates[key];
  store.updated_at = Date.now();
  saveRecorderStore(store);
  res.json({ success: true, message: `Deleted recording template: ${key}` });
});

app.post('/recordings/:name/run', async (req, res) => {
  const key = sanitizeTemplateName(req.params.name);
  const store = loadRecorderStore();
  const template = store.templates[key];

  if (!template) {
    return res.status(404).json({ success: false, error: `Recording template not found: ${key}` });
  }

  if (isRunning) {
    return res.status(409).json({
      success: false,
      status: 'busy',
      error: 'SmartMouse runs one task at a time',
      current_run_id: currentRunId,
      current_goal: currentGoal
    });
  }

  const vars = req.body && typeof req.body.vars === 'object' && req.body.vars
    ? req.body.vars as Record<string, unknown>
    : {};

  const overrideStartDelay = Number.isFinite(req.body?.start_delay_seconds)
    ? Math.max(0, Math.floor(Number(req.body.start_delay_seconds)))
    : undefined;

  const runTemplate: RecorderTemplate = {
    ...template,
    start_delay_seconds: overrideStartDelay ?? template.start_delay_seconds
  };

  const result = await runRecordedTemplate(runTemplate, vars);
  if (result.success) {
    return res.json(result);
  }

  const statusCode = result.status === 'busy' ? 409 : 200;
  return res.status(statusCode).json(result);
});

app.post('/init', async (req, res) => {
  try {
    const success = await initVision();
    res.json({ success, message: success ? 'Vision model loaded!' : 'Failed to load', error: getLastError() });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

app.get('/screenshot', async (req, res) => {
  try {
    const result = await analyzeScreen();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/run', async (req, res) => {
  const { goal, max_iterations, wait_for_completion, requesting_agent, agent_id } = req.body || {};
  if (!goal || typeof goal !== 'string') return res.status(400).json({ error: 'Goal required' });
  if (isRunning) {
    return res.status(409).json({
      success: false,
      status: 'busy',
      error: 'SmartMouse runs one task at a time. Wait for current report before starting next task.',
      current_run_id: currentRunId,
      current_goal: currentGoal,
      hint: currentRunId ? `GET /report?run_id=${encodeURIComponent(currentRunId)}` : 'GET /status'
    });
  }

  const runId = createRunId();
  const requestedByAgent = normalizeAgentId(requesting_agent) || normalizeAgentId(agent_id);
  const config = loadConfig();
  const maxIterations = parseMaxIterations(max_iterations, parseMaxIterations(config.max_iterations, 50));
  const waitForCompletion = Boolean(wait_for_completion);
  const runPromise = runGoal(goal, maxIterations, runId, requestedByAgent);

  if (waitForCompletion) {
    try {
      const report = await runPromise;
      return res.json({
        success: true,
        status: 'finished',
        run_id: runId,
        requested_by_agent: requestedByAgent,
        report
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        status: 'failed',
        run_id: runId,
        requested_by_agent: requestedByAgent,
        error: String(e)
      });
    }
  }

  runPromise.catch((e) => {
    console.error('❌ Unhandled run failure:', e);
  });

  res.json({
    success: true,
    status: 'started',
    message: 'Goal started',
    goal,
    run_id: runId,
    requested_by_agent: requestedByAgent,
    poll: {
      status: '/status',
      report: `/report?run_id=${encodeURIComponent(runId)}`,
      links: '/links'
    }
  });
});

app.post('/run/keyboard', async (req, res) => {
  const { goal, keyword, comment_text, max_iterations, wait_for_completion, requesting_agent } = req.body || {};
  if (!goal || typeof goal !== 'string') return res.status(400).json({ error: 'Goal required' });
  
  if (isRunning) {
    return res.status(409).json({
      success: false,
      status: 'busy',
      error: 'SmartMouse runs one task at a time.',
      current_run_id: currentRunId
    });
  }

  const runId = createRunId();
  const requestedByAgent = normalizeAgentId(requesting_agent);
  const cfg = loadConfig();
  const maxIterations = parseMaxIterations(max_iterations, Math.min(50, cfg.max_iterations || 30));
  
  const interpolated = goal
    .replace(/\{\{keyword\}\}/g, String(keyword || ''))
    .replace(/\{\{comment_text\}\}/g, String(comment_text || ''));

  const keyboardRunPromise = (async () => {
    isRunning = true;
    shouldStop = false;
    currentGoal = `keyboard:${interpolated.slice(0, 60)}`;
    currentRunId = runId;
    runStartedAt = Date.now();
    markActivity();

    try {
      clearHistory();
      const report = await runKeyboardGoal(interpolated, maxIterations, runId, requestedByAgent);
      return report;
    } finally {
      isRunning = false;
      currentRunId = null;
    }
  })();

  if (wait_for_completion) {
    try {
      const report = await keyboardRunPromise;
      return res.json({
        success: true,
        status: 'finished',
        run_id: runId,
        report
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        status: 'failed',
        run_id: runId,
        error: String(e)
      });
    }
  }

  keyboardRunPromise.catch((e) => {
    console.error('❌ Keyboard run failed:', e);
  });

  res.json({
    success: true,
    status: 'started',
    message: 'Keyboard navigation started',
    goal: interpolated,
    run_id: runId,
    poll: `/report?run_id=${encodeURIComponent(runId)}`
  });
});

app.post('/stop', (req, res) => {
  shouldStop = true;
  clearHistory();
  updateRunProgress({ note: 'Stop requested via /stop' });
  res.json({ success: true, message: 'Stopped' });
});

app.post('/action', async (req, res) => {
  try {
    const result = await executeAction(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/config', (req, res) => {
  const cfg = loadConfig();
  res.json({ ...cfg, api_key: cfg.api_key ? '***configured***' : 'not_set' });
});

app.get('/links', (req, res) => {
  res.json({
    links: getSessionLinks(),
    current_run_id: currentRunId,
    last_task_report: lastTaskReport
  });
});

app.get('/report', (req, res) => {
  const runId = typeof req.query.run_id === 'string' ? req.query.run_id : null;

  if (runId) {
    const report = reportsByRunId.get(runId);
    if (!report && isRunning && currentRunId === runId) {
      return res.status(202).json({
        status: 'running',
        run_id: runId,
        current_goal: currentGoal,
        iteration: getIteration(),
        message: 'Run is still in progress. Final report will be available when execution ends.'
      });
    }

    if (!report) {
      return res.status(404).json({
        error: `No report found for run_id=${runId}`,
        run_id: runId
      });
    }

    return res.json({ report });
  }

  res.json({ report: lastTaskReport, current_run_id: currentRunId });
});

// Find a specific UI element
app.get('/find', async (req, res) => {
  try {
    const { label } = req.query;
    if (!label || typeof label !== 'string') {
      return res.status(400).json({ error: 'Label query parameter required' });
    }
    
    // Take screenshot and analyze
    const visionData = await analyzeScreen();
    
    if (visionData.error) {
      return res.status(500).json({ error: visionData.error });
    }
    
    // Find the element
    const element = findElement(visionData.detected_objects, label);
    
    res.json({
      found: !!element,
      element,
      all_objects: visionData.detected_objects
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Find all matching UI elements
app.get('/findall', async (req, res) => {
  try {
    const { label } = req.query;
    if (!label || typeof label !== 'string') {
      return res.status(400).json({ error: 'Label query parameter required' });
    }
    
    // Take screenshot and analyze
    const visionData = await analyzeScreen();
    
    if (visionData.error) {
      return res.status(500).json({ error: visionData.error });
    }
    
    // Find all matching elements
    const elements = findElements(visionData.detected_objects, label);
    
    res.json({
      count: elements.length,
      elements,
      all_objects: visionData.detected_objects
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/config', async (req, res) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const current = loadConfig();
    const updated = { ...current, ...req.body };
    
    fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(updated, null, 2));
    const reloaded = reloadConfig();
    res.json({
      success: true,
      message: 'Config updated',
      active_model: reloaded.model,
      active_api_base_url: reloaded.api_base_url
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

function resolveActionWithDetectedObjects(action: any, detectedObjects: DetectedObject[]): any {
  const actionName = String(action?.action || '').toLowerCase();
  const needsCoordinates = ['click', 'double_click', 'right_click', 'move'].includes(actionName);
  if (!needsCoordinates) return action;

  const hasCoordinates = Number.isFinite(action?.x) && Number.isFinite(action?.y);
  if (hasCoordinates) return action;

  let matched: DetectedObject | null = null;

  if (typeof action?.target_id === 'string' && action.target_id.trim()) {
    matched = detectedObjects.find(obj => (obj as any).id === action.target_id.trim()) || null;
  }

  if (!matched) {
    const targetHint = [action?.target_text, action?.target_label, action?.target, action?.text]
      .find((value: any) => typeof value === 'string' && value.trim().length > 0);

    if (targetHint) {
      matched = findElement(detectedObjects, targetHint);
    }
  }

  if (!matched) return action;

  return {
    ...action,
    x: matched.center.x,
    y: matched.center.y,
    target_id: (matched as any).id,
    target_label: matched.label,
    target_text: (matched as any).text,
    reasoning: `${action.reasoning || ''} (resolved using local detection ${(matched as any).id || matched.label})`.trim()
  };
}

// Simplified keyboard-only task runner (no vision, no recordings)
async function runKeyboardGoal(
  goal: string,
  maxIterations: number,
  runId: string,
  requestedByAgent: string | null
): Promise<TaskReport> {
  isRunning = true;
  currentGoal = `keyboard: ${goal}`;
  currentRunId = runId;
  currentMaxIterations = maxIterations;
  shouldStop = false;
  clearHistory();

  const startedAt = Date.now();
  const config = loadConfig();
  runStartedAt = startedAt;
  markActivity();
  
  let actionsExecuted = 0;
  let chromeOpened = false;
  let runStatus: TaskRunStatus = 'max_iterations';
  let completionReason = 'Reached max iterations';
  let iterations = 0;
  let openedInitialUrl = false;
  let blockedOpenUrlCount = 0;
  let blockedMouseActionCount = 0;
  let blockedUnsupportedActionCount = 0;
  const recentActionHistory: string[] = [];

  console.log('\n========================================');
  console.log(`⌨️  KEYBOARD-ONLY GOAL: ${goal}`);
  console.log('========================================\n');

  try {
    // Open Chrome if not already open
    console.log('🌐 Opening Chrome...');
    const openChromeResult = await executeAction({
      action: 'open_app',
      app_name: 'chrome',
      reasoning: 'Keyboard-only startup: opening browser'
    });
    actionsExecuted += 1;
    chromeOpened = openChromeResult.success;
    await sleep(1500);
    markActivity();

    if (/youtube/i.test(goal)) {
      const bootstrapUrlResult = await executeAction({
        action: 'open_url',
        url: 'https://www.youtube.com',
        reasoning: 'Keyboard-only bootstrap: open YouTube once at startup'
      });
      actionsExecuted += 1;
      openedInitialUrl = true;
      if (!bootstrapUrlResult.success) {
        console.log(`⚠️ Bootstrap open_url failed: ${bootstrapUrlResult.message}`);
      }
      await sleep(Math.max(1200, config.action_delay));
      markActivity();
    }

    // Main iteration loop: ask AI what keyboard action to take
    for (let i = 0; i < maxIterations; i++) {
      iterations = i + 1;
      if (shouldStop) {
        runStatus = 'stopped';
        completionReason = 'Stopped by /stop request';
        console.log('⏹️ Stopped');
        break;
      }

      console.log(`\n--- Iteration ${iterations}/${maxIterations} [keyboard-only] ---`);

      try {
        // Ask AI what keyboard action to take next
        const systemPrompt = getKeyboardOnlySystemPrompt();

        const historyContext = recentActionHistory.length > 0
          ? recentActionHistory.slice(-6).join('\n')
          : '(none)';

        const userMessage = `Goal: ${goal}
      Opened initial URL already: ${openedInitialUrl ? 'yes' : 'no'}
      Recent actions:
      ${historyContext}

      What's the next keyboard action to make progress toward this goal?
      Respond with ONE action only as JSON.
      Allowed actions: press, key, type, hotkey, wait, done.
      Do NOT use click, double_click, right_click, move, scroll, or open_url.
      Important: continue with keyboard navigation only (Tab/Enter/arrows/type).`;

        console.log(`🧠 Asking keyboard action model...`);
        const aiResponse = await callAPI(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          { model: config.model, max_tokens: 150, temperature: 0.5 }
        );
        markActivity();

        if (!aiResponse) {
          console.log('⚠️ No response from AI');
          await sleep(500);
          continue;
        }

        const aiMessage = aiResponse.toLowerCase();
        console.log(`📋 AI suggestion: ${aiResponse.substring(0, 100)}`);

        // Try parsing as JSON first, then fall back to pattern matching
        let action: any = { action: 'wait', seconds: 1 };
        
        try {
          // Try to extract JSON from response
          const jsonMatch = aiResponse.match(/\{[\s\S]*"action"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.action) {
              action = parsed;
            }
          }
        } catch (e) {
          // If JSON parsing fails, fall through to pattern matching
        }

        if (String(action.action || '').toLowerCase() === 'done') {
          runStatus = 'completed';
          completionReason = 'AI reported task completed';
          console.log('✅ Task completed');
          break;
        }

        const actionName = String(action.action || '').toLowerCase();
        const isMouseAction = [
          'click',
          'double_click',
          'right_click',
          'move',
          'drag',
          'scroll',
          'hover'
        ].includes(actionName);

        if (isMouseAction) {
          blockedMouseActionCount += 1;
          console.log(`🛑 Blocking mouse action in keyboard mode: ${actionName}`);
          action = {
            action: 'press',
            key: 'tab',
            reasoning: `Mouse action ${actionName} blocked; continue keyboard navigation`
          };
        }

        // If not parsed as JSON, try pattern matching
        if (action.action === 'wait' && typeof aiResponse === 'string') {
          if (aiMessage.includes('done')) {
            runStatus = 'completed';
            completionReason = 'AI reported task completed';
            console.log('✅ Task completed');
            break;
          } else if (aiMessage.includes('tab')) {
            action = { action: 'press', key: 'tab', reasoning: 'Navigation via Tab' };
          } else if (aiMessage.includes('enter')) {
            action = { action: 'press', key: 'enter', reasoning: 'Activate via Enter' };
          } else if (aiMessage.includes('arrow-down') || aiMessage.includes('down')) {
            action = { action: 'press', key: 'down', reasoning: 'Scroll down' };
          } else if (aiMessage.includes('arrow-up') || aiMessage.includes('up')) {
            action = { action: 'press', key: 'up', reasoning: 'Scroll up' };
          } else if (aiMessage.includes('ctrl+c') || aiMessage.includes('copy')) {
            action = { action: 'hotkey', combo: ['ctrl', 'c'], reasoning: 'Copy' };
          } else if (aiMessage.includes('ctrl+v') || aiMessage.includes('paste')) {
            action = { action: 'hotkey', combo: ['ctrl', 'v'], reasoning: 'Paste' };
          } else if (aiMessage.includes('type:')) {
            const match = aiResponse.match(/type:\s*["']([^"']+)["']/i) || aiResponse.match(/type:\s*(.+?)(?:\n|$)/i);
            if (match) {
              action = { action: 'type', text: match[1], reasoning: 'Type user input' };
            }
          } else if (aiMessage.includes('open_url:')) {
            const match = aiResponse.match(/open_url:\s*["']([^"']+)["']/i) || aiResponse.match(/open_url:\s*(https?:\/\/\S+)/i);
            if (match) {
              action = { action: 'open_url', url: match[1], reasoning: 'Navigate to URL' };
            }
          }
        }

        // Hard guard: allow open_url only once to prevent opening endless tabs/windows.
        if (String(action.action || '').toLowerCase() === 'open_url') {
          if (openedInitialUrl) {
            blockedOpenUrlCount += 1;
            console.log('🛑 Blocking repeated open_url. Forcing keyboard navigation instead.');
            action = {
              action: 'press',
              key: 'tab',
              reasoning: 'Repeated open_url blocked; continue in-page navigation with keyboard'
            };
          } else {
            openedInitialUrl = true;
          }
        }

        // Strict keyboard allowlist in keyboard mode.
        const normalizedActionName = String(action.action || '').toLowerCase();
        const keyboardAllowedActions = new Set(['press', 'key', 'hotkey', 'type', 'wait']);
        if (!keyboardAllowedActions.has(normalizedActionName)) {
          blockedUnsupportedActionCount += 1;
          console.log(`🛑 Blocking unsupported action in keyboard mode: ${normalizedActionName || 'unknown'}`);
          action = {
            action: 'press',
            key: 'tab',
            reasoning: `Unsupported action ${normalizedActionName || 'unknown'} blocked; continue keyboard navigation`
          };
        }

        const totalBlockedActions = blockedOpenUrlCount + blockedMouseActionCount + blockedUnsupportedActionCount;
        if (totalBlockedActions >= 3) {
          runStatus = 'failed';
          completionReason = `Stopped: repeated blocked actions (open_url=${blockedOpenUrlCount}, mouse=${blockedMouseActionCount}, unsupported=${blockedUnsupportedActionCount})`;
          console.log(`🛑 ${completionReason}`);
          break;
        }

        // Execute the action
        const actionResult = await executeAction(action);
        actionsExecuted += 1;

        recentActionHistory.push(
          `- ${action.action}${action.key ? `(${action.key})` : ''}${action.url ? `(${action.url})` : ''}: ${actionResult.success ? 'ok' : 'failed'}`
        );
        if (recentActionHistory.length > 12) {
          recentActionHistory.splice(0, recentActionHistory.length - 12);
        }

        console.log(
          `${actionResult.success ? '✅' : '❌'} ${action.action}: ${actionResult.message || 'ok'}`
        );
        await sleep(Math.max(800, config.action_delay));
        markActivity();
      } catch (e: any) {
        console.error(`⚠️ Iteration error: ${e?.message || String(e)}`);
        await sleep(500);
      }
    }
  } catch (e: any) {
    console.error(`❌ Keyboard goal failed: ${e?.message || String(e)}`);
    runStatus = 'failed';
    completionReason = String(e);
  } finally {
    isRunning = false;
  }

  const finishedAt = Date.now();
  if ((blockedOpenUrlCount > 0 || blockedMouseActionCount > 0 || blockedUnsupportedActionCount > 0) && runStatus === 'max_iterations') {
    completionReason = `${completionReason} (blocked open_url: ${blockedOpenUrlCount}, blocked mouse actions: ${blockedMouseActionCount}, blocked unsupported actions: ${blockedUnsupportedActionCount})`;
  }
  console.log(`\n✅ Run completed: ${runStatus} (${completionReason})`);

  return {
    run_id: runId,
    requested_by_agent: requestedByAgent,
    goal,
    target_comments: null,
    estimated_comments_submitted: 0,
    status: runStatus,
    started_at: startedAt,
    finished_at: finishedAt,
    iterations,
    actions_executed: actionsExecuted,
    completion_reason: completionReason,
    final_url: null,
    done_link: null,
    chrome_opened: chromeOpened,
    chrome_closed: false,
    links_interacted: 0,
    workflow_memory_sections_touched: 0,
    workflow_memory_sections_saved: 0,
    workflow_memory_replay_steps_used: 0,
    workflow_memory_replay_steps_succeeded: 0,
    workflow_memory_replay_steps_failed: 0,
    required_comments_before_done: 0,
    comment_submit_attempts: 0,
    comment_submit_successes: 0,
    comment_submit_failures: 0,
    duplicate_comments_blocked: 0,
    done_actions_blocked: 0,
    grace_iterations_added: 0,
    fallback_submit_overrides: 0,
    prepared_comment_autofills: 0
  };
}

// Main execution loop
async function runGoal(
  goal: string,
  maxIterations: number,
  runId: string,
  requestedByAgent: string | null
): Promise<TaskReport> {
  isRunning = true;
  currentGoal = goal;
  currentRunId = runId;
  let iterationLimit = maxIterations;
  currentMaxIterations = iterationLimit;
  shouldStop = false;
  clearHistory();

  const startedAt = Date.now();
  const config = loadConfig();
  const workflowRun = beginWorkflowRun(goal, config);
  runStartedAt = startedAt;
  markActivity();
  let runStatus: TaskRunStatus = 'max_iterations';
  let completionReason = 'Reached max iterations without receiving done action';
  let doneLink: string | null = null;
  let actionsExecuted = 0;
  let chromeOpened = false;
  let chromeClosed = false;
  let finalUrl: string | null = null;
  const targetComments = parseCommentTarget(goal);
  const requiredCommentCountBeforeDone = inferMinimumCommentGoalCount(goal, targetComments);
  const isCommentingGoal = requiredCommentCountBeforeDone > 0 || COMMENT_CONTEXT_PATTERN.test(goal);
  let estimatedCommentsSubmitted = 0;
  let commentInputFocused = false;
  let pendingCommentDraft = false;
  let pendingCommentDraftIteration = -10;
  let pendingCommentSubmitDeferrals = 0;
  let preparedCommentText: string | null = null;
  let preparedCommentSourceIteration = -10;
  let preparedCommentAutoFills = 0;
  let lastEstimatedCommentIteration = -10;
  let lastCommentFocusIteration = -10;
  let commentSubmitAttempts = 0;
  let commentSubmitSuccesses = 0;
  let commentSubmitFailures = 0;
  let duplicateCommentsBlocked = 0;
  let doneActionsBlocked = 0;
  let fallbackSubmitOverrides = 0;
  let grantedCommentGraceIterations = 0;
  const commentFinishGraceMax = Math.min(
    COMMENT_FINISH_GRACE_MAX,
    Math.max(COMMENT_FINISH_GRACE_BATCH, Math.floor(maxIterations * 0.5))
  );
  const commentedPostUrls = new Set<string>();
  const goalSite = inferGoalSite(goal);

  console.log('\n========================================');
  console.log(`🎯 GOAL: ${goal}`);
  if (targetComments) {
    console.log(`💬 Comment target detected: ${targetComments}`);
  } else if (requiredCommentCountBeforeDone > 0) {
    console.log('💬 Comment intent detected: requiring at least one verified comment before done.');
  }
  console.log('========================================\n');

  currentRunProgress = createInitialRunProgress();
  updateRunProgress({
    run_id: runId,
    status: 'running',
    goal,
    started_at: startedAt,
    finished_at: null,
    iteration: 0,
    iteration_limit: iterationLimit,
    actions_executed: 0,
    target_comments: targetComments,
    required_comments_before_done: requiredCommentCountBeforeDone,
    estimated_comments_submitted: 0,
    pending_comment_draft: false,
    pending_comment_draft_iteration: null,
    comment_input_focused: false,
    last_comment_focus_iteration: null,
    comment_submit_attempts: 0,
    comment_submit_successes: 0,
    comment_submit_failures: 0,
    duplicate_comments_blocked: 0,
    done_actions_blocked: 0,
    grace_iterations_added: 0,
    fallback_submit_overrides: 0,
    prepared_comment_ready: false,
    prepared_comment_autofills: 0,
    completion_reason: null,
    note: 'Run started'
  });

  try {
    if (!isVisionReady()) {
      console.log('🔄 Loading vision model...');
      await initVision();
      markActivity();
    }

    console.log('🌐 Hard rule: open Chrome first');
    try {
      const openChromeResult = await executeAction({
        action: 'open_app',
        app_name: 'chrome',
        reasoning: 'Hardcoded startup rule: always open Chrome before task execution'
      });
      actionsExecuted += 1;
      chromeOpened = openChromeResult.success;
      console.log(openChromeResult.success ? '✓ Chrome opened' : `⚠️ Chrome open failed: ${openChromeResult.message}`);
      await sleep(Math.max(1200, config.action_delay));
      markActivity();

      const bootstrapUrl = buildBootstrapUrl(goal, goalSite);
      if (bootstrapUrl) {
        const bootstrapResult = await executeAction({
          action: 'open_url',
          url: bootstrapUrl,
          reasoning: `Deterministic bootstrap navigation for ${goalSite || 'web'} task`
        });
        actionsExecuted += 1;
        console.log(bootstrapResult.success ? `✓ Bootstrap navigation: ${bootstrapUrl}` : `⚠️ Bootstrap navigation failed: ${bootstrapResult.message}`);
        await sleep(Math.max(1500, config.action_delay));
        markActivity();
      }
    } catch (e: any) {
      console.error(`⚠️ Failed to enforce Chrome-first rule: ${e?.message || String(e)}`);
    }

    for (let i = 0; i < iterationLimit; i++) {
      markIterationProgress();
      updateRunProgress({
        status: 'running',
        iteration: i + 1,
        iteration_limit: iterationLimit,
        actions_executed: actionsExecuted,
        estimated_comments_submitted: estimatedCommentsSubmitted,
        pending_comment_draft: pendingCommentDraft,
        pending_comment_draft_iteration: pendingCommentDraft ? pendingCommentDraftIteration : null,
        comment_input_focused: commentInputFocused,
        last_comment_focus_iteration: lastCommentFocusIteration >= 0 ? lastCommentFocusIteration : null,
        prepared_comment_ready: Boolean(preparedCommentText),
        prepared_comment_autofills: preparedCommentAutoFills,
        note: `Iteration ${i + 1}/${iterationLimit}`
      });

      if (shouldStop) {
        runStatus = 'stopped';
        completionReason = 'Stopped by /stop request';
        console.log('⏹️ Stopped');
        updateRunProgress({ status: runStatus, completion_reason: completionReason, note: 'Stopped by user request' });
        break;
      }

      console.log(`\n--- Iteration ${i + 1}/${iterationLimit} ---`);

      try {
        // 1. Take screenshot and analyze LOCALLY
        console.log('📸 Taking screenshot...');
        const visionData = await analyzeScreen();
        markActivity();

        if (visionData.error) {
          console.log(`⚠️ Vision error: ${visionData.error}`);
        }

        // 2. Use learned workflow replay (if available), otherwise ask GLM-5
        const detectedObjects = visionData.detected_objects || [];
        const workflowSection = deriveWorkflowSection(goal, detectedObjects);
        const replaySuggestion = getWorkflowReplaySuggestion(workflowRun, workflowSection);
        const learnedHints = getWorkflowPromptHints(workflowRun, workflowSection);

        let actionSource: WorkflowActionSource = 'ai';
        let action: any;

        if (replaySuggestion) {
          actionSource = 'memory';
          action = replaySuggestion.action;
          console.log(
            `♻️ Workflow replay [${replaySuggestion.section_key}] step ${replaySuggestion.step}/${replaySuggestion.total}`
          );
        } else {
          const goalWithHints = learnedHints
            ? `${goal}\n\nLEARNED_WORKFLOW_HINTS:\n${learnedHints}`
            : goal;

          console.log(`🧠 Asking action model (${config.model})...`);
          action = await decideAction(visionData, goalWithHints);
        }

        let resolvedAction = resolveActionWithDetectedObjects(action, detectedObjects);
        markActivity();
        console.log(`📋 Action: ${JSON.stringify(resolvedAction)}`);

        let actionName = String(resolvedAction?.action || '').toLowerCase();
        let actionTextCandidates = getActionTextCandidates(resolvedAction);
        let hasCommentContext = isCommentContextAction(resolvedAction);
        const isPointerAction = actionName === 'click' || actionName === 'double_click' || actionName === 'right_click';
        updateRunProgress({
          last_action: actionName || null,
          last_action_reasoning: typeof resolvedAction?.reasoning === 'string' ? resolvedAction.reasoning : null,
          last_action_at: Date.now(),
          note: `Planned action: ${actionName || 'unknown'}`
        });

        if (isPointerAction && hasCommentContext) {
          commentInputFocused = true;
          lastCommentFocusIteration = i;
        } else if (isPointerAction && !hasCommentContext) {
          commentInputFocused = false;
        }

        if (actionName === 'open_url' && typeof resolvedAction?.url === 'string') {
          const trimmedUrl = resolvedAction.url.trim();
          if (trimmedUrl && !urlMatchesGoalSite(goalSite, trimmedUrl)) {
            console.log(`⚠️ Blocking cross-site navigation that does not match goal site: ${trimmedUrl}`);
            recordWorkflowActionOutcome(workflowRun, workflowSection, resolvedAction, false, actionSource);
            updateRunProgress({ note: `Blocked cross-site navigation: ${trimmedUrl}` });
            await sleep(Math.min(800, config.action_delay));
            markActivity();
            continue;
          }
        }

        if (actionName === 'type') {
          const typedText = typeof resolvedAction?.text === 'string' ? resolvedAction.text : '';
          const likelyCommentDraft = isLikelyCommentText(typedText);
          const reasoningText = typeof resolvedAction?.reasoning === 'string' ? resolvedAction.reasoning : '';
          const typedForCommentIntent =
            isCommentingGoal &&
            likelyCommentDraft &&
            (hasCommentContext || COMMENT_CONTEXT_PATTERN.test(reasoningText));

          if (typedForCommentIntent) {
            preparedCommentText = typedText;
            preparedCommentSourceIteration = i;
            updateRunProgress({
              prepared_comment_ready: true,
              note: 'Prepared comment draft captured for input-focus autofill'
            });

            if (!commentInputFocused && !hasCommentContext) {
              resolvedAction = {
                action: 'wait',
                seconds: 1,
                reasoning: 'Prepared comment draft stored; waiting to focus comment input before typing'
              };
              actionName = 'wait';
              actionTextCandidates = getActionTextCandidates(resolvedAction);
              hasCommentContext = false;
              console.log('🗂️ Prepared comment draft and deferred typing until comment input is focused.');
              updateRunProgress({
                last_action: actionName,
                last_action_reasoning: resolvedAction.reasoning,
                note: 'Deferred draft typing until comment input focus'
              });
            }
          }

          if (likelyCommentDraft) {
            const focusIsStale = !commentInputFocused || i - lastCommentFocusIteration > 1;
            let activeUrl: string | null = null;

            if (focusIsStale) {
              const capturedUrl = await captureActiveChromeUrl();
              if (capturedUrl.success && capturedUrl.url) {
                activeUrl = capturedUrl.url;
              }
            }

            if (focusIsStale && shouldRefocusCommentInput(resolvedAction, goalSite, workflowSection.key, activeUrl)) {
              const commentInputCandidate = findCommentInputCandidate(visionData.detected_objects || []);

              if (commentInputCandidate) {
                console.log(
                  `🎯 Re-focusing comment input before typing at (${commentInputCandidate.center.x}, ${commentInputCandidate.center.y})`
                );

                const focusResult = await executeAction({
                  action: 'click',
                  x: commentInputCandidate.center.x,
                  y: commentInputCandidate.center.y,
                  reasoning: 'Refocus comment input before typing generated comment text'
                });

                actionsExecuted += 1;
                markActivity();

                if (focusResult.success) {
                  commentInputFocused = true;
                  lastCommentFocusIteration = i;
                  await sleep(Math.min(800, config.action_delay));
                  markActivity();
                } else {
                  console.log(`⚠️ Comment input refocus click failed: ${focusResult.message}`);
                  commentInputFocused = false;
                }
              } else {
                console.log('⚠️ Could not find comment input candidate before typing draft.');
                commentInputFocused = false;
              }
            } else if (focusIsStale) {
              console.log('⚠️ Skipping comment refocus because the current context does not clearly look like a comment panel.');
              commentInputFocused = false;
            }
          }

          if (likelyCommentDraft && (commentInputFocused || hasCommentContext)) {
            pendingCommentDraft = true;
            pendingCommentDraftIteration = i;
            pendingCommentSubmitDeferrals = 0;
          }
        }

        if (preparedCommentText && i - preparedCommentSourceIteration > COMMENT_PREPARED_DRAFT_MAX_AGE) {
          preparedCommentText = null;
          preparedCommentSourceIteration = -10;
          console.log('⚠️ Dropping stale prepared comment draft after extended delay.');
          updateRunProgress({
            prepared_comment_ready: false,
            note: 'Cleared stale prepared comment draft'
          });
        }

        if (pendingCommentDraft) {
          const pendingDraftExpired = i - pendingCommentDraftIteration > COMMENT_DRAFT_MAX_PENDING_ITERATIONS;
          const comboTokens = Array.isArray(resolvedAction?.combo)
            ? resolvedAction.combo.map((part: any) => String(part).toLowerCase())
            : [];
          const movedToAddressBar =
            actionName === 'hotkey' && comboTokens.length === 2 && comboTokens.includes('ctrl') && comboTokens.includes('l');
          const movedAwayFromCommentFlow = actionName === 'open_url' || actionName === 'open_app' || movedToAddressBar;

          const shouldClearAfterDeferral =
            movedAwayFromCommentFlow && pendingCommentSubmitDeferrals > COMMENT_SUBMIT_FALLBACK_DEFERRALS;

          if (pendingDraftExpired || shouldClearAfterDeferral) {
            pendingCommentDraft = false;
            pendingCommentDraftIteration = -10;
            pendingCommentSubmitDeferrals = 0;
            commentInputFocused = false;
            const clearReason = pendingDraftExpired
              ? 'stale draft'
              : 'navigated away from comment flow too long without submit';
            console.log(`⚠️ Clearing pending comment draft (${clearReason}).`);
            updateRunProgress({
              pending_comment_draft: false,
              pending_comment_draft_iteration: null,
              comment_input_focused: false,
              prepared_comment_ready: Boolean(preparedCommentText),
              note: `Cleared pending draft (${clearReason})`
            });
          }
        }

        const pressedKey = typeof resolvedAction?.key === 'string' ? resolvedAction.key.toLowerCase() : '';
        const submitByKey =
          actionName === 'press' &&
          ['enter', 'return', 'numpadenter'].includes(pressedKey) &&
          (commentInputFocused || hasCommentContext);
        const submitByClick = isLikelyCommentSubmitClick(actionName, actionTextCandidates);
        let isCommentSubmitAttempt = pendingCommentDraft && (submitByKey || submitByClick);

        const shouldAutofillPreparedDraftAfterFocusClick =
          isCommentingGoal &&
          !pendingCommentDraft &&
          Boolean(preparedCommentText) &&
          isPointerAction &&
          actionName === 'click' &&
          hasCommentContext &&
          !submitByClick;

        if (pendingCommentDraft && !isCommentSubmitAttempt) {
          pendingCommentSubmitDeferrals += 1;

          const shouldForceFallbackSubmit = pendingCommentSubmitDeferrals > COMMENT_SUBMIT_FALLBACK_DEFERRALS;
          updateRunProgress({
            note: `Pending draft without submit action (${pendingCommentSubmitDeferrals}/${COMMENT_SUBMIT_FALLBACK_DEFERRALS + 1})`
          });

          if (shouldForceFallbackSubmit) {
            const submitCandidate = findCommentSubmitCandidate(visionData.detected_objects || []);

            if (submitCandidate) {
              resolvedAction = {
                action: 'click',
                x: submitCandidate.center.x,
                y: submitCandidate.center.y,
                target_id: (submitCandidate as any).id,
                target_label: submitCandidate.label,
                target_text: (submitCandidate as any).text,
                reasoning: 'Fallback submit: clicking likely post/send button after pending comment draft'
              };
            } else {
              resolvedAction = {
                action: 'press',
                key: 'enter',
                reasoning: 'Fallback submit: pressing Enter after pending comment draft'
              };
            }

            actionName = String(resolvedAction?.action || '').toLowerCase();
            actionTextCandidates = getActionTextCandidates(resolvedAction);
            hasCommentContext = isCommentContextAction(resolvedAction);
            isCommentSubmitAttempt = true;
            fallbackSubmitOverrides += 1;

            console.log(`🛟 Forced comment submit fallback using action=${actionName}`);
            updateRunProgress({
              fallback_submit_overrides: fallbackSubmitOverrides,
              last_action: actionName || null,
              last_action_reasoning: typeof resolvedAction?.reasoning === 'string' ? resolvedAction.reasoning : null,
              last_action_at: Date.now(),
              note: `Forced fallback submit (${fallbackSubmitOverrides})`
            });
          }
        } else if (pendingCommentDraft && isCommentSubmitAttempt) {
          pendingCommentSubmitDeferrals = 0;
        }

        let submitTargetUrl: string | null = null;
        let duplicateCommentBlocked = false;

        if (isCommentSubmitAttempt) {
          commentSubmitAttempts += 1;
          updateRunProgress({
            comment_submit_attempts: commentSubmitAttempts,
            note: `Comment submit attempt ${commentSubmitAttempts}`
          });

          const currentUrl = await captureActiveChromeUrl();
          if (currentUrl.success && currentUrl.url) {
            submitTargetUrl = normalizeCommentThreadUrl(currentUrl.url);
          }

          if (submitTargetUrl && commentedPostUrls.has(submitTargetUrl)) {
            duplicateCommentBlocked = true;
            duplicateCommentsBlocked += 1;
            pendingCommentDraft = false;
            pendingCommentDraftIteration = -10;
            pendingCommentSubmitDeferrals = 0;
            commentInputFocused = false;

            addSessionLink({
              url: submitTargetUrl,
              description: `Duplicate comment prevented on same post: ${submitTargetUrl}`,
              action: 'comment_duplicate_blocked',
              timestamp: Date.now()
            });

            recordWorkflowActionOutcome(workflowRun, workflowSection, resolvedAction, false, actionSource);

            console.log(`⛔ Duplicate comment prevented on same post: ${submitTargetUrl}`);
            updateRunProgress({
              duplicate_comments_blocked: duplicateCommentsBlocked,
              pending_comment_draft: false,
              pending_comment_draft_iteration: null,
              comment_input_focused: false,
              prepared_comment_ready: Boolean(preparedCommentText),
              note: `Duplicate comment blocked: ${submitTargetUrl}`
            });
            await sleep(Math.min(1000, config.action_delay));
            markActivity();
            continue;
          }
        }

        // Track this action (for links)
        trackAction(resolvedAction);

        // 3. Check if done
        const hasRequiredCommentProgress =
          requiredCommentCountBeforeDone <= 0 || estimatedCommentsSubmitted >= requiredCommentCountBeforeDone;
        const doneReasoning = typeof resolvedAction?.reasoning === 'string' ? resolvedAction.reasoning : '';
        const allowDoneForAuthBlock =
          requiredCommentCountBeforeDone > 0 && isAuthBlockedCommentCompletion(doneReasoning);

        if (resolvedAction.action === 'done') {
          if (pendingCommentDraft) {
            doneActionsBlocked += 1;
            console.log('⏳ Ignoring done action: comment draft exists but submission was not verified yet.');
            recordWorkflowActionOutcome(workflowRun, workflowSection, resolvedAction, false, actionSource);
            updateRunProgress({
              done_actions_blocked: doneActionsBlocked,
              note: 'Blocked done action because draft is pending submit'
            });
            await sleep(Math.min(1000, config.action_delay));
            markActivity();
            continue;
          }

          if (!hasRequiredCommentProgress && !allowDoneForAuthBlock) {
            doneActionsBlocked += 1;
            console.log(
              `⏳ Ignoring done action: comment progress ${estimatedCommentsSubmitted}/${requiredCommentCountBeforeDone} not reached yet.`
            );
            recordWorkflowActionOutcome(workflowRun, workflowSection, resolvedAction, false, actionSource);
            updateRunProgress({
              done_actions_blocked: doneActionsBlocked,
              note: `Blocked done action: comment progress ${estimatedCommentsSubmitted}/${requiredCommentCountBeforeDone}`
            });
            await sleep(Math.min(1000, config.action_delay));
            markActivity();
            continue;
          }

          if (allowDoneForAuthBlock) {
            console.log('ℹ️ Allowing done action because reasoning indicates sign-in/authentication is required.');
          }

          runStatus = 'completed';
          completionReason = resolvedAction.reasoning || 'Model returned done action';
          doneLink = resolvedAction.link || null;
          console.log('\n✅ GOAL COMPLETED!');
          console.log(`📝 ${resolvedAction.reasoning}`);
          break;
        }

        // 4. Execute action
        console.log(`🏃 Executing: ${resolvedAction.action}`);
        const result = await executeAction(resolvedAction);
        actionsExecuted += 1;
        console.log(`✓ ${result.message}`);
        markActivity();
        recordWorkflowActionOutcome(workflowRun, workflowSection, resolvedAction, result.success, actionSource);
        updateRunProgress({
          actions_executed: actionsExecuted,
          pending_comment_draft: pendingCommentDraft,
          pending_comment_draft_iteration: pendingCommentDraft ? pendingCommentDraftIteration : null,
          comment_input_focused: commentInputFocused,
          last_comment_focus_iteration: lastCommentFocusIteration >= 0 ? lastCommentFocusIteration : null,
          note: result.success ? `Executed action: ${actionName}` : `Action failed: ${actionName}`
        });

        if (shouldAutofillPreparedDraftAfterFocusClick && result.success && preparedCommentText) {
          const bufferedDraftText = preparedCommentText;
          console.log('📝 Auto-filling prepared comment draft after input focus click.');
          const autoTypeResult = await executeAction({
            action: 'type',
            text: bufferedDraftText,
            reasoning: 'Auto-fill prepared comment draft after input focus click'
          });
          actionsExecuted += 1;
          markActivity();
          console.log(autoTypeResult.success ? `✓ ${autoTypeResult.message}` : `⚠️ ${autoTypeResult.message}`);

          if (autoTypeResult.success) {
            preparedCommentAutoFills += 1;
            preparedCommentText = null;
            preparedCommentSourceIteration = -10;
            pendingCommentDraft = true;
            pendingCommentDraftIteration = i;
            pendingCommentSubmitDeferrals = 0;
            commentInputFocused = true;
            lastCommentFocusIteration = i;

            updateRunProgress({
              actions_executed: actionsExecuted,
              prepared_comment_ready: false,
              prepared_comment_autofills: preparedCommentAutoFills,
              pending_comment_draft: true,
              pending_comment_draft_iteration: pendingCommentDraftIteration,
              comment_input_focused: true,
              last_comment_focus_iteration: lastCommentFocusIteration,
              note: `Prepared draft auto-filled (${preparedCommentAutoFills})`
            });
          } else {
            updateRunProgress({
              actions_executed: actionsExecuted,
              prepared_comment_ready: Boolean(preparedCommentText),
              note: 'Prepared draft autofill failed; retaining draft for retry'
            });
          }
        }

        if (isCommentSubmitAttempt) {
          if (result.success && i - lastEstimatedCommentIteration > 1) {
            commentSubmitSuccesses += 1;
            estimatedCommentsSubmitted += 1;
            lastEstimatedCommentIteration = i;

            if (submitTargetUrl) {
              commentedPostUrls.add(submitTargetUrl);
            }

            addSessionLink({
              url: submitTargetUrl || undefined,
              description: `Estimated comment submission #${estimatedCommentsSubmitted}${submitTargetUrl ? ` on ${submitTargetUrl}` : ''}`,
              action: 'comment_submit',
              timestamp: Date.now()
            });

            console.log(
              `💬 Estimated comments submitted: ${estimatedCommentsSubmitted}${targetComments ? `/${targetComments}` : ''}`
            );

            if (targetComments !== null && estimatedCommentsSubmitted >= targetComments) {
              runStatus = 'completed';
              completionReason = `Reached estimated comment target (${estimatedCommentsSubmitted}/${targetComments})`;
              console.log('✅ Estimated comment target reached; finishing run.');
              updateRunProgress({ status: runStatus, completion_reason: completionReason, note: completionReason });
              break;
            }
          } else if (!result.success) {
            commentSubmitFailures += 1;
            console.log('⚠️ Comment submit action failed; not counting this attempt.');
          }

          if (result.success) {
            updateRunProgress({
              comment_submit_successes: commentSubmitSuccesses,
              estimated_comments_submitted: estimatedCommentsSubmitted,
              note: `Comment submit succeeded (${estimatedCommentsSubmitted}/${requiredCommentCountBeforeDone || 'n/a'})`
            });
          } else {
            updateRunProgress({
              comment_submit_failures: commentSubmitFailures,
              note: 'Comment submit failed'
            });
          }

          pendingCommentDraft = false;
          pendingCommentDraftIteration = -10;
          pendingCommentSubmitDeferrals = 0;
          commentInputFocused = false;
          updateRunProgress({
            pending_comment_draft: false,
            pending_comment_draft_iteration: null,
            comment_input_focused: false,
            prepared_comment_ready: Boolean(preparedCommentText),
            prepared_comment_autofills: preparedCommentAutoFills
          });
        }

        const remainingIterations = iterationLimit - (i + 1);
        const hasFreshCommentFocus = commentInputFocused && i - lastCommentFocusIteration <= 2;
        const stillNeedsComments =
          requiredCommentCountBeforeDone > 0 && estimatedCommentsSubmitted < requiredCommentCountBeforeDone;

        if (
          stillNeedsComments &&
          remainingIterations <= 1 &&
          (pendingCommentDraft || hasFreshCommentFocus) &&
          grantedCommentGraceIterations < commentFinishGraceMax
        ) {
          const extension = Math.min(
            COMMENT_FINISH_GRACE_BATCH,
            commentFinishGraceMax - grantedCommentGraceIterations
          );
          iterationLimit += extension;
          grantedCommentGraceIterations += extension;
          currentMaxIterations = iterationLimit;
          console.log(
            `⏱️ Extending run by ${extension} iteration(s) to finish in-progress comment (${estimatedCommentsSubmitted}/${requiredCommentCountBeforeDone}).`
          );
          updateRunProgress({
            iteration_limit: iterationLimit,
            grace_iterations_added: grantedCommentGraceIterations,
            note: `Extended run by ${extension} to finish comment flow`
          });
        }

        if (requiredCommentCountBeforeDone > 0) {
          console.log(
            `📈 Progress: comments ${estimatedCommentsSubmitted}/${requiredCommentCountBeforeDone}, submit ${commentSubmitSuccesses}/${commentSubmitAttempts}, pending_draft=${pendingCommentDraft ? 'yes' : 'no'}`
          );
          updateRunProgress({
            estimated_comments_submitted: estimatedCommentsSubmitted,
            comment_submit_attempts: commentSubmitAttempts,
            comment_submit_successes: commentSubmitSuccesses,
            comment_submit_failures: commentSubmitFailures,
            duplicate_comments_blocked: duplicateCommentsBlocked,
            done_actions_blocked: doneActionsBlocked,
            fallback_submit_overrides: fallbackSubmitOverrides,
            prepared_comment_ready: Boolean(preparedCommentText),
            prepared_comment_autofills: preparedCommentAutoFills,
            pending_comment_draft: pendingCommentDraft,
            pending_comment_draft_iteration: pendingCommentDraft ? pendingCommentDraftIteration : null,
            comment_input_focused: commentInputFocused,
            last_comment_focus_iteration: lastCommentFocusIteration >= 0 ? lastCommentFocusIteration : null,
            note: `Progress ${estimatedCommentsSubmitted}/${requiredCommentCountBeforeDone} comments`
          });
        }

        // 5. Wait
        await sleep(config.action_delay);
        markActivity();

      } catch (e) {
        console.error(`❌ Error:`, e);
        updateRunProgress({ note: `Iteration error: ${String((e as any)?.message || e)}` });
        await sleep(2000);
        markActivity();
      }
    }
  } catch (e: any) {
    runStatus = 'failed';
    completionReason = e?.message || String(e) || 'Unhandled run failure';
    console.error('❌ Fatal run failure:', e);
    updateRunProgress({ status: runStatus, completion_reason: completionReason, note: completionReason });
  }

  const capturedUrl = await captureActiveChromeUrl();
  if (doneLink) {
    finalUrl = doneLink;
  } else if (capturedUrl.success && capturedUrl.url) {
    finalUrl = capturedUrl.url;
  }

  const workflowSummary = finalizeWorkflowRun(workflowRun, runStatus === 'completed');
  console.log(
    `🧠 Workflow memory summary: sections_saved=${workflowSummary.sections_saved}, replay_success=${workflowSummary.replay_steps_succeeded}/${workflowSummary.replay_steps_used}`
  );

  if (runStatus === 'completed') {
    console.log('🧹 Completion rule: closing Chrome after successful task completion');
    updateRunProgress({ note: 'Run completed; closing Chrome' });
    try {
      const closeChromeResult = await executeAction({
        action: 'close_app',
        app_name: 'chrome',
        reasoning: 'Completion rule: close Chrome after successful task report capture'
      });
      actionsExecuted += 1;
      chromeClosed = closeChromeResult.success;
      console.log(closeChromeResult.success ? '✓ Chrome closed' : `⚠️ Chrome close failed: ${closeChromeResult.message}`);
    } catch (e: any) {
      console.error(`⚠️ Failed to close Chrome: ${e?.message || String(e)}`);
    }
  } else {
    console.log(`🧹 Skipping Chrome auto-close because run ended with status=${runStatus}.`);
    updateRunProgress({ note: `Run ended with ${runStatus}; Chrome auto-close skipped` });
  }

  const finishedAt = Date.now();
  const linksBeforeSummary = getSessionLinks();
  const report: TaskReport = {
    run_id: runId,
    requested_by_agent: requestedByAgent,
    goal,
    target_comments: targetComments,
    estimated_comments_submitted: estimatedCommentsSubmitted,
    status: runStatus,
    started_at: startedAt,
    finished_at: finishedAt,
    iterations: getIteration(),
    actions_executed: actionsExecuted,
    completion_reason: completionReason,
    final_url: finalUrl,
    done_link: doneLink,
    chrome_opened: chromeOpened,
    chrome_closed: chromeClosed,
    links_interacted: linksBeforeSummary.length,
    workflow_memory_sections_touched: workflowSummary.sections_touched,
    workflow_memory_sections_saved: workflowSummary.sections_saved,
    workflow_memory_replay_steps_used: workflowSummary.replay_steps_used,
    workflow_memory_replay_steps_succeeded: workflowSummary.replay_steps_succeeded,
    workflow_memory_replay_steps_failed: workflowSummary.replay_steps_failed,
    required_comments_before_done: requiredCommentCountBeforeDone,
    comment_submit_attempts: commentSubmitAttempts,
    comment_submit_successes: commentSubmitSuccesses,
    comment_submit_failures: commentSubmitFailures,
    duplicate_comments_blocked: duplicateCommentsBlocked,
    done_actions_blocked: doneActionsBlocked,
    grace_iterations_added: grantedCommentGraceIterations,
    fallback_submit_overrides: fallbackSubmitOverrides,
    prepared_comment_autofills: preparedCommentAutoFills
  };

  updateRunProgress({
    status: runStatus,
    finished_at: finishedAt,
    iteration: getIteration(),
    iteration_limit: iterationLimit,
    actions_executed: actionsExecuted,
    estimated_comments_submitted: estimatedCommentsSubmitted,
    pending_comment_draft: false,
    pending_comment_draft_iteration: null,
    comment_input_focused: false,
    last_comment_focus_iteration: lastCommentFocusIteration >= 0 ? lastCommentFocusIteration : null,
    comment_submit_attempts: commentSubmitAttempts,
    comment_submit_successes: commentSubmitSuccesses,
    comment_submit_failures: commentSubmitFailures,
    duplicate_comments_blocked: duplicateCommentsBlocked,
    done_actions_blocked: doneActionsBlocked,
    grace_iterations_added: grantedCommentGraceIterations,
    fallback_submit_overrides: fallbackSubmitOverrides,
    prepared_comment_ready: Boolean(preparedCommentText),
    prepared_comment_autofills: preparedCommentAutoFills,
    completion_reason: completionReason,
    note: `Run finished with status=${runStatus}`
  });

  rememberTaskReport(report);
  await appendTaskReportToLog(report);
  markActivity();

  const reportDescription = `STATUS=${report.status}; URL=${report.final_url || 'not_captured'}; COMPLETION=${report.completion_reason}; ACTIONS=${report.actions_executed}; ITERATIONS=${report.iterations}`;
  addSessionLink({
    url: report.final_url || report.done_link || undefined,
    description: reportDescription,
    action: 'task_report',
    timestamp: Date.now()
  });

  // Print session summary with links
  const sessionLinks = getSessionLinks();
  if (sessionLinks.length > 0) {
    console.log('\n========================================');
    console.log('📋 SESSION SUMMARY - LINKS INTERACTED:');
    console.log('========================================');
    sessionLinks.forEach((link, idx) => {
      console.log(`${idx + 1}. [${link.action.toUpperCase()}] ${link.url || 'No URL'}`);
      console.log(`   Description: ${link.description}`);
    });
    console.log('========================================\n');
  }

  isRunning = false;
  currentGoal = '';
  currentRunId = null;
  currentMaxIterations = null;
  runStartedAt = null;
  markActivity();
  console.log('\n========================================');
  console.log('🏁 Finished');
  console.log('========================================\n');

  return report;
}

// Start server
async function start() {
  console.log('\n🐭 SmartMouse v2.0 - TypeScript');
  console.log('========================================');
  const runtimeConfig = loadConfig();
  console.log('📍 LOCAL Vision: Transformers.js');
  console.log(`📍 AI Brain: ${runtimeConfig.model}`);
  console.log('========================================\n');

  if (!isConfigured()) {
    console.log('⚠️ WARNING: API key not configured!');
    console.log('📝 Edit config.json or POST to /config\n');
  } else {
    console.log('✅ API key configured\n');
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log('\nEndpoints:');
    console.log('  GET  /            - Status');
    console.log('  POST /init        - Load vision model');
    console.log('  GET  /screenshot  - Analyze screen');
    console.log('  POST /run         - Execute goal {"goal":"..."}');
    console.log('  POST /stop        - Stop execution');
    console.log('  GET  /report      - Last task report (or ?run_id=<id>)');
    console.log('  GET  /config      - View config');
    console.log('  POST /config      - Update config\n');
  });
}

start().catch(console.error);

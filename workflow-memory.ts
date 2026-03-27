import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface WorkflowMemoryOptions {
  enabled: boolean;
  min_successful_runs: number;
  min_success_rate: number;
  max_saved_actions: number;
  max_replay_steps_per_section: number;
}

export interface WorkflowSectionContext {
  site: string;
  section: string;
  intent: string;
  key: string;
}

export interface WorkflowActionTemplate {
  action: string;
  x?: number;
  y?: number;
  amount?: number;
  key?: string;
  combo?: string[];
  direction?: string;
  seconds?: number;
  url?: string;
  button?: 'left' | 'right' | 'middle';
  double?: boolean;
}

interface WorkflowSectionMemory {
  key: string;
  site: string;
  section: string;
  intent: string;
  success_count: number;
  failure_count: number;
  actions: WorkflowActionTemplate[];
  last_updated_at: number;
}

interface WorkflowMemoryStore {
  version: number;
  updated_at: number;
  sections: Record<string, WorkflowSectionMemory>;
}

export interface WorkflowReplaySuggestion {
  section_key: string;
  step: number;
  total: number;
  action: Record<string, unknown>;
}

export interface WorkflowRunState {
  goal: string;
  options: WorkflowMemoryOptions;
  touched_sections: Set<string>;
  section_traces: Map<string, WorkflowActionTemplate[]>;
  replay_cursor_by_section: Map<string, number>;
  replay_disabled_sections: Set<string>;
  replay_steps_used: number;
  replay_steps_succeeded: number;
  replay_steps_failed: number;
}

export type WorkflowActionSource = 'ai' | 'memory';

export interface WorkflowRunSummary {
  enabled: boolean;
  sections_touched: number;
  sections_saved: number;
  replay_steps_used: number;
  replay_steps_succeeded: number;
  replay_steps_failed: number;
  learned_sections: number;
}

export interface WorkflowMemoryStats {
  enabled: boolean;
  learned_sections: number;
  file_path: string;
  updated_at: number;
}

type DetectionLike = {
  label?: string;
  text?: string;
  box?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  center?: {
    x?: number;
    y?: number;
  };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_STORED_SECTIONS = 300;

const REPLAYABLE_ACTIONS = new Set([
  'open_url',
  'click',
  'double_click',
  'right_click',
  'press',
  'hotkey',
  'scroll',
  'wait',
  'move'
]);

const POINTER_ACTIONS = new Set(['click', 'double_click', 'right_click', 'move']);
const SAFE_REPLAY_KEYS = new Set([
  'escape',
  'esc',
  'tab',
  'left',
  'right',
  'up',
  'down',
  'pageup',
  'pagedown',
  'pgup',
  'pgdn',
  'home',
  'end',
  'f5'
]);

const SAFE_REPLAY_HOTKEYS = new Set([
  'ctrl+l',
  'ctrl+r',
  'ctrl+shift+r'
]);

function normalizeHotkeyCombo(combo: string[]): string {
  return combo
    .map((part) => String(part || '').trim().toLowerCase())
    .filter((part) => part.length > 0)
    .join('+');
}

function isKnownSocialSite(site: string): boolean {
  return ['instagram', 'youtube', 'tiktok', 'facebook', 'linkedin', 'x'].includes(site);
}

function urlMatchesSite(site: string, rawUrl: string): boolean {
  const trimmedSite = String(site || '').trim().toLowerCase();
  if (!trimmedSite) return true;

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    if (trimmedSite === 'youtube') return host.includes('youtube.com') || host.includes('youtu.be');
    if (trimmedSite === 'x') return host.includes('x.com') || host.includes('twitter.com');
    return host.includes(`${trimmedSite}.com`);
  } catch {
    return false;
  }
}

let cachedStore: WorkflowMemoryStore | null = null;

function memoryFilePath(): string {
  return path.join(__dirname, 'logs', 'workflow-memory.json');
}

function createEmptyStore(): WorkflowMemoryStore {
  return {
    version: 1,
    updated_at: Date.now(),
    sections: {}
  };
}

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function toPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = asNumber(value);
  if (parsed === undefined) return fallback;
  return clamp(Math.floor(parsed), min, max);
}

function toRate(value: unknown, fallback: number): number {
  const parsed = asNumber(value);
  if (parsed === undefined) return fallback;
  return clamp(parsed, 0, 1);
}

function normalizeCombo(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const normalized = value
    .map((part) => String(part || '').trim().toLowerCase())
    .filter((part) => part.length > 0)
    .slice(0, 4);

  return normalized.length > 0 ? normalized : undefined;
}

function sanitizeStoredAction(
  rawAction: unknown,
  context?: Pick<WorkflowSectionContext, 'site' | 'section' | 'intent'>
): WorkflowActionTemplate | null {
  if (!rawAction || typeof rawAction !== 'object') return null;

  const actionValue = String((rawAction as any).action || '').trim().toLowerCase();
  if (!REPLAYABLE_ACTIONS.has(actionValue)) return null;

  if (context && context.site === 'web' && context.section === 'general') {
    return null;
  }

  if (POINTER_ACTIONS.has(actionValue)) {
    return null;
  }

  const normalized: WorkflowActionTemplate = {
    action: actionValue
  };

  const x = asNumber((rawAction as any).x);
  const y = asNumber((rawAction as any).y);
  const amount = asNumber((rawAction as any).amount);
  const seconds = asNumber((rawAction as any).seconds);

  if (x !== undefined) normalized.x = Math.round(x);
  if (y !== undefined) normalized.y = Math.round(y);
  if (amount !== undefined) normalized.amount = clamp(Math.round(amount), 1, 20);
  if (seconds !== undefined) normalized.seconds = clamp(Math.round(seconds), 1, 12);

  if (typeof (rawAction as any).key === 'string') {
    const key = (rawAction as any).key.trim();
    if (key) {
      if (actionValue === 'press' && !SAFE_REPLAY_KEYS.has(key.toLowerCase())) {
        return null;
      }

      normalized.key = key;
    }
  }

  const combo = normalizeCombo((rawAction as any).combo);
  if (combo) {
    if (actionValue === 'hotkey') {
      const comboKey = normalizeHotkeyCombo(combo);
      if (!SAFE_REPLAY_HOTKEYS.has(comboKey)) {
        return null;
      }
    }

    normalized.combo = combo;
  }

  if (typeof (rawAction as any).direction === 'string') {
    const direction = (rawAction as any).direction.trim().toLowerCase();
    if (direction === 'up' || direction === 'down') {
      normalized.direction = direction;
    }
  }

  if (typeof (rawAction as any).url === 'string') {
    const url = (rawAction as any).url.trim();
    if (url) {
      if (context && isKnownSocialSite(context.site) && !urlMatchesSite(context.site, url)) {
        return null;
      }

      normalized.url = url;
    }
  }

  if (typeof (rawAction as any).button === 'string') {
    const button = (rawAction as any).button.trim().toLowerCase();
    if (button === 'left' || button === 'right' || button === 'middle') {
      normalized.button = button;
    }
  }

  if (typeof (rawAction as any).double === 'boolean') {
    normalized.double = (rawAction as any).double;
  }

  return normalized;
}

function normalizeStore(rawStore: unknown): WorkflowMemoryStore {
  const fallback = createEmptyStore();

  if (!rawStore || typeof rawStore !== 'object') {
    return fallback;
  }

  const rawSections = (rawStore as any).sections;
  const sections: Record<string, WorkflowSectionMemory> = {};

  if (rawSections && typeof rawSections === 'object') {
    for (const [key, rawSection] of Object.entries(rawSections)) {
      if (!key || typeof rawSection !== 'object' || !rawSection) continue;

      const safeKey = String(key).trim();
      if (!safeKey) continue;

      const rawActions: unknown[] = Array.isArray((rawSection as any).actions) ? (rawSection as any).actions : [];
      const [site = 'web', section = 'general', intent = 'general'] = safeKey.split(':');
      const context = { site, section, intent };
      const actions = rawActions
        .map((action: unknown) => sanitizeStoredAction(action, context))
        .filter((action: WorkflowActionTemplate | null): action is WorkflowActionTemplate => !!action);

      sections[safeKey] = {
        key: safeKey,
        site: typeof (rawSection as any).site === 'string' ? (rawSection as any).site : site,
        section: typeof (rawSection as any).section === 'string' ? (rawSection as any).section : section,
        intent: typeof (rawSection as any).intent === 'string' ? (rawSection as any).intent : intent,
        success_count: toPositiveInt((rawSection as any).success_count, 0, 0, 100000),
        failure_count: toPositiveInt((rawSection as any).failure_count, 0, 0, 100000),
        actions,
        last_updated_at: toPositiveInt((rawSection as any).last_updated_at, Date.now(), 0, Number.MAX_SAFE_INTEGER)
      };
    }
  }

  return {
    version: toPositiveInt((rawStore as any).version, 1, 1, 100),
    updated_at: toPositiveInt((rawStore as any).updated_at, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    sections
  };
}

function readStore(): WorkflowMemoryStore {
  if (cachedStore) return cachedStore;

  try {
    const filePath = memoryFilePath();
    if (!fs.existsSync(filePath)) {
      cachedStore = createEmptyStore();
      return cachedStore;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    cachedStore = normalizeStore(parsed);
    return cachedStore;
  } catch {
    cachedStore = createEmptyStore();
    return cachedStore;
  }
}

function pruneSections(store: WorkflowMemoryStore): void {
  const keys = Object.keys(store.sections);
  if (keys.length <= MAX_STORED_SECTIONS) return;

  const sorted = keys
    .map((key) => ({
      key,
      updated: store.sections[key]?.last_updated_at || 0
    }))
    .sort((left, right) => right.updated - left.updated);

  const keep = new Set(sorted.slice(0, MAX_STORED_SECTIONS).map((item) => item.key));

  for (const key of keys) {
    if (!keep.has(key)) {
      delete store.sections[key];
    }
  }
}

function persistStore(store: WorkflowMemoryStore): void {
  pruneSections(store);
  store.updated_at = Date.now();

  const filePath = memoryFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');
  cachedStore = store;
}

function actionSignature(action: WorkflowActionTemplate): string {
  return [
    action.action,
    action.x ?? '',
    action.y ?? '',
    action.amount ?? '',
    action.key ?? '',
    action.combo?.join('+') ?? '',
    action.direction ?? '',
    action.seconds ?? '',
    action.url ?? '',
    action.button ?? '',
    action.double === true ? '1' : action.double === false ? '0' : ''
  ].join('|');
}

function resolveOptions(config: unknown): WorkflowMemoryOptions {
  const source = config && typeof config === 'object'
    ? config as Record<string, unknown>
    : {};

  return {
    enabled: toBoolean(source.workflow_memory_enabled, true),
    min_successful_runs: toPositiveInt(source.workflow_memory_min_successful_runs, 2, 1, 10),
    min_success_rate: toRate(source.workflow_memory_min_success_rate, 0.8),
    max_saved_actions: toPositiveInt(source.workflow_memory_max_saved_actions, 8, 3, 20),
    max_replay_steps_per_section: toPositiveInt(source.workflow_memory_max_replay_steps_per_section, 2, 1, 10)
  };
}

function collectTextFromDetections(detectedObjects: DetectionLike[]): string {
  const chunks: string[] = [];

  for (const obj of detectedObjects) {
    if (typeof obj.label === 'string' && obj.label.trim()) {
      chunks.push(obj.label.trim());
    }

    if (typeof obj.text === 'string' && obj.text.trim()) {
      chunks.push(obj.text.trim());
    }
  }

  return chunks.join(' ').toLowerCase();
}

function inferSite(goal: string, detectionText: string): string {
  const haystack = `${goal.toLowerCase()} ${detectionText}`;

  if (haystack.includes('instagram')) return 'instagram';
  if (haystack.includes('youtube') || /\byt\b/.test(haystack)) return 'youtube';
  if (haystack.includes('tiktok')) return 'tiktok';
  if (haystack.includes('facebook')) return 'facebook';
  if (haystack.includes('linkedin')) return 'linkedin';
  if (haystack.includes('twitter') || /\bx\.com\b/.test(haystack)) return 'x';

  return 'web';
}

function inferIntent(goal: string): string {
  const normalized = goal.toLowerCase();

  const hasComment = /\bcomment|reply|respond\b/.test(normalized);
  const hasLike = /\blike|heart\b/.test(normalized);
  const hasNotification = /\bnotification|inbox|unread\b/.test(normalized);

  if (hasComment && hasNotification) return 'comment_notifications';
  if (hasComment) return 'comment';
  if (hasLike) return 'like';
  if (hasNotification) return 'notifications';
  if (/\bsearch|find\b/.test(normalized)) return 'search';

  return 'general';
}

function inferSection(detectionText: string): string {
  if (/\bnotification|notifications|inbox|unread|bell\b/.test(detectionText)) {
    return 'notifications';
  }

  if (/\badd\s+(a\s+)?comment|write\s+(a\s+)?comment|comment\s+as|reply\b/.test(detectionText)) {
    return 'comment_panel';
  }

  if (/\bsearch|results|top\s+results|recent\b/.test(detectionText)) {
    return 'search_results';
  }

  if (/\bexplore|for\s+you|following|home\b/.test(detectionText)) {
    return 'feed';
  }

  if (/\blikes|views|reel|video|post\b/.test(detectionText)) {
    return 'post_view';
  }

  return 'general';
}

function buildContext(goal: string, detectedObjects: DetectionLike[]): WorkflowSectionContext {
  const text = collectTextFromDetections(detectedObjects);
  const site = inferSite(goal, text);
  const section = inferSection(text);
  const intent = inferIntent(goal);
  const key = `${site}:${section}:${intent}`;

  return { site, section, intent, key };
}

function getOrCreateSection(store: WorkflowMemoryStore, context: WorkflowSectionContext): WorkflowSectionMemory {
  const existing = store.sections[context.key];
  if (existing) return existing;

  const created: WorkflowSectionMemory = {
    key: context.key,
    site: context.site,
    section: context.section,
    intent: context.intent,
    success_count: 0,
    failure_count: 0,
    actions: [],
    last_updated_at: Date.now()
  };

  store.sections[context.key] = created;
  return created;
}

function shouldReplayFromSection(
  section: WorkflowSectionMemory,
  options: WorkflowMemoryOptions
): boolean {
  const totalAttempts = section.success_count + section.failure_count;
  const successRate = totalAttempts > 0 ? section.success_count / totalAttempts : 0;

  if (section.success_count < options.min_successful_runs) return false;
  if (successRate < options.min_success_rate) return false;
  if (section.actions.length === 0) return false;

  return true;
}

function formatActionForPrompt(action: WorkflowActionTemplate): string {
  const payload: Record<string, unknown> = { action: action.action };

  if (action.x !== undefined) payload.x = action.x;
  if (action.y !== undefined) payload.y = action.y;
  if (action.amount !== undefined) payload.amount = action.amount;
  if (action.key !== undefined) payload.key = action.key;
  if (action.combo !== undefined) payload.combo = action.combo;
  if (action.direction !== undefined) payload.direction = action.direction;
  if (action.seconds !== undefined) payload.seconds = action.seconds;
  if (action.url !== undefined) payload.url = action.url;
  if (action.button !== undefined) payload.button = action.button;
  if (action.double !== undefined) payload.double = action.double;

  return JSON.stringify(payload);
}

export function beginWorkflowRun(goal: string, config: unknown): WorkflowRunState {
  return {
    goal,
    options: resolveOptions(config),
    touched_sections: new Set<string>(),
    section_traces: new Map<string, WorkflowActionTemplate[]>(),
    replay_cursor_by_section: new Map<string, number>(),
    replay_disabled_sections: new Set<string>(),
    replay_steps_used: 0,
    replay_steps_succeeded: 0,
    replay_steps_failed: 0
  };
}

export function deriveWorkflowSection(goal: string, detectedObjects: DetectionLike[]): WorkflowSectionContext {
  return buildContext(goal, detectedObjects || []);
}

export function getWorkflowPromptHints(
  run: WorkflowRunState,
  context: WorkflowSectionContext
): string | null {
  if (!run.options.enabled) return null;

  const store = readStore();
  const section = store.sections[context.key];
  if (!section || section.actions.length === 0) return null;
  if (!shouldReplayFromSection(section, run.options)) return null;

  const totalAttempts = section.success_count + section.failure_count;
  const successRate = totalAttempts > 0 ? Math.round((section.success_count / totalAttempts) * 100) : 0;
  const steps = section.actions
    .slice(0, Math.min(section.actions.length, run.options.max_replay_steps_per_section))
    .map((action, index) => `${index + 1}. ${formatActionForPrompt(action)}`)
    .join('\n');

  return [
    `Learned workflow context key: ${context.key}`,
    `Past performance: ${section.success_count}/${totalAttempts} successful (${successRate}%)`,
    'Preferred sequence when screen context matches:',
    steps
  ].join('\n');
}

export function getWorkflowReplaySuggestion(
  run: WorkflowRunState,
  context: WorkflowSectionContext
): WorkflowReplaySuggestion | null {
  run.touched_sections.add(context.key);

  if (!run.options.enabled) return null;
  if (run.replay_disabled_sections.has(context.key)) return null;

  const store = readStore();
  const section = store.sections[context.key];
  if (!section || !shouldReplayFromSection(section, run.options)) {
    return null;
  }

  const cursor = run.replay_cursor_by_section.get(context.key) || 0;
  if (cursor >= section.actions.length) return null;
  if (cursor >= run.options.max_replay_steps_per_section) return null;

  const template = section.actions[cursor];
  run.replay_cursor_by_section.set(context.key, cursor + 1);
  run.replay_steps_used += 1;

  const replayAction: Record<string, unknown> = {
    ...template,
    reasoning: `Workflow memory replay ${cursor + 1}/${section.actions.length} for ${context.key}`
  };

  return {
    section_key: context.key,
    step: cursor + 1,
    total: section.actions.length,
    action: replayAction
  };
}

export function recordWorkflowActionOutcome(
  run: WorkflowRunState,
  context: WorkflowSectionContext,
  action: unknown,
  success: boolean,
  source: WorkflowActionSource
): void {
  run.touched_sections.add(context.key);

  if (source === 'memory') {
    if (success) {
      run.replay_steps_succeeded += 1;
    } else {
      run.replay_steps_failed += 1;
      run.replay_disabled_sections.add(context.key);
    }
  }

  if (!success) return;

  const sanitized = sanitizeStoredAction(action, context);
  if (!sanitized) return;

  const trace = run.section_traces.get(context.key) || [];
  if (trace.length > 0) {
    const previous = trace[trace.length - 1];
    if (actionSignature(previous) === actionSignature(sanitized)) {
      run.section_traces.set(context.key, trace);
      return;
    }
  }

  if (trace.length < run.options.max_saved_actions) {
    trace.push(sanitized);
  }

  run.section_traces.set(context.key, trace);
}

export function finalizeWorkflowRun(run: WorkflowRunState, runSucceeded: boolean): WorkflowRunSummary {
  const store = readStore();

  if (!run.options.enabled) {
    return {
      enabled: false,
      sections_touched: run.touched_sections.size,
      sections_saved: 0,
      replay_steps_used: run.replay_steps_used,
      replay_steps_succeeded: run.replay_steps_succeeded,
      replay_steps_failed: run.replay_steps_failed,
      learned_sections: Object.keys(store.sections).length
    };
  }

  let sectionsSaved = 0;
  const now = Date.now();
  const candidateKeys = new Set<string>([
    ...run.touched_sections,
    ...run.section_traces.keys()
  ]);

  for (const sectionKey of candidateKeys) {
    const trace = run.section_traces.get(sectionKey) || [];
    const replayFailed = run.replay_disabled_sections.has(sectionKey);
    const sectionContextParts = sectionKey.split(':');

    const sectionContext: WorkflowSectionContext = {
      site: sectionContextParts[0] || 'web',
      section: sectionContextParts[1] || 'general',
      intent: sectionContextParts[2] || 'general',
      key: sectionKey
    };

    const section = getOrCreateSection(store, sectionContext);
    const hasUsefulTrace = trace.length >= 2;
    const sectionSucceeded = runSucceeded || (hasUsefulTrace && !replayFailed);

    if (sectionSucceeded && trace.length > 0) {
      section.success_count += 1;
      section.last_updated_at = now;

      if (
        section.actions.length === 0 ||
        trace.length <= section.actions.length ||
        runSucceeded
      ) {
        section.actions = trace.slice(0, run.options.max_saved_actions);
      }

      sectionsSaved += 1;
      continue;
    }

    if (trace.length > 0 || replayFailed) {
      section.failure_count += 1;
      section.last_updated_at = now;
    }
  }

  persistStore(store);

  return {
    enabled: true,
    sections_touched: run.touched_sections.size,
    sections_saved: sectionsSaved,
    replay_steps_used: run.replay_steps_used,
    replay_steps_succeeded: run.replay_steps_succeeded,
    replay_steps_failed: run.replay_steps_failed,
    learned_sections: Object.keys(store.sections).length
  };
}

export function getWorkflowMemoryStats(config: unknown): WorkflowMemoryStats {
  const store = readStore();
  const options = resolveOptions(config);

  return {
    enabled: options.enabled,
    learned_sections: Object.keys(store.sections).length,
    file_path: memoryFilePath(),
    updated_at: store.updated_at
  };
}

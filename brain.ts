/**
 * SmartMouse Brain - Model-driven Decision Making
 * NO hardcoded rules - AI decides EVERYTHING
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Config {
  api_key: string;
  api_base_url: string;
  model: string;
  planner_model?: string;
  planner_enabled?: boolean;
  planner_refresh_iterations?: number;
  planner_max_tokens?: number;
  planner_temperature?: number;
  max_tokens: number;
  temperature: number;
  max_iterations: number;
  action_delay: number;
  workflow_memory_enabled?: boolean;
  workflow_memory_min_successful_runs?: number;
  workflow_memory_min_success_rate?: number;
  workflow_memory_max_saved_actions?: number;
  workflow_memory_max_replay_steps_per_section?: number;
}

export interface Action {
  action: string;
  x?: number;
  y?: number;
  amount?: number;
  text?: string;
  key?: string;
  combo?: string[];
  direction?: string;
  seconds?: number;
  app_name?: string;
  app?: string;
  url?: string;
  target_id?: string;
  target_label?: string;
  target_text?: string;
  button?: 'left' | 'right' | 'middle';
  double?: boolean;
  reasoning: string;
  link?: string;  // URL or page identifier for tracking
}

export interface SessionLink {
  url?: string;
  description: string;
  action: string;
  timestamp: number;
}

export interface DetectedObject {
  label: string;
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

export interface VisionData {
  description: string;
  screen_size: { width: number; height: number };
  screenshot_path: string;
  timestamp: number;
  local_processing: boolean;
  detected_objects: DetectedObject[];
  error?: string;
}

let config: Config | null = null;
let history: { role: string; content: string }[] = [];
let iteration = 0;
let sessionLinks: SessionLink[] = [];
let planCache: { goal: string; plan: string; updated_iteration: number } | null = null;

const DEFAULT_CONFIG: Config = {
  api_key: '',
  api_base_url: 'https://coding-intl.dashscope.aliyuncs.com/v1',
  model: 'qwen3.5-plus',
  planner_model: 'qwen3-max-2026-01-23',
  planner_enabled: true,
  planner_refresh_iterations: 8,
  planner_max_tokens: 512,
  planner_temperature: 0.2,
  max_tokens: 2048,
  temperature: 0.7,
  max_iterations: 50,
  action_delay: 1500,
  workflow_memory_enabled: true,
  workflow_memory_min_successful_runs: 2,
  workflow_memory_min_success_rate: 0.8,
  workflow_memory_max_saved_actions: 8,
  workflow_memory_max_replay_steps_per_section: 2
};

export function loadConfig(): Config {
  if (config) return config;
  
  try {
    const content = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8');
    const parsed = JSON.parse(content) as Partial<Config>;
    config = { ...DEFAULT_CONFIG, ...parsed };
    return config!;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function reloadConfig(): Config {
  config = null;
  return loadConfig();
}

export function isConfigured(): boolean {
  return !!loadConfig().api_key;
}

let lastApiError: string | null = null;

export async function callAPI(
  messages: { role: string; content: string }[],
  options?: {
    model?: string;
    max_tokens?: number;
    temperature?: number;
  }
): Promise<string | null> {
  const cfg = loadConfig();
  if (!cfg.api_key) {
    lastApiError = 'API key not configured';
    return null;
  }

  const model = options?.model || cfg.model;
  const maxTokens = Number.isFinite(options?.max_tokens as number)
    ? Math.max(64, Math.floor(Number(options?.max_tokens)))
    : cfg.max_tokens;
  const temperature = Number.isFinite(options?.temperature as number)
    ? Math.max(0, Math.min(1.2, Number(options?.temperature)))
    : cfg.temperature;

  try {
    lastApiError = null;
    console.log(`🌐 Calling API: ${cfg.api_base_url}/chat/completions (model=${model})`);
    
    const res = await fetch(`${cfg.api_base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature
      })
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      lastApiError = `API error ${res.status}: ${errorText}`;
      console.error(lastApiError);
      return null;
    }

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content || null;
  } catch (e: any) {
    lastApiError = `API call failed: ${e.message || String(e)}`;
    console.error(lastApiError);
    return null;
  }
}

export function getApiError(): string | null {
  return lastApiError;
}

function getSystemPrompt(): string {
  return `You are SmartMouse, an AI desktop automation agent controlling a real mouse and keyboard.

You receive OCR-based screen descriptions with text and coordinates.
OCR may miss icon-only controls. Infer likely click targets from nearby text.

RULES:
1) Return exactly one valid JSON action object only.
2) Complete all requested steps before returning done.
3) Do not return done right after drafting text unless a send/submit/post/reply action has happened.
4) After major navigation (open_url/open_app/new page), wait 3-6 seconds.
5) If a step fails, switch strategy on the next action instead of repeating the same failure.
6) Avoid loops by changing approach when progress stalls.
7) For comment/message/reply/inbox tasks, finish each text draft with a clear send/submit action before leaving context.
8) If blocked by login/auth, explain that blocker in done reasoning.

PREFERRED WEB WORKFLOW:
- Navigate to target page.
- Wait for page load.
- Locate actionable text anchors (Inbox, Messages, Reply, Comment, Send, Post, Publish, Next).
- Focus input before typing long text.
- Submit and verify progression.

AVAILABLE ACTIONS:
{"action":"click","x":N,"y":N,"button":"left","double":false,"reasoning":"..."}
{"action":"type","text":"...","reasoning":"..."}
{"action":"press","key":"enter|tab|escape|space|backspace|up|down|left|right|F5","reasoning":"..."}
{"action":"hotkey","combo":["ctrl","l"],"reasoning":"..."}
{"action":"hotkey","combo":["alt","left"],"reasoning":"..."}
{"action":"scroll","direction":"up|down","amount":5,"reasoning":"..."}
{"action":"wait","seconds":4,"reasoning":"..."}
{"action":"open_url","url":"https://...","reasoning":"..."}
{"action":"open_app","app_name":"chrome","reasoning":"..."}
{"action":"move","x":N,"y":N,"reasoning":"..."}
{"action":"done","reasoning":"clear summary of completed outcomes or blocker","link":"final url"}

Include link when available for interacted content.
Return done only when outcomes are actually completed or impossible due to clear blockers.`;
}

export function getKeyboardOnlySystemPrompt(): string {
  return `You are SmartMouse Keyboard Navigator - an AI automation agent using ONLY keyboard navigation.

KEYBOARD-ONLY MODE:
- NO mouse clicks allowed
- ONLY keyboard: Tab (move focus), Enter (activate), arrows (scroll/move), Ctrl+A (select all), Ctrl+C (copy), Ctrl+V (paste)
- Read OCR text to infer form fields and buttons
- Use Tab to cycle through interactive elements
- Use Enter to activate buttons/links
- Use arrow keys to navigate menus/lists

RULES:
1) Return exactly one valid JSON action only
2) Use Tab to navigate focus to the next interactive element
3) Use Enter to activate (click equivalent)
4) Use arrow keys for up/down/left/right navigation within menus/lists
5) Type text ONLY after confirming focus is in a text input field
6) For search boxes: Tab to field → Type query → Press Enter
7) For forms: Press Tab until focused on desired field → Type or Select → Tab to next → Repeat
8) For comments: Tab to textarea → Type comment → Tab to Submit button → Press Enter
9) Wait 2-3 seconds after page loads before pressing Tab
10) Complete all steps before returning done

AVAILABLE ACTIONS (KEYBOARD ONLY):
{"action":"open_app","app_name":"chrome","reasoning":"..."}
{"action":"open_url","url":"https://...","reasoning":"..."}
{"action":"wait","seconds":N,"reasoning":"..."}
{"action":"press","key":"tab|enter|escape|space|backspace|up|down|left|right|ctrl+a|ctrl+c|ctrl+v","reasoning":"..."}
{"action":"type","text":"...","reasoning":"..."}
{"action":"hotkey","combo":["ctrl","a"],"reasoning":"..."}
{"action":"done","reasoning":"clear summary of completed outcomes or blocker","link":"final url if known"}

EXAMPLE WORKFLOWS:
- SEARCH: open_url(youtube.com) → wait(3) → press(tab)x3 → type("search term") → press(enter)
- COMMENT: press(tab)x5 → type("comment text") → press(tab) → press(enter)
- LOGIN: press(tab) → type(username) → press(tab) → type(password) → press(enter)

Return done only when task is truly completed or impossible.`;
}

function buildPrompt(vision: VisionData, goal: string): string {
  const topObjects = (vision.detected_objects || [])
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 220);

  let objectsInfo = '\n\nDETECTED UI ELEMENTS:\n';
  objectsInfo += 'Format: [id] label | text | source | confidence | center | box\n';

  if (topObjects.length === 0) {
    objectsInfo += '  (none)\n';
  } else {
    for (const obj of topObjects) {
      const objectId = (obj as any).id || 'n/a';
      const text = ((obj as any).text || '').trim();
      const source = (obj as any).source || 'detector';
      const textPart = text ? ` | text="${text}"` : '';
      objectsInfo += `  - [${objectId}] ${obj.label}${textPart} | src=${source} | conf=${Math.round(obj.confidence * 100)}% | center=(${obj.center.x},${obj.center.y}) | box=(${obj.box.x},${obj.box.y},${obj.box.width},${obj.box.height})\n`;
    }
  }
  
  return `SCREEN DATA:
Description: ${vision.description}
Size: ${vision.screen_size.width}x${vision.screen_size.height}
Local processing: ${vision.local_processing}
Detected count total: ${vision.detected_objects?.length || 0}${objectsInfo}

GOAL: ${goal}
ITERATION: ${iteration}

Return exactly one JSON object for the best next action.`;
}

async function generateExecutionPlan(goal: string, vision: VisionData): Promise<string | null> {
  const cfg = loadConfig();
  if (cfg.planner_enabled === false) return null;

  const plannerModel = (cfg.planner_model || '').trim() || cfg.model;
  const response = await callAPI(
    [
      {
        role: 'system',
        content:
          'Create a concise 4-8 step execution plan for desktop automation. Output plain text only. Include explicit submit/send verification for comment/message/reply goals.'
      },
      {
        role: 'user',
        content: `Goal: ${goal}\nScreen: ${vision.description}\nDetected objects: ${vision.detected_objects?.length || 0}`
      }
    ],
    {
      model: plannerModel,
      max_tokens: cfg.planner_max_tokens,
      temperature: cfg.planner_temperature
    }
  );

  if (!response) return null;

  const compactPlan = response
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 10)
    .join('\n');

  return compactPlan || null;
}

function extractFirstJSONObject(input: string): string | null {
  const startIndex = input.indexOf('{');
  if (startIndex < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < input.length; index++) {
    const char = input[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return input.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function asNumber(value: any, fallback?: number): number | undefined {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function sanitizeAction(parsed: any, rawResponse: string): Action {
  const actionName = String(parsed?.action || '').trim().toLowerCase() || 'wait';

  return {
    action: actionName,
    x: asNumber(parsed?.x),
    y: asNumber(parsed?.y),
    amount: asNumber(parsed?.amount),
    text: typeof parsed?.text === 'string' ? parsed.text : undefined,
    key: typeof parsed?.key === 'string' ? parsed.key : undefined,
    combo: Array.isArray(parsed?.combo) ? parsed.combo.map((k: any) => String(k).toLowerCase()) : undefined,
    direction: typeof parsed?.direction === 'string' ? parsed.direction : undefined,
    seconds: asNumber(parsed?.seconds, actionName === 'wait' ? 2 : undefined),
    app_name: typeof parsed?.app_name === 'string' ? parsed.app_name : undefined,
    app: typeof parsed?.app === 'string' ? parsed.app : undefined,
    url: typeof parsed?.url === 'string' ? parsed.url : undefined,
    target_id: typeof parsed?.target_id === 'string' ? parsed.target_id : undefined,
    target_label: typeof parsed?.target_label === 'string' ? parsed.target_label : undefined,
    target_text: typeof parsed?.target_text === 'string' ? parsed.target_text : undefined,
    button: ['left', 'right', 'middle'].includes(String(parsed?.button || '').toLowerCase())
      ? String(parsed.button).toLowerCase() as 'left' | 'right' | 'middle'
      : undefined,
    double: typeof parsed?.double === 'boolean' ? parsed.double : undefined,
    reasoning: typeof parsed?.reasoning === 'string' ? parsed.reasoning : `From model response: ${rawResponse.slice(0, 120)}`,
    link: typeof parsed?.link === 'string' ? parsed.link : undefined
  };
}

function parseAction(response: string): Action {
  try {
    const jsonText = extractFirstJSONObject(response);
    if (jsonText) {
      const parsed = JSON.parse(jsonText);
      return sanitizeAction(parsed, response);
    }
  } catch {}

  const lower = response.toLowerCase();
  if (lower.includes('done') || lower.includes('complete')) {
    return { action: 'done', reasoning: 'Goal achieved' };
  }

  return { action: 'wait', seconds: 2, reasoning: `Could not parse: ${response.slice(0, 100)}` };
}

export async function decideAction(vision: VisionData, goal: string): Promise<Action> {
  iteration++;

  const cfg = loadConfig();
  const refreshEvery = Math.max(3, Math.floor(cfg.planner_refresh_iterations || 8));
  const shouldRefreshPlan =
    !planCache ||
    planCache.goal !== goal ||
    iteration - planCache.updated_iteration >= refreshEvery;

  if (shouldRefreshPlan) {
    const newPlan = await generateExecutionPlan(goal, vision);
    if (newPlan) {
      planCache = {
        goal,
        plan: newPlan,
        updated_iteration: iteration
      };
    }
  }

  const goalWithPlan =
    planCache?.goal === goal
      ? `${goal}\n\nEXECUTION_PLAN:\n${planCache.plan}`
      : goal;

  const userPrompt = buildPrompt(vision, goalWithPlan);

  const messages = [
    { role: 'system', content: getSystemPrompt() },
    ...history.slice(-6),
    { role: 'user', content: userPrompt }
  ];

  console.log(`🧠 Action model thinking... (iteration ${iteration})`);
  const response = await callAPI(messages, {
    model: cfg.model,
    max_tokens: cfg.max_tokens,
    temperature: cfg.temperature
  });

  if (response) {
    history.push({ role: 'user', content: userPrompt });
    history.push({ role: 'assistant', content: response });
    if (history.length > 20) history = history.slice(-20);
    return parseAction(response);
  }

  return { action: 'wait', seconds: 2, reasoning: 'API failed' };
}

export function clearHistory(): void {
  history = [];
  iteration = 0;
  sessionLinks = [];
  planCache = null;
}

export function getIteration(): number {
  return iteration;
}

export function addSessionLink(link: SessionLink): void {
  sessionLinks.push(link);
  console.log(`🔗 Tracked link: ${link.url || link.description}`);
}

export function getSessionLinks(): SessionLink[] {
  return [...sessionLinks];
}

export function trackAction(action: Action): void {
  // Track actions that involve navigation or interaction with content
  if (action.link) {
    addSessionLink({
      url: action.link,
      description: action.reasoning,
      action: action.action,
      timestamp: Date.now()
    });
  }
}

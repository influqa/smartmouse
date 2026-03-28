/**
 * SmartMouse Actions - Mouse/Keyboard Control for Windows
 * 
 * Features:
 * - Human-like mouse movements with Bezier curves
 * - Natural acceleration/deceleration
 * - Micro-jitter simulation
 * - Variable speed profiles
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { humanMoveMouse } from './human-behavior';

const execAsync = promisify(exec);

// Configuration for human-like movements
const HUMAN_MOVEMENT_ENABLED = true;

// Execute human-like mouse movement using Bezier curves
async function executeHumanMove(startX: number, startY: number, endX: number, endY: number): Promise<void> {
  const { generateHumanPath, sleep } = await import('./human-behavior');
  
  const { points, delays } = generateHumanPath(
    { x: startX, y: startY },
    { x: endX, y: endY },
    {
      useBezier: true,
      addJitter: true,
      jitterAmplitude: 1.2,
      variableSpeed: true,
      baseDelay: 6,
      acceleration: true
    }
  );

  // Execute the movement
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    await runPowerShell(`
      $sig = @"
      [DllImport("user32.dll")]
      public static extern bool SetCursorPos(int X, int Y);
"@;
      $type = Add-Type -MemberDefinition $sig -Name NativeMouse -Namespace SmartMouse -PassThru;
      [SmartMouse.NativeMouse]::SetCursorPos(${Math.round(point.x)}, ${Math.round(point.y)}) | Out-Null;
    `);
    
    // Add delay between steps
    if (i < delays.length) {
      await sleep(delays[i]);
    }
  }
}

export interface ActionResult {
  success: boolean;
  action: string;
  message: string;
  timestamp: number;
}

const isWindows = process.platform === 'win32';

function toEncodedPowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

async function runPowerShell(script: string): Promise<void> {
  const encoded = toEncodedPowerShell(script);
  await execAsync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`);
}

async function runPowerShellWithOutput(script: string): Promise<string> {
  const encoded = toEncodedPowerShell(script);
  const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`);
  return String(stdout || '').trim();
}

function psSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function mapKeyForSendKeys(key: string): string {
  const lower = key.toLowerCase();
  const keyMap: Record<string, string> = {
    enter: '{ENTER}',
    tab: '{TAB}',
    escape: '{ESC}',
    esc: '{ESC}',
    space: ' ',
    backspace: '{BACKSPACE}',
    delete: '{DELETE}',
    up: '{UP}',
    down: '{DOWN}',
    left: '{LEFT}',
    right: '{RIGHT}',
    home: '{HOME}',
    end: '{END}',
    pgup: '{PGUP}',
    pageup: '{PGUP}',
    pgdn: '{PGDN}',
    pagedown: '{PGDN}',
    f1: '{F1}',
    f2: '{F2}',
    f3: '{F3}',
    f4: '{F4}',
    f5: '{F5}',
    f6: '{F6}',
    f7: '{F7}',
    f8: '{F8}',
    f9: '{F9}',
    f10: '{F10}',
    f11: '{F11}',
    f12: '{F12}'
  };

  return keyMap[lower] || key;
}

function getPngDimensions(buffer: Buffer): { width: number; height: number } {
  if (buffer.length >= 24) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width > 0 && height > 0 && width < 10000) return { width, height };
  }
  return { width: 1920, height: 1080 };
}

export async function getScreenSize(): Promise<{ width: number; height: number }> {
  try {
    const screenshot = (await import('screenshot-desktop')).default;
    const img = await screenshot({ format: 'png' });
    return getPngDimensions(img);
  } catch {
    return { width: 1920, height: 1080 };
  }
}

export async function moveMouse(x: number, y: number, useHumanMovement: boolean = true): Promise<ActionResult> {
  try {
    if (isWindows) {
      // Use human-like movement with Bezier curves and natural acceleration
      if (HUMAN_MOVEMENT_ENABLED && useHumanMovement) {
        // Get current position first
        const currentPos = await getCursorPosition();
        const startX = currentPos.success && currentPos.x !== null ? currentPos.x : 0;
        const startY = currentPos.success && currentPos.y !== null ? currentPos.y : 0;
        
        await executeHumanMove(startX, startY, Math.round(x), Math.round(y));
      } else {
        // Direct movement (robotic, instant)
        await runPowerShell(`
          $sig = @"
          [DllImport("user32.dll")]
          public static extern bool SetCursorPos(int X, int Y);
"@;
          $type = Add-Type -MemberDefinition $sig -Name NativeMouse -Namespace SmartMouse -PassThru;
          [SmartMouse.NativeMouse]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null;
        `);
      }
    }
    return { success: true, action: 'move', message: `Moved to (${x}, ${y})`, timestamp: Date.now() };
  } catch (e: any) {
    return { success: false, action: 'move', message: e.message, timestamp: Date.now() };
  }
}

export async function click(
  x?: number,
  y?: number,
  button: 'left' | 'right' | 'middle' = 'left',
  double = false
): Promise<ActionResult> {
  try {
    if (x !== undefined && y !== undefined) {
      await moveMouse(x, y);
      await sleep(100);
    }
    
    if (isWindows) {
      const flagMap = {
        left: { down: '0x02', up: '0x04' },
        right: { down: '0x08', up: '0x10' },
        middle: { down: '0x20', up: '0x40' }
      } as const;
      const flags = flagMap[button] || flagMap.left;
      const count = double ? 2 : 1;

      await runPowerShell(`
        $sig = @"
        [DllImport("user32.dll")]
        public static extern void mouse_event(int flags, int dx, int dy, int cButtons, int dwExtraInfo);
"@;
        $type = Add-Type -MemberDefinition $sig -Name NativeMouse -Namespace SmartMouseClick -PassThru;
        for ($i = 0; $i -lt ${count}; $i++) {
          [SmartMouseClick.NativeMouse]::mouse_event(${flags.down}, 0, 0, 0, 0);
          Start-Sleep -Milliseconds 35;
          [SmartMouseClick.NativeMouse]::mouse_event(${flags.up}, 0, 0, 0, 0);
          Start-Sleep -Milliseconds 50;
        }
      `);
    }
    
    return {
      success: true,
      action: 'click',
      message: `${double ? 'Double ' : ''}${button} click${x !== undefined && y !== undefined ? ` at (${x}, ${y})` : ''}`,
      timestamp: Date.now()
    };
  } catch (e: any) {
    return { success: false, action: 'click', message: e.message, timestamp: Date.now() };
  }
}

export async function typeText(text: string, useHumanTiming: boolean = true): Promise<ActionResult> {
  try {
    if (isWindows) {
      const normalized = text.replace(/\r\n/g, '\n');

      // Use clipboard-paste for multi-char strings — far more reliable than
      // SendKeys for URLs, special characters, and non-ASCII text.
      // For single keys or short control strings fall back to SendKeys.
      const hasNewline = normalized.includes('\n');
      if (!hasNewline && normalized.length > 1) {
        if (HUMAN_MOVEMENT_ENABLED && useHumanTiming && normalized.length <= 20) {
          // Human-like typing for short texts - type character by character with natural timing
          const { getTypingDelay, sleep } = await import('./human-behavior');
          
          for (const char of normalized) {
            const escapedChar = char
              .replace(/'/g, "''")
              .replace(/([+^%~(){}\[\]])/g, '{$1}');
            
            await runPowerShell(`
              Add-Type -AssemblyName System.Windows.Forms;
              [System.Windows.Forms.SendKeys]::SendWait(${psSingleQuoted(escapedChar)});
            `);
            
            // Add human-like delay between keystrokes
            await sleep(getTypingDelay());
          }
        } else {
          // Set clipboard content, then Ctrl+V to paste (faster for long text)
          const escaped = normalized.replace(/'/g, "''");
          await runPowerShell(`
            Add-Type -AssemblyName System.Windows.Forms;
            [System.Windows.Forms.Clipboard]::SetText(${psSingleQuoted(escaped)});
            Start-Sleep -Milliseconds 80;
            [System.Windows.Forms.SendKeys]::SendWait('^v');
          `);
        }
      } else {
        const escapedSendKeys = normalized
          .replace(/'/g, "''")
          .replace(/([+^%~(){}\[\]])/g, '{$1}')
          .replace(/\n/g, '{ENTER}');
        await runPowerShell(`
          Add-Type -AssemblyName System.Windows.Forms;
          [System.Windows.Forms.SendKeys]::SendWait(${psSingleQuoted(escapedSendKeys)});
        `);
      }
    }
    return { success: true, action: 'type', message: `Typed: "${text}"`, timestamp: Date.now() };
  } catch (e: any) {
    return { success: false, action: 'type', message: e.message, timestamp: Date.now() };
  }
}

export async function pressKey(key: string): Promise<ActionResult> {
  try {
    const mapped = mapKeyForSendKeys(key);
    
    if (isWindows) {
      await runPowerShell(`
        Add-Type -AssemblyName System.Windows.Forms;
        [System.Windows.Forms.SendKeys]::SendWait(${psSingleQuoted(mapped)});
      `);
    }
    return { success: true, action: 'press', message: `Pressed: ${key}`, timestamp: Date.now() };
  } catch (e: any) {
    return { success: false, action: 'press', message: e.message, timestamp: Date.now() };
  }
}

export async function hotkey(combo: string[]): Promise<ActionResult> {
  try {
    const parts = combo.map(part => part.trim().toLowerCase()).filter(Boolean);
    if (parts.length === 0) {
      return { success: false, action: 'hotkey', message: 'No key combo provided', timestamp: Date.now() };
    }

    const modifierMap: Record<string, string> = {
      ctrl: '^',
      control: '^',
      alt: '%',
      shift: '+',
      win: '#',
      windows: '#'
    };

    let modifiers = '';
    let key = parts[parts.length - 1];

    for (let i = 0; i < parts.length - 1; i++) {
      const symbol = modifierMap[parts[i]];
      if (symbol) modifiers += symbol;
    }

    const mappedKey = mapKeyForSendKeys(key);
    const chord = `${modifiers}${mappedKey}`;

    if (isWindows) {
      await runPowerShell(`
        Add-Type -AssemblyName System.Windows.Forms;
        [System.Windows.Forms.SendKeys]::SendWait(${psSingleQuoted(chord)});
      `);
    }

    return { success: true, action: 'hotkey', message: `Pressed hotkey: ${parts.join('+')}`, timestamp: Date.now() };
  } catch (e: any) {
    return { success: false, action: 'hotkey', message: e.message, timestamp: Date.now() };
  }
}

export async function scroll(direction: 'up' | 'down', amount: number = 3, useHumanPattern: boolean = true): Promise<ActionResult> {
  try {
    if (isWindows) {
      // First move cursor to screen center so the scroll lands on the active page content
      await runPowerShell(`
        $posSig = @"
        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int X, int Y);
        [DllImport("user32.dll")]
        public static extern void mouse_event(int flags, int dx, int dy, int cButtons, int dwExtraInfo);
"@;
        $type = Add-Type -MemberDefinition $posSig -Name NativeMouse -Namespace SmartMouseScroll -PassThru;
        [SmartMouseScroll.NativeMouse]::SetCursorPos(960, 540) | Out-Null;
        Start-Sleep -Milliseconds 80;
      `);

      if (HUMAN_MOVEMENT_ENABLED && useHumanPattern) {
        // Use human-like scroll pattern with acceleration
        const { generateScrollPattern, sleep } = await import('./human-behavior');
        const { delays, amounts } = generateScrollPattern(Math.abs(amount), direction);
        
        for (let i = 0; i < delays.length; i++) {
          const delta = direction === 'up' ? 120 : -120;
          const stepAmount = Math.round(Math.abs(amounts[i]));
          
          for (let j = 0; j < stepAmount; j++) {
            await runPowerShell(`
              $sig = @"
              [DllImport("user32.dll")]
              public static extern void mouse_event(int flags, int dx, int dy, int cButtons, int dwExtraInfo);
"@;
              $type = Add-Type -MemberDefinition $sig -Name NativeMouse -Namespace SmartMouseScroll -PassThru;
              [SmartMouseScroll.NativeMouse]::mouse_event(0x0800, 0, 0, ${delta}, 0);
            `);
          }
          
          await sleep(delays[i]);
        }
      } else {
        // Standard scroll (robotic, uniform)
        const delta = direction === 'up' ? 120 : -120;
        const steps = Math.max(1, Math.min(20, Math.round(amount)));
        
        await runPowerShell(`
          $sig = @"
          [DllImport("user32.dll")]
          public static extern void mouse_event(int flags, int dx, int dy, int cButtons, int dwExtraInfo);
"@;
          $type = Add-Type -MemberDefinition $sig -Name NativeMouse -Namespace SmartMouseScroll -PassThru;
          for ($i = 0; $i -lt ${steps}; $i++) {
            [SmartMouseScroll.NativeMouse]::mouse_event(0x0800, 0, 0, ${delta}, 0);
            Start-Sleep -Milliseconds 60;
          }
        `);
      }
    }
    return { success: true, action: 'scroll', message: `Scrolled ${direction} (${amount})`, timestamp: Date.now() };
  } catch (e: any) {
    return { success: false, action: 'scroll', message: e.message, timestamp: Date.now() };
  }
}

// Map friendly app names to executable names for reliable Windows launch
const APP_EXE_MAP: Record<string, string> = {
  chrome: 'chrome.exe',
  firefox: 'firefox.exe',
  edge: 'msedge.exe',
  notepad: 'notepad.exe',
  explorer: 'explorer.exe',
  calc: 'calc.exe',
  calculator: 'calc.exe',
  paint: 'mspaint.exe'
};

export async function openApp(appName: string): Promise<ActionResult> {
  try {
    if (isWindows) {
      const safeApp = appName.trim();
      const exeName = APP_EXE_MAP[safeApp.toLowerCase()] || safeApp;
      const script = `
        $app = ${psSingleQuoted(exeName)};
        try {
          Start-Process -FilePath $app -ErrorAction Stop | Out-Null;
        } catch {
          # Try via App Paths registry (works for chrome.exe, etc.)
          try {
            $regPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\' + $app;
            $fullPath = (Get-ItemProperty $regPath -ErrorAction Stop).'(Default)';
            Start-Process -FilePath $fullPath | Out-Null;
          } catch {
            # Final fallback: shell start
            Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', ('start "" "' + $app + '"') | Out-Null;
          }
        }
      `;
      await runPowerShell(script);
      await sleep(2000);
    }
    return { success: true, action: 'open_app', message: `Opened: ${appName}`, timestamp: Date.now() };
  } catch (e: any) {
    return { success: false, action: 'open_app', message: e.message, timestamp: Date.now() };
  }
}

export async function openUrl(url: string): Promise<ActionResult> {
  try {
    if (isWindows) {
      const safeUrl = url.trim();
      // Start-Process with a URL opens it in the default browser (Chrome)
      await runPowerShell(`Start-Process ${psSingleQuoted(safeUrl)} | Out-Null`);
      // Give the OS and browser enough time to accept the open request
      await sleep(2500);
    }
    return { success: true, action: 'open_url', message: `Opened URL: ${url}`, timestamp: Date.now() };
  } catch (e: any) {
    return { success: false, action: 'open_url', message: e.message, timestamp: Date.now() };
  }
}

export async function closeApp(appName: string): Promise<ActionResult> {
  try {
    if (isWindows) {
      // Close application by process name
      const processNames: Record<string, string> = {
        chrome: 'chrome',
        firefox: 'firefox',
        edge: 'msedge',
        instagram: 'instagram',
        facebook: 'facebook',
        twitter: 'twitter',
        x: 'twitter'
      };
      const processName = processNames[appName.toLowerCase()] || appName.toLowerCase();
      await runPowerShell(`
        $name = ${psSingleQuoted(processName)};
        Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue;
      `);
      await sleep(500);
    }
    return { success: true, action: 'close_app', message: `Closed: ${appName}`, timestamp: Date.now() };
  } catch (e: any) {
    return { success: false, action: 'close_app', message: e.message, timestamp: Date.now() };
  }
}

export interface CaptureUrlResult {
  success: boolean;
  url: string | null;
  message: string;
  timestamp: number;
}

export interface CursorPositionResult {
  success: boolean;
  x: number | null;
  y: number | null;
  message: string;
  timestamp: number;
}

export async function getCursorPosition(): Promise<CursorPositionResult> {
  try {
    if (!isWindows) {
      return {
        success: false,
        x: null,
        y: null,
        message: 'Cursor capture is only supported on Windows',
        timestamp: Date.now()
      };
    }

    const result = await runPowerShellWithOutput(`
      $sig = @"
      [StructLayout(LayoutKind.Sequential)]
      public struct POINT {
        public int X;
        public int Y;
      }

      [DllImport("user32.dll")]
      public static extern bool GetCursorPos(out POINT lpPoint);
"@;
      $type = Add-Type -MemberDefinition $sig -Name NativeCursor -Namespace SmartMouseCursor -PassThru;
      $p = New-Object SmartMouseCursor.POINT;
      if ([SmartMouseCursor.NativeCursor]::GetCursorPos([ref]$p)) {
        Write-Output ($p.X.ToString() + ',' + $p.Y.ToString());
      }
    `);

    const match = result.match(/^(-?\d+),(-?\d+)$/);
    if (!match) {
      return {
        success: false,
        x: null,
        y: null,
        message: 'Could not capture cursor position',
        timestamp: Date.now()
      };
    }

    return {
      success: true,
      x: Number(match[1]),
      y: Number(match[2]),
      message: 'Cursor position captured',
      timestamp: Date.now()
    };
  } catch (e: any) {
    return {
      success: false,
      x: null,
      y: null,
      message: e.message,
      timestamp: Date.now()
    };
  }
}

export async function captureActiveChromeUrl(): Promise<CaptureUrlResult> {
  try {
    if (!isWindows) {
      return {
        success: false,
        url: null,
        message: 'URL capture is only supported on Windows',
        timestamp: Date.now()
      };
    }

    const sentinel = '__SMARTMOUSE_URL_PENDING__';
    const captured = await runPowerShellWithOutput(`
      Add-Type -AssemblyName System.Windows.Forms;
      $sentinel = ${psSingleQuoted(sentinel)};
      [System.Windows.Forms.Clipboard]::SetText($sentinel);
      Start-Sleep -Milliseconds 80;

      $wshell = New-Object -ComObject WScript.Shell;
      $null = $wshell.AppActivate('Chrome');
      Start-Sleep -Milliseconds 220;

      [System.Windows.Forms.SendKeys]::SendWait('^l');
      Start-Sleep -Milliseconds 140;
      [System.Windows.Forms.SendKeys]::SendWait('^c');
      Start-Sleep -Milliseconds 180;

      $url = [System.Windows.Forms.Clipboard]::GetText();
      if ($url -eq $sentinel) { $url = '' }
      Write-Output ($url.Trim())
    `);

    const normalized = captured.trim();
    if (/^https?:\/\//i.test(normalized)) {
      return {
        success: true,
        url: normalized,
        message: `Captured active Chrome URL: ${normalized}`,
        timestamp: Date.now()
      };
    }

    return {
      success: false,
      url: normalized || null,
      message: 'Could not capture an active Chrome URL',
      timestamp: Date.now()
    };
  } catch (e: any) {
    return {
      success: false,
      url: null,
      message: e.message,
      timestamp: Date.now()
    };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function executeAction(action: any): Promise<ActionResult> {
  const type = action.action?.toLowerCase();
  console.log(`🎮 Executing: ${type}`, action);

  const blockedPointerActions = new Set([
    'move',
    'click',
    'double_click',
    'right_click',
    'scroll',
    'drag',
    'hover'
  ]);

  if (blockedPointerActions.has(type)) {
    return {
      success: false,
      action: type,
      message: `Blocked pointer action in keyboard-only safety mode: ${type}`,
      timestamp: Date.now()
    };
  }

  switch (type) {
    case 'move': return moveMouse(action.x ?? 0, action.y ?? 0);
    case 'click':
      return click(
        action.x,
        action.y,
        (action.button || 'left').toLowerCase(),
        !!action.double
      );
    case 'double_click':
      return click(action.x, action.y, (action.button || 'left').toLowerCase(), true);
    case 'right_click':
      return click(action.x, action.y, 'right', !!action.double);
    case 'type': return typeText(action.text || '');
    case 'press': return pressKey(action.key || 'enter');
    case 'hotkey': return hotkey(Array.isArray(action.combo) ? action.combo : []);
    case 'scroll': return scroll(action.direction || 'down', action.amount || 3);
    case 'wait': await sleep((action.seconds || 2) * 1000); return { success: true, action: 'wait', message: `Waited ${action.seconds}s`, timestamp: Date.now() };
    case 'open_app': case 'open': return openApp(action.app_name || action.app || 'chrome');
    case 'open_url': return openUrl(action.url || 'https://www.google.com');
    case 'close_app': case 'close': return closeApp(action.app_name || action.app || 'chrome');
    case 'done': return { success: true, action: 'done', message: 'Goal completed!', timestamp: Date.now() };
    default: return { success: false, action: type, message: `Unknown action: ${type}`, timestamp: Date.now() };
  }
}

export default {
  getScreenSize,
  moveMouse,
  click,
  typeText,
  pressKey,
  hotkey,
  scroll,
  openApp,
  openUrl,
  closeApp,
  captureActiveChromeUrl,
  getCursorPosition,
  sleep,
  executeAction
};

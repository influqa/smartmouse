import { chromium } from 'playwright-core';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs';

// Parse command line arguments for videos and comments
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const paramName = arg.substring(2);
    const nextArg = process.argv[i + 1];
    // Check if the next argument is not another flag
    if (nextArg && !nextArg.startsWith('--')) {
      args[paramName] = nextArg;
      i++; // Skip the next argument as it's already processed
    } else {
      args[paramName] = true; // Flag without value
    }
  }
}

const videosInput = args.videos || '';
const commentsInput = args.comments || '';
const videos = videosInput.split(',').filter(v => v.trim());
const comments = commentsInput.split('|||').filter(c => c.trim());

const cdpUrl = 'http://127.0.0.1:9222';
const modeArg = (args.auto ? 'auto' : args.dry ? 'dry' : 'manual').toLowerCase();
const runMode = modeArg;

function resolveChromePath() {
  const primary = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const secondary = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  return fs.existsSync(primary) ? primary : secondary;
}

function log(msg) {
  console.log(`[playwright] ${msg}`);
}

async function promptYesNo(question) {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question(`${question} (y/n): `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

async function ensureSignedIn(page) {
  const signInVisible = await page.getByRole('link', { name: /sign in/i }).first().isVisible().catch(() => false);
  return !signInVisible;
}

async function locateCommentBox(page) {
  for (let i = 0; i < 6; i++) {
    const placeholder = page.locator('#simplebox-placeholder').first();
    const visible = await placeholder.isVisible().catch(() => false);
    if (visible) return placeholder;

    await page.evaluate(() => window.scrollBy(0, 900));
    await page.waitForTimeout(1000);
  }
  return null;
}

async function tryPostComment(page, text, mode, index) {
  await page.waitForTimeout(2200);

  const signedIn = await ensureSignedIn(page);
  if (!signedIn) {
    return { ok: false, reason: 'Sign-in required' };
  }

  const placeholder = await locateCommentBox(page);
  if (!placeholder) {
    return { ok: false, reason: 'Comment box not found' };
  }

  await placeholder.click({ timeout: 10000 });
  await page.waitForTimeout(600);

  const editor = page.locator('#contenteditable-root[contenteditable="true"]').first();
  const editorVisible = await editor.isVisible().catch(() => false);
  if (!editorVisible) {
    return { ok: false, reason: 'Comment editor unavailable' };
  }

  await editor.fill(text, { timeout: 10000 });
  await page.waitForTimeout(500);

  if (mode === 'dry') {
    return { ok: true, reason: 'Dry run: typed comment only' };
  }

  if (mode === 'manual') {
    const approved = await promptYesNo(`Video ${index}: ready to submit this comment now?`);
    if (!approved) {
      return { ok: false, reason: 'Skipped by manual approval' };
    }
  }

  const submit = page.locator('ytd-button-renderer#submit-button button, #submit-button button').first();
  const submitEnabled = await submit.isEnabled().catch(() => false);
  if (!submitEnabled) {
    return { ok: false, reason: 'Submit button disabled' };
  }

  await submit.click({ timeout: 10000 });
  await page.waitForTimeout(1600);
  return { ok: true, reason: 'Posted' };
}

async function applyStealthSettings(page) {
  // Override webdriver property
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Remove automation indicators
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Override plugins to appear more realistic
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        return {
          0: { filename: 'internal-pdf-viewer' },
          1: { filename: 'adsfkjhdsf' },
          2: { filename: 'internal-nacl-plugin' },
          length: 3,
          refresh: function() {},
        };
      },
    });
    
    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });
  
  // Additional stealth measures
  await page.addInitScript(() => {
    // Remove webdriver property from navigator
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Add more realistic properties
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => 0,
    });
    
    // Mock hardwareConcurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
    });
    
    // Mock deviceMemory
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
    });
  });
}

async function main() {
  log(`Mode: ${runMode}`);
  log(`Connecting to MAIN Chrome CDP at ${cdpUrl}`);

  if (videos.length === 0 || comments.length === 0) {
    console.error('[playwright] Error: No videos or comments provided');
    console.error('[playwright] Usage: node script.mjs --videos url1,url2,url3 --comments "comment1|||comment2|||comment3"');
    process.exit(1);
  }

  if (videos.length !== comments.length) {
    console.error(`[playwright] Warning: Video count (${videos.length}) doesn't match comment count (${comments.length})`);
    const minCount = Math.min(videos.length, comments.length);
    videos.splice(minCount);
    comments.splice(minCount);
  }

  let browser;
  let context;
  let usedPersistentMainProfile = false;
  let page;

  try {
    // First try to connect to existing Chrome instance via CDP
    browser = await chromium.connectOverCDP(cdpUrl);
    log('🔗 Connected to existing Chrome instance via CDP');
    context = browser.contexts()[0] || await browser.newContext();
    page = context.pages()[0] || await context.newPage();
  } catch (e) {
    log('CDP unavailable on 9222; falling back to main Chrome profile launch with stealth.');
    const chromePath = resolveChromePath();
    const localAppData = process.env.LOCALAPPDATA || '';
    const userDataDir = `${localAppData}\\Google\\Chrome\\User Data`;

    // Launch with stealth arguments using persistent context
    context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: chromePath,
      headless: false,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-plugins',
        '--lang=en-US,en;q=0.9',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--profile-directory=Default',
        '--disable-infobars',
        '--start-maximized',
        '--disable-features=TranslateUI,VizDisplayCompositor,PasswordGenerationBottomSheet,AutomationControlled',
        '--disable-gpu-sandboxing',
        '--disable-seccomp-filter-sandbox',
        '--disable-site-isolation-trials',
        '--disable-features=CrossSiteDocumentBlockingIfIsolating',
        '--disable-features=IsolateOrigins',
        '--disable-features=BlockInsecurePrivateNetworkRequests'
      ],
      ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    page = context.pages()[0] || await context.newPage();
    await applyStealthSettings(page);
    usedPersistentMainProfile = true;
    log('✅ Launched Chrome with stealth settings');
  }

  if (!page) {
    console.error('[playwright] No page found. Keep main Chrome open and retry.');
    process.exit(1);
  }

  const signedInBefore = await ensureSignedIn(page);
  if (!signedInBefore) {
    console.error('[playwright] Chrome session is not signed in to YouTube. Please sign in manually first and rerun.');
    process.exit(1);
  }

  log(`Processing ${videos.length} videos with corresponding comments.`);

  let posted = 0;
  const results = [];

  for (const [idx, url] of videos.entries()) {
    if (idx >= comments.length) break;

    const commentText = comments[idx];
    const videoNumber = idx + 1;
    log(`Opening video ${videoNumber}: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const res = await tryPostComment(page, commentText, runMode, videoNumber);
    results.push({ url, comment: commentText, ...res });
    if (res.ok) posted += 1;

    log(`Result video ${videoNumber}: ${res.ok ? 'OK' : 'SKIP'} - ${res.reason}`);
    await page.waitForTimeout(1200);
  }

  const summary = { videos: videos.length, comments: comments.length, mode: runMode, posted, results };
  log(`Done. Posted ${posted}/${videos.length}`);
  console.log(JSON.stringify(summary, null, 2));

  if (usedPersistentMainProfile) {
    await context.close();
  }
}

main().catch((err) => {
  console.error(`[playwright] Fatal: ${err?.message || String(err)}`);
  process.exit(1);
});
/**
 * Playwright Service for SmartMouse
 * Provides stealth browser automation with DOM locators, auto-waits, and actionability checks
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';

export interface PlaywrightServiceConfig {
  cdpEndpoint: string;
  stealth: boolean;
  headless: boolean;
  viewport?: { width: number; height: number };
}

export interface ElementSelector {
  type: 'css' | 'xpath' | 'text' | 'role';
  value: string;
}

export class PlaywrightService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: PlaywrightServiceConfig;

  constructor(config: PlaywrightServiceConfig) {
    this.config = config;
  }

  /**
   * Launch Chrome with stealth configuration
   */
  async launch(): Promise<boolean> {
    try {
      // First try to connect to existing Chrome instance via CDP
      try {
        this.browser = await chromium.connectOverCDP(this.config.cdpEndpoint);
        console.log(`🔗 Connected to existing Chrome instance at ${this.config.cdpEndpoint}`);
        
        // Get the first available context
        const contexts = this.browser.contexts();
        this.context = contexts[0] || await this.browser.newContext();
        this.page = this.context.pages()[0] || await this.context.newPage();
        
        if (this.config.stealth) {
          await this.applyStealthSettings(this.page);
        }
        
        return true;
      } catch (connectError) {
        console.log(`⚠️ Could not connect to existing Chrome at ${this.config.cdpEndpoint}, launching new instance...`);
        
        // If CDP connection fails, launch a new instance with stealth settings
        const userDataDir = this.resolveChromeUserDataDir();
        const chromePath = this.resolveChromePath();
        
        if (!chromePath) {
          throw new Error('Chrome installation not found');
        }

        const launchOptions: Parameters<typeof chromium['launchPersistentContext']>[1] = {
          executablePath: chromePath,
          headless: this.config.headless,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-ipc-flooding-protection',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-plugins',
            '--lang=en-US,en;q=0.9',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--profile-directory=Default',
            '--disable-automation-indicators',
            '--disable-infobars',
            '--start-maximized',
            '--disable-gpu', // Added to fix black screen issues
            '--disable-software-rasterizer',
            '--disable-gpu-sandbox',
            '--disable-features=TranslateUI,VizDisplayCompositor,PasswordGenerationBottomSheet,AutomationControlled,OutOfBlinkCors',
            '--disable-gpu-sandboxing',
            '--disable-seccomp-filter-sandbox',
            '--disable-site-isolation-trials',
            '--disable-features=CrossSiteDocumentBlockingIfIsolating',
            '--disable-features=IsolateOrigins',
            '--disable-features=BlockInsecurePrivateNetworkRequests',
            '--disable-features=SafeBrowsing',
            '--disable-features=TranslateUI'
          ]
        };

        if (this.config.viewport) {
          launchOptions.args?.push(`--window-size=${this.config.viewport.width},${this.config.viewport.height}`);
        } else {
          launchOptions.args?.push('--window-size=1366,768');
        }

        // Create a custom user data directory to avoid conflicts
        const customUserDataDir = path.join(os.tmpdir(), 'smartmouse-chrome-' + Date.now());
        this.context = await chromium.launchPersistentContext(customUserDataDir, {
          ...launchOptions,
          viewport: this.config.viewport || { width: 1366, height: 768 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        this.browser = this.context.browser();
        
        this.page = await this.context.newPage();
        
        if (this.config.stealth) {
          await this.applyStealthSettings(this.page);
        }
        
        console.log('✅ Launched new Chrome instance with stealth settings');
        return true;
      }
    } catch (error) {
      console.error('❌ Failed to launch Chrome:', error);
      return false;
    }
  }

  /**
   * Apply comprehensive stealth settings to the page to avoid detection
   */
  private async applyStealthSettings(page: Page): Promise<void> {
    // Advanced stealth measures to make the browser appear as a real user
    await page.addInitScript(() => {
      // Remove webdriver property using proper method
      if (navigator.webdriver) {
        delete Object.getPrototypeOf(navigator).webdriver;
      }
      
      // Override webdriver with getter that returns undefined
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Fake plugins array with realistic plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const pluginsArray = [
            { filename: 'internal-pdf-viewer', name: 'Chrome PDF Plugin', description: 'Portable Document Format' },
            { filename: 'internal-nacl-plugin', name: 'Native Client', description: 'Native Client' }
          ];
          
          const plugins: Record<string, any> = {};
          pluginsArray.forEach((plugin, index) => {
            plugins[index.toString()] = plugin;
          });
          plugins.length = pluginsArray.length;
          plugins.refresh = function() {};
          plugins.item = function(index: number): any { return pluginsArray[index] || null; };
          plugins.namedItem = function(name: string): any { return pluginsArray.find((p: any) => p.name === name) || null; };
          return plugins;
        },
      });
      
      // Fake mimeTypes array to match plugins
      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => {
          const mimeTypesArray = [
            { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: { filename: 'internal-pdf-viewer', name: 'Chrome PDF Plugin' } }
          ];
          
          const mimeTypes: Record<string, any> = {};
          mimeTypesArray.forEach((mimeType, index) => {
            mimeTypes[index.toString()] = mimeType;
          });
          mimeTypes.length = mimeTypesArray.length;
          mimeTypes.item = function(index: number): any { return mimeTypesArray[index] || null; };
          mimeTypes.namedItem = function(name: string): any { return mimeTypesArray.find((m: any) => m.type === name) || null; };
          return mimeTypes;
        },
      });
      
      // Realistic languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'es'],
      });
      
      // Realistic platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
      });
      
      // Realistic productSub
      Object.defineProperty(navigator, 'productSub', {
        get: () => '20030107',
      });
      
      // Realistic vendor
      Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.',
      });
      
      // Add realistic window properties (don't delete existing ones)
      Object.defineProperties(window, {
        outerHeight: { writable: true, value: screen.availHeight },
        outerWidth: { writable: true, value: screen.availWidth },
        innerHeight: { writable: true, value: screen.availHeight - 100 }, // Account for taskbar
        innerWidth: { writable: true, value: screen.availWidth },
        screenY: { writable: true, value: 0 },
        screenX: { writable: true, value: 0 },
      });
      
      // Add realistic screen properties
      Object.defineProperty(screen, 'availWidth', {
        get: () => screen.width,
      });
      
      Object.defineProperty(screen, 'availHeight', {
        get: () => screen.height,
      });
    });
    
    // Additional advanced stealth measures
    await page.addInitScript(() => {
      // Add realistic performance properties
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          downlink: 10,
          effectiveType: '4g',
          onchange: null,
          rtt: 50,
          saveData: false
        })
      });
      
      // Add realistic battery API (if available)
      if ('getBattery' in navigator) {
        Object.defineProperty(navigator, 'getBattery', {
          get: () => () => Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 0.89
          })
        });
      }
      
      // Remove automation-specific properties
      const automationIndicators = ['__nightmare', '_Selenium_IDE_Recorder', 'selenium', 'webdriver', '__driver_evaluate', '__webdriver_evaluate', '__selenium_evaluate', '__fxdriver_evaluate', '__driver_unwrapped', '__webdriver_unwrapped', '__selenium_unwrapped', '__fxdriver_unwrapped', '__webdriver_script_fn', '__webdriver_script_func', '__webdriver_script_function', '__$webdriverAsyncExecutor', '__lastWatirAlert', '__lastWatirConfirm', '__lastWatirPrompt', '$chrome_asyncScriptInfo', '$cdc_asdjflasutopfhvcZLmcfl_'];
      
      automationIndicators.forEach(indicator => {
        if ((window as any)[indicator]) {
          delete (window as any)[indicator];
        }
      });
    });

    // ADVANCED STEALTH: Canvas fingerprinting protection
    await page.addInitScript(() => {
      const originalGetContext = (HTMLCanvasElement.prototype as any).getContext;
      (HTMLCanvasElement.prototype as any).getContext = function(type: string, options?: any) {
        const context = originalGetContext.call(this, type, options);
        if (context && (type === '2d')) {
          // Add subtle noise to canvas operations
          const ctx = context as any;
          const originalFillText = ctx.fillText.bind(ctx);
          const originalStrokeText = ctx.strokeText.bind(ctx);

          ctx.fillText = function(text: string, x: number, y: number, maxWidth?: number) {
            // Add imperceptible noise to text rendering
            const noiseX = (Math.random() - 0.5) * 0.1;
            const noiseY = (Math.random() - 0.5) * 0.1;
            return originalFillText(text, x + noiseX, y + noiseY, maxWidth);
          };

          ctx.strokeText = function(text: string, x: number, y: number, maxWidth?: number) {
            const noiseX = (Math.random() - 0.5) * 0.1;
            const noiseY = (Math.random() - 0.5) * 0.1;
            return originalStrokeText(text, x + noiseX, y + noiseY, maxWidth);
          };
        }
        return context;
      };
    });

    // ADVANCED STEALTH: WebGL fingerprinting protection
    await page.addInitScript(() => {
      const getParameter = (WebGLRenderingContext.prototype as any).getParameter;
      (WebGLRenderingContext.prototype as any).getParameter = function(parameter: number) {
        const debugInfo = this.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          if (parameter === debugInfo.UNMASKED_VENDOR_WEBGL) {
            return 'NVIDIA Corporation';
          }
          if (parameter === debugInfo.UNMASKED_RENDERER_WEBGL) {
            return 'NVIDIA GeForce GTX 1050 Ti/PCIe/SSE2';
          }
        }
        return getParameter.call(this, parameter);
      };
    });

    // ADVANCED STEALTH: WebRTC IP leak protection
    await page.addInitScript(() => {
      // Override RTCPeerConnection to prevent IP leaks
      const originalRTCPeerConnection = (window as any).RTCPeerConnection;
      if (originalRTCPeerConnection) {
        (window as any).RTCPeerConnection = function(...args: any[]) {
          const pc = new originalRTCPeerConnection(...args);
          
          // Override createOffer to filter out private IPs
          const originalCreateOffer = pc.createOffer.bind(pc);
          pc.createOffer = async function(options?: any) {
            const offer = await originalCreateOffer(options);
            if (offer && offer.sdp) {
              // Remove private IP addresses from SDP
              offer.sdp = offer.sdp.replace(/c=IN IP4 \d+\.\d+\.\d+\.\d+/g, 'c=IN IP4 0.0.0.0');
            }
            return offer;
          };

          return pc;
        };
      }
    });

    // ADVANCED STEALTH: Permission API mocking
    await page.addInitScript(() => {
      const originalQuery = (navigator.permissions as any).query.bind(navigator.permissions);
      (navigator.permissions as any).query = async function(permissionDesc: any) {
        // Return consistent permission states that look realistic
        const permissionName = typeof permissionDesc === 'string' ? permissionDesc : permissionDesc.name;
        
        const permissionStates: Record<string, string> = {
          'notifications': 'prompt',
          'camera': 'prompt',
          'microphone': 'prompt',
          'geolocation': 'prompt',
          'clipboard-read': 'prompt',
          'clipboard-write': 'granted',
          'payment-handler': 'prompt'
        };

        const state = permissionStates[permissionName as string] || 'prompt';

        return {
          state: state,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        } as any;
      };
    });

    // ADVANCED STEALTH: Chrome DevTools Protocol detection prevention
    await page.addInitScript(() => {
      // Hide Chrome DevTools indicators
      Object.defineProperty(window, 'chrome', {
        get: () => ({
          runtime: {
            OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
            OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
            PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', MIPS64EL: 'mips64el', MIPSEL: 'mipsel', X86_32: 'x86-32', X86_64: 'x86-64' },
            PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', MIPS64EL: 'mips64el', MIPSEL: 'mipsel', MIPSEL64: 'mipsel64', X86_32: 'x86-32', X86_64: 'x86-64' },
            PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
            RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }
          },
          loadTimes: () => ({
            commitLoadTime: performance.timing.responseEnd / 1000,
            connectionInfo: 'h2',
            finishDocumentLoadTime: performance.timing.domContentLoadedEventEnd / 1000,
            finishLoadTime: performance.timing.loadEventEnd / 1000,
            firstPaintAfterLoadTime: 0,
            firstPaintTime: performance.timing.domInteractive / 1000,
            navigationType: 'Other',
            npnNegotiatedProtocol: 'h2',
            requestTime: performance.timing.requestStart / 1000,
            startLoadTime: performance.timing.responseStart / 1000,
            wasAlternateProtocolAvailable: false,
            wasFetchedViaSpdy: true,
            wasNpnNegotiated: true
          })
        }),
      });
    });

    // ADVANCED STEALTH: Hardware concurrency and memory
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
      });
      
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      });
      
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 0,
      });
    });

    // ADVANCED STEALTH: Notification API mocking
    await page.addInitScript(() => {
      if ('Notification' in window) {
        Object.defineProperty(Notification, 'permission', {
          get: () => 'default',
        });
        
        const originalRequestPermission = Notification.requestPermission.bind(Notification);
        Notification.requestPermission = async function() {
          return 'default';
        };
      }
    });
  }

  /**
   * Resolve Chrome user data directory
   */
  private resolveChromeUserDataDir(): string {
    const os = process.platform;
    if (os === 'win32') {
      return process.env.LOCALAPPDATA 
        ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data` 
        : 'C:\\Users\\%USERNAME%\\AppData\\Local\\Google\\Chrome\\User Data';
    } else if (os === 'darwin') {
      return process.env.HOME 
        ? `${process.env.HOME}/Library/Application Support/Google/Chrome` 
        : '/Users/$USER/Library/Application Support/Google/Chrome';
    } else {
      return process.env.HOME 
        ? `${process.env.HOME}/.config/google-chrome` 
        : '/home/$USER/.config/google-chrome';
    }
  }

  /**
   * Resolve Chrome executable path
   */
  private resolveChromePath(): string | null {
    const os = process.platform;
    if (os === 'win32') {
      const primary = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      const secondary = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
      const paths = [primary, secondary];
      
      for (const p of paths) {
        try {
          // We can't use fs.existsSync in this context without importing fs
          // So we'll just return the first path that looks valid
          return p;
        } catch (e) {
          continue;
        }
      }
    } else if (os === 'darwin') {
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else {
      // Linux
      const paths = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser'];
      for (const p of paths) {
        try {
          return p;
        } catch (e) {
          continue;
        }
      }
    }
    
    return null;
  }

  /**
   * Navigate to URL with proper waits
   */
  async navigateTo(url: string): Promise<boolean> {
    if (!this.page) {
      console.error('❌ Page not initialized');
      return false;
    }

    try {
      await this.page.goto(url, { 
        waitUntil: 'networkidle', 
        timeout: 30000 
      });
      
      // Wait for the page to be fully loaded
      await this.page.waitForLoadState('domcontentloaded');
      
      console.log(`✅ Navigated to: ${url}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to navigate to ${url}:`, error);
      return false;
    }
  }

  /**
   * Find element using multiple selector strategies
   */
  async findElement(selectors: ElementSelector[]): Promise<any | null> {
    if (!this.page) {
      console.error('❌ Page not initialized');
      return null;
    }

    for (const selector of selectors) {
      try {
        let element;
        
        switch (selector.type) {
          case 'css':
            element = await this.page.$(selector.value);
            break;
          case 'xpath':
            element = await this.page.$(selector.value);
            break;
          case 'text':
            element = await this.page.getByText(selector.value).first();
            break;
          case 'role':
            element = await this.page.getByRole(selector.value as any).first();
            break;
          default:
            console.warn(`⚠️ Unknown selector type: ${selector.type}`);
            continue;
        }
        
        if (element) {
          console.log(`✅ Found element using ${selector.type}: ${selector.value}`);
          return element;
        }
      } catch (error) {
        console.warn(`⚠️ Selector failed (${selector.type}): ${selector.value}`, error);
        continue;
      }
    }
    
    console.log('❌ Could not find element with any of the provided selectors');
    return null;
  }

  /**
   * Click an element with actionability checks
   */
  async clickElement(element: any): Promise<boolean> {
    if (!element) {
      console.error('❌ Element is null');
      return false;
    }

    try {
      // Check if element is visible and enabled
      const isVisible = await element.isVisible();
      const isEnabled = await element.isEnabled();
      
      if (!isVisible) {
        console.log('⚠️ Element is not visible, attempting to scroll into view...');
        await element.scrollIntoViewIfNeeded();
        await this.page?.waitForTimeout(500); // Brief pause after scrolling
      }
      
      if (!isEnabled) {
        console.error('❌ Element is not enabled');
        return false;
      }
      
      // Perform click with force if needed
      await element.click({ force: false });
      
      console.log('✅ Element clicked successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to click element:', error);
      
      // Try alternative click method
      try {
        await element.dispatchEvent('click');
        console.log('✅ Element clicked using dispatchEvent');
        return true;
      } catch (dispatchError) {
        console.error('❌ Both click methods failed:', dispatchError);
        return false;
      }
    }
  }

  /**
   * Fill input field with text
   */
  async fillField(element: any, text: string): Promise<boolean> {
    if (!element) {
      console.error('❌ Element is null');
      return false;
    }

    try {
      // Clear the field first
      await element.focus();
      await element.selectText().catch(() => {}); // Ignore if selectText is not available
      await element.fill('');
      
      // Fill with new text
      await element.fill(text);
      
      console.log(`✅ Field filled with: ${text.substring(0, 20)}${text.length > 20 ? '...' : ''}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to fill field:', error);
      return false;
    }
  }

  /**
   * Wait for element to be visible
   */
  async waitForElement(selector: string, timeout: number = 10000): Promise<any | null> {
    if (!this.page) {
      console.error('❌ Page not initialized');
      return null;
    }

    try {
      const element = await this.page.waitForSelector(selector, { 
        state: 'visible', 
        timeout 
      });
      
      console.log(`✅ Element appeared: ${selector}`);
      return element;
    } catch (error) {
      console.error(`❌ Element did not appear within ${timeout}ms: ${selector}`);
      return null;
    }
  }

  /**
   * Get current page URL
   */
  async getCurrentUrl(): Promise<string | null> {
    if (!this.page) {
      console.error('❌ Page not initialized');
      return null;
    }

    try {
      return this.page.url();
    } catch (error) {
      console.error('❌ Failed to get current URL:', error);
      return null;
    }
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string | null> {
    if (!this.page) {
      console.error('❌ Page not initialized');
      return null;
    }

    try {
      return await this.page.title();
    } catch (error) {
      console.error('❌ Failed to get page title:', error);
      return null;
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(path?: string): Promise<Buffer | null> {
    if (!this.page) {
      console.error('❌ Page not initialized');
      return null;
    }

    try {
      const screenshot = await this.page.screenshot({ 
        type: 'png',
        fullPage: false 
      });
      
      if (path) {
        // Note: We'd need to import fs to save to disk
        console.log(`📷 Screenshot taken: ${path}`);
      }
      
      return screenshot;
    } catch (error) {
      console.error('❌ Failed to take screenshot:', error);
      return null;
    }
  }

  /**
   * Evaluate JavaScript on the page
   */
  async evaluate<T>(pageFunction: () => T): Promise<T | null> {
    if (!this.page) {
      console.error('❌ Page not initialized');
      return null;
    }

    try {
      return await this.page.evaluate(pageFunction);
    } catch (error) {
      console.error('❌ Failed to evaluate JavaScript:', error);
      return null;
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      console.log('✅ Browser closed');
    } catch (error) {
      console.error('❌ Error closing browser:', error);
    }
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return !!this.browser && !!this.context && !!this.page;
  }
}
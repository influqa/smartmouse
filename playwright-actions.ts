/**
 * Playwright Actions Handler for SmartMouse
 * Integrates Playwright automation capabilities with SmartMouse action system
 * Now includes human-like behavior simulation for stealth automation
 */

import { PlaywrightService, PlaywrightServiceConfig, ElementSelector } from './playwright-service';
import { ActionResult } from './actions';
import {
  humanLikeMouseMove,
  humanLikeClick,
  humanLikeType,
  humanLikeScroll,
  simulateReading,
  thinkingPause,
  humanLikeInteraction,
  randomBetween,
  sleep
} from './human-behavior';

export interface PlaywrightActionResult extends ActionResult {
  playwright_specific?: any;
}

export interface HumanBehaviorOptions {
  enabled: boolean;
  speed?: 'slow' | 'normal' | 'fast';
  mistakeRate?: number;
  wpm?: number;
}

export class PlaywrightActions {
  private playwrightService: PlaywrightService | null = null;
  private humanBehavior: HumanBehaviorOptions = { enabled: true, speed: 'normal', mistakeRate: 0.02, wpm: 60 };

  constructor(humanBehaviorOptions?: Partial<HumanBehaviorOptions>) {
    this.humanBehavior = { ...this.humanBehavior, ...humanBehaviorOptions };
  }

  /**
   * Configure human-like behavior options
   */
  configureHumanBehavior(options: Partial<HumanBehaviorOptions>): void {
    this.humanBehavior = { ...this.humanBehavior, ...options };
  }

  /**
   * Get current human behavior configuration
   */
  getHumanBehaviorConfig(): HumanBehaviorOptions {
    return { ...this.humanBehavior };
  }

  /**
   * Initialize the Playwright service with stealth configuration
   */
  async initialize(config?: Partial<PlaywrightServiceConfig>): Promise<ActionResult> {
    try {
      const defaultConfig: PlaywrightServiceConfig = {
        cdpEndpoint: 'http://127.0.0.1:9222', // Default Chrome CDP endpoint
        stealth: true,
        headless: false,
        viewport: { width: 1366, height: 768 }
      };

      const finalConfig: PlaywrightServiceConfig = {
        ...defaultConfig,
        ...config
      };

      this.playwrightService = new PlaywrightService(finalConfig);
      const success = await this.playwrightService.launch();

      if (success) {
        return {
          success: true,
          action: 'initialize_playwright',
          message: 'Playwright service initialized successfully with stealth configuration',
          timestamp: Date.now()
        };
      } else {
        return {
          success: false,
          action: 'initialize_playwright',
          message: 'Failed to initialize Playwright service',
          timestamp: Date.now()
        };
      }
    } catch (error: any) {
      return {
        success: false,
        action: 'initialize_playwright',
        message: `Error initializing Playwright service: ${error.message}`,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Check if Playwright service is ready
   */
  isReady(): boolean {
    return this.playwrightService !== null && this.playwrightService.isReady();
  }

  /**
   * Navigate to a URL using Playwright
   */
  async navigateToUrl(url: string): Promise<PlaywrightActionResult> {
    if (!this.playwrightService) {
      return {
        success: false,
        action: 'navigate',
        message: 'Playwright service not initialized',
        timestamp: Date.now()
      };
    }

    const success = await this.playwrightService.navigateTo(url);
    
    return {
      success: success,
      action: 'navigate',
      message: success ? `Navigated to URL: ${url}` : `Failed to navigate to URL: ${url}`,
      timestamp: Date.now()
    };
  }

  /**
   * Find an element using various selector strategies
   */
  async findElement(selectors: ElementSelector[]): Promise<PlaywrightActionResult> {
    if (!this.playwrightService) {
      return {
        success: false,
        action: 'find_element',
        message: 'Playwright service not initialized',
        timestamp: Date.now()
      };
    }

    const element = await this.playwrightService.findElement(selectors);
    
    return {
      success: !!element,
      action: 'find_element',
      message: element ? 'Element found successfully' : 'Element not found with provided selectors',
      playwright_specific: { element_found: !!element },
      timestamp: Date.now()
    };
  }

  /**
   * Click an element
   */
  async clickElement(selectors: ElementSelector[]): Promise<PlaywrightActionResult> {
    if (!this.playwrightService) {
      return {
        success: false,
        action: 'click',
        message: 'Playwright service not initialized',
        timestamp: Date.now()
      };
    }

    try {
      const element = await this.playwrightService.findElement(selectors);
      
      if (!element) {
        return {
          success: false,
          action: 'click',
          message: 'Element not found for clicking',
          timestamp: Date.now()
        };
      }

      const success = await this.playwrightService.clickElement(element);
      
      return {
        success: success,
        action: 'click',
        message: success ? 'Element clicked successfully' : 'Failed to click element',
        timestamp: Date.now()
      };
    } catch (error: any) {
      return {
        success: false,
        action: 'click',
        message: `Error clicking element: ${error.message}`,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Fill a text field
   */
  async fillTextField(selectors: ElementSelector[], text: string): Promise<PlaywrightActionResult> {
    if (!this.playwrightService) {
      return {
        success: false,
        action: 'fill',
        message: 'Playwright service not initialized',
        timestamp: Date.now()
      };
    }

    try {
      const element = await this.playwrightService.findElement(selectors);
      
      if (!element) {
        return {
          success: false,
          action: 'fill',
          message: 'Element not found for filling',
          timestamp: Date.now()
        };
      }

      const success = await this.playwrightService.fillField(element, text);
      
      return {
        success: success,
        action: 'fill',
        message: success ? `Filled field with text: ${text.substring(0, 20)}${text.length > 20 ? '...' : ''}` : 'Failed to fill field',
        timestamp: Date.now()
      };
    } catch (error: any) {
      return {
        success: false,
        action: 'fill',
        message: `Error filling field: ${error.message}`,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Wait for an element to appear
   */
  async waitForElement(selector: string, timeout: number = 10000): Promise<PlaywrightActionResult> {
    if (!this.playwrightService) {
      return {
        success: false,
        action: 'wait_for_element',
        message: 'Playwright service not initialized',
        timestamp: Date.now()
      };
    }

    const element = await this.playwrightService.waitForElement(selector, timeout);
    
    return {
      success: !!element,
      action: 'wait_for_element',
      message: element ? `Element appeared within ${timeout}ms: ${selector}` : `Element did not appear within ${timeout}ms: ${selector}`,
      timestamp: Date.now()
    };
  }

  /**
   * Get current page URL
   */
  async getCurrentUrl(): Promise<PlaywrightActionResult> {
    if (!this.playwrightService) {
      return {
        success: false,
        action: 'get_url',
        message: 'Playwright service not initialized',
        timestamp: Date.now()
      };
    }

    const url = await this.playwrightService.getCurrentUrl();
    
    return {
      success: !!url,
      action: 'get_url',
      message: url ? `Current URL: ${url}` : 'Failed to get current URL',
      playwright_specific: { url: url || null },
      timestamp: Date.now()
    };
  }

  /**
   * Get page title
   */
  async getPageTitle(): Promise<PlaywrightActionResult> {
    if (!this.playwrightService) {
      return {
        success: false,
        action: 'get_title',
        message: 'Playwright service not initialized',
        timestamp: Date.now()
      };
    }

    const title = await this.playwrightService.getTitle();
    
    return {
      success: !!title,
      action: 'get_title',
      message: title ? `Page title: ${title}` : 'Failed to get page title',
      playwright_specific: { title: title || null },
      timestamp: Date.now()
    };
  }

  /**
   * Take a screenshot
   */
  async takeScreenshot(path?: string): Promise<PlaywrightActionResult> {
    if (!this.playwrightService) {
      return {
        success: false,
        action: 'screenshot',
        message: 'Playwright service not initialized',
        timestamp: Date.now()
      };
    }

    const screenshot = await this.playwrightService.screenshot(path);
    
    return {
      success: !!screenshot,
      action: 'screenshot',
      message: screenshot ? 'Screenshot taken successfully' : 'Failed to take screenshot',
      playwright_specific: { screenshot_taken: !!screenshot },
      timestamp: Date.now()
    };
  }

  /**
   * Execute JavaScript on the page
   */
  async executeJavaScript<T>(script: string): Promise<PlaywrightActionResult> {
    if (!this.playwrightService) {
      return {
        success: false,
        action: 'execute_js',
        message: 'Playwright service not initialized',
        timestamp: Date.now()
      };
    }

    try {
      // Create a function from the script string
      const result = await this.playwrightService.evaluate<T>(() => {
        // This is a simplified approach - in practice you'd want to be more careful about executing arbitrary JS
        return eval(script) as T;
      });
      
      return {
        success: true,
        action: 'execute_js',
        message: 'JavaScript executed successfully',
        playwright_specific: { result },
        timestamp: Date.now()
      };
    } catch (error: any) {
      return {
        success: false,
        action: 'execute_js',
        message: `Error executing JavaScript: ${error.message}`,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Close the Playwright service
   */
  async close(): Promise<ActionResult> {
    if (!this.playwrightService) {
      return {
        success: true,
        action: 'close_playwright',
        message: 'Playwright service was not initialized',
        timestamp: Date.now()
      };
    }

    try {
      await this.playwrightService.close();
      this.playwrightService = null;
      
      return {
        success: true,
        action: 'close_playwright',
        message: 'Playwright service closed successfully',
        timestamp: Date.now()
      };
    } catch (error: any) {
      return {
        success: false,
        action: 'close_playwright',
        message: `Error closing Playwright service: ${error.message}`,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Execute a Playwright-specific action
   */
  async executePlaywrightAction(action: any): Promise<PlaywrightActionResult> {
    const type = action.action?.toLowerCase();
    console.log(`🎮 Executing Playwright action: ${type}`, action);

    switch (type) {
      case 'init_playwright':
        return this.initialize(action.config);
      case 'navigate':
        return this.navigateToUrl(action.url || '');
      case 'click_element':
        return this.clickElement(action.selectors || []);
      case 'fill_field':
        return this.fillTextField(action.selectors || [], action.text || '');
      case 'find_element':
        return this.findElement(action.selectors || []);
      case 'wait_for_element':
        return this.waitForElement(action.selector || '', action.timeout || 10000);
      case 'get_current_url':
        return this.getCurrentUrl();
      case 'get_page_title':
        return this.getPageTitle();
      case 'take_screenshot':
        return this.takeScreenshot(action.path);
      case 'execute_js':
        return this.executeJavaScript(action.script || '');
      case 'close_playwright':
        return this.close();
      default:
        return {
          success: false,
          action: type,
          message: `Unknown Playwright action: ${type}`,
          timestamp: Date.now()
        };
    }
  }
}

// Export a singleton instance for use in the main application
export const playwrightActions = new PlaywrightActions();
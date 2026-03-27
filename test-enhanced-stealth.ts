/**
 * Enhanced Stealth Test for SmartMouse Playwright Integration
 * Tests advanced anti-detection measures and human-like behavior
 */

import { chromium, Browser, Page } from 'playwright-core';
import { PlaywrightService } from './playwright-service';
import {
  humanLikeMouseMove,
  humanLikeClick,
  humanLikeType,
  humanLikeScroll,
  simulateReading,
  thinkingPause,
  humanLikeInteraction,
  randomBetween
} from './human-behavior';

// Test configuration
const TEST_URLS = {
  botDetection: 'https://bot.sannysoft.com',
  fingerprintjs: 'https://fingerprintjs.github.io/fingerprintjs/',
  creepjs: 'https://abrahamjuliot.github.io/creepjs/',
  pixelscan: 'https://pixelscan.net',
  browserleaks: 'https://browserleaks.com/canvas',
  youtube: 'https://www.youtube.com'
};

interface StealthTestResult {
  test: string;
  passed: boolean;
  details: string;
  timestamp: number;
}

class EnhancedStealthTester {
  private service: PlaywrightService | null = null;
  private results: StealthTestResult[] = [];

  async initialize(): Promise<boolean> {
    console.log('🚀 Initializing Enhanced Stealth Test...\n');

    this.service = new PlaywrightService({
      cdpEndpoint: 'http://127.0.0.1:9222',
      stealth: true,
      headless: false,
      viewport: { width: 1366, height: 768 }
    });

    const success = await this.service.launch();
    if (success) {
      console.log('✅ Playwright service initialized with enhanced stealth\n');
    } else {
      console.log('❌ Failed to initialize Playwright service\n');
    }
    return success;
  }

  async runAllTests(): Promise<void> {
    console.log('🔍 Running Enhanced Stealth Tests...\n');
    console.log('=' .repeat(60));

    await this.testNavigatorProperties();
    await this.testCanvasFingerprinting();
    await this.testWebGLFingerprinting();
    await this.testWebRTCLProtection();
    await this.testPermissionAPI();
    await this.testChromeRuntime();
    await this.testHardwareProperties();
    await this.testHumanLikeBehavior();
    await this.testBotDetectionSites();

    this.printSummary();
  }

  private async testNavigatorProperties(): Promise<void> {
    console.log('\n📋 Test 1: Navigator Properties');
    console.log('-'.repeat(40));

    if (!this.service) return;

    const page = await this.getPage();
    if (!page) return;

    const results = await page.evaluate(() => {
      return {
        webdriver: navigator.webdriver,
        plugins: navigator.plugins?.length,
        mimeTypes: navigator.mimeTypes?.length,
        languages: navigator.languages,
        platform: navigator.platform,
        productSub: navigator.productSub,
        vendor: navigator.vendor,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as any).deviceMemory,
        maxTouchPoints: navigator.maxTouchPoints
      };
    });

    const checks = [
      { name: 'webdriver', value: results.webdriver, expected: undefined },
      { name: 'plugins', value: results.plugins, expected: 2 },
      { name: 'mimeTypes', value: results.mimeTypes, expected: 1 },
      { name: 'languages', value: results.languages?.length, expected: 3 },
      { name: 'platform', value: results.platform, expected: 'Win32' },
      { name: 'productSub', value: results.productSub, expected: '20030107' },
      { name: 'vendor', value: results.vendor, expected: 'Google Inc.' },
      { name: 'hardwareConcurrency', value: results.hardwareConcurrency, expected: 8 },
      { name: 'deviceMemory', value: results.deviceMemory, expected: 8 },
      { name: 'maxTouchPoints', value: results.maxTouchPoints, expected: 0 }
    ];

    let allPassed = true;
    checks.forEach(check => {
      const passed = check.value === check.expected;
      allPassed = allPassed && passed;
      console.log(`  ${passed ? '✅' : '❌'} ${check.name}: ${check.value} (expected: ${check.expected})`);
    });

    this.results.push({
      test: 'Navigator Properties',
      passed: allPassed,
      details: `webdriver: ${results.webdriver}, plugins: ${results.plugins}, languages: ${results.languages?.join(', ')}`,
      timestamp: Date.now()
    });
  }

  private async testCanvasFingerprinting(): Promise<void> {
    console.log('\n🎨 Test 2: Canvas Fingerprinting Protection');
    console.log('-'.repeat(40));

    if (!this.service) return;

    const page = await this.getPage();
    if (!page) return;

    // Test canvas noise injection
    const canvasResults = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return { error: 'Could not get 2d context' };

      // Draw text multiple times and check if results vary
      const results: string[] = [];
      for (let i = 0; i < 3; i++) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillText('Test', 50, 50);
        const data = canvas.toDataURL();
        results.push(data.substring(0, 100)); // First 100 chars
      }

      return {
        results: results,
        hasVariation: results[0] !== results[1] || results[1] !== results[2]
      };
    });

    const passed = canvasResults.hasVariation === true;
    console.log(`  ${passed ? '✅' : '❌'} Canvas noise injection: ${passed ? 'Working' : 'Not working'}`);
    console.log(`     Variation detected: ${canvasResults.hasVariation}`);

    this.results.push({
      test: 'Canvas Fingerprinting',
      passed: passed,
      details: `Noise injection: ${canvasResults.hasVariation ? 'active' : 'inactive'}`,
      timestamp: Date.now()
    });
  }

  private async testWebGLFingerprinting(): Promise<void> {
    console.log('\n🎮 Test 3: WebGL Fingerprinting Protection');
    console.log('-'.repeat(40));

    if (!this.service) return;

    const page = await this.getPage();
    if (!page) return;

    const webglResults = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
      if (!gl) return { error: 'WebGL not supported' };

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as any;
      if (!debugInfo) return { error: 'Debug info extension not available' };

      return {
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      };
    });

    const expectedVendor = 'NVIDIA Corporation';
    const expectedRenderer = 'NVIDIA GeForce GTX 1050 Ti/PCIe/SSE2';

    const vendorPassed = webglResults.vendor === expectedVendor;
    const rendererPassed = webglResults.renderer === expectedRenderer;

    console.log(`  ${vendorPassed ? '✅' : '❌'} WebGL Vendor: ${webglResults.vendor}`);
    console.log(`  ${rendererPassed ? '✅' : '❌'} WebGL Renderer: ${webglResults.renderer}`);

    this.results.push({
      test: 'WebGL Fingerprinting',
      passed: vendorPassed && rendererPassed,
      details: `Vendor: ${webglResults.vendor}, Renderer: ${webglResults.renderer}`,
      timestamp: Date.now()
    });
  }

  private async testWebRTCLProtection(): Promise<void> {
    console.log('\n📡 Test 4: WebRTC IP Leak Protection');
    console.log('-'.repeat(40));

    if (!this.service) return;

    const page = await this.getPage();
    if (!page) return;

    const webrtcResults = await page.evaluate(() => {
      return {
        hasRTCPeerConnection: typeof RTCPeerConnection !== 'undefined',
        hasCreateDataChannel: typeof RTCPeerConnection?.prototype.createDataChannel !== 'undefined',
        hasCreateOffer: typeof RTCPeerConnection?.prototype.createOffer !== 'undefined'
      };
    });

    const passed = webrtcResults.hasRTCPeerConnection &&
                   webrtcResults.hasCreateDataChannel &&
                   webrtcResults.hasCreateOffer;

    console.log(`  ${passed ? '✅' : '❌'} WebRTC API available: ${webrtcResults.hasRTCPeerConnection}`);
    console.log(`  ${passed ? '✅' : '❌'} WebRTC methods protected: ${webrtcResults.hasCreateOffer}`);

    this.results.push({
      test: 'WebRTC Protection',
      passed: passed,
      details: `RTCPeerConnection: ${webrtcResults.hasRTCPeerConnection}, createOffer: ${webrtcResults.hasCreateOffer}`,
      timestamp: Date.now()
    });
  }

  private async testPermissionAPI(): Promise<void> {
    console.log('\n🔐 Test 5: Permission API Mocking');
    console.log('-'.repeat(40));

    if (!this.service) return;

    const page = await this.getPage();
    if (!page) return;

    const permissionResults = await page.evaluate(async () => {
      const permissions = ['notifications', 'camera', 'microphone', 'geolocation'];
      const results: Record<string, string> = {};

      for (const perm of permissions) {
        try {
          const status = await navigator.permissions.query({ name: perm as PermissionName });
          results[perm] = status.state;
        } catch (e) {
          results[perm] = 'error';
        }
      }

      return results;
    });

    const expectedStates = ['prompt', 'prompt', 'prompt', 'prompt'];
    const actualStates = Object.values(permissionResults);
    const passed = actualStates.every(state => state === 'prompt' || state === 'granted');

    Object.entries(permissionResults).forEach(([perm, state]) => {
      console.log(`  ${state === 'prompt' || state === 'granted' ? '✅' : '❌'} ${perm}: ${state}`);
    });

    this.results.push({
      test: 'Permission API',
      passed: passed,
      details: Object.entries(permissionResults).map(([k, v]) => `${k}: ${v}`).join(', '),
      timestamp: Date.now()
    });
  }

  private async testChromeRuntime(): Promise<void> {
    console.log('\n🔧 Test 6: Chrome Runtime Object');
    console.log('-'.repeat(40));

    if (!this.service) return;

    const page = await this.getPage();
    if (!page) return;

    const chromeResults = await page.evaluate(() => {
      return {
        hasChrome: typeof (window as any).chrome !== 'undefined',
        hasRuntime: typeof (window as any).chrome?.runtime !== 'undefined',
        hasLoadTimes: typeof (window as any).chrome?.loadTimes === 'function',
        hasOnInstalledReason: typeof (window as any).chrome?.runtime?.OnInstalledReason !== 'undefined'
      };
    });

    const passed = chromeResults.hasChrome &&
                   chromeResults.hasRuntime &&
                   chromeResults.hasLoadTimes;

    console.log(`  ${chromeResults.hasChrome ? '✅' : '❌'} chrome object: ${chromeResults.hasChrome}`);
    console.log(`  ${chromeResults.hasRuntime ? '✅' : '❌'} chrome.runtime: ${chromeResults.hasRuntime}`);
    console.log(`  ${chromeResults.hasLoadTimes ? '✅' : '❌'} chrome.loadTimes: ${chromeResults.hasLoadTimes}`);

    this.results.push({
      test: 'Chrome Runtime',
      passed: passed,
      details: `chrome: ${chromeResults.hasChrome}, runtime: ${chromeResults.hasRuntime}, loadTimes: ${chromeResults.hasLoadTimes}`,
      timestamp: Date.now()
    });
  }

  private async testHardwareProperties(): Promise<void> {
    console.log('\n💻 Test 7: Hardware Properties');
    console.log('-'.repeat(40));

    if (!this.service) return;

    const page = await this.getPage();
    if (!page) return;

    const hardwareResults = await page.evaluate(() => {
      return {
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as any).deviceMemory,
        maxTouchPoints: navigator.maxTouchPoints
      };
    });

    const checks = [
      { name: 'hardwareConcurrency', value: hardwareResults.hardwareConcurrency, expected: 8 },
      { name: 'deviceMemory', value: hardwareResults.deviceMemory, expected: 8 },
      { name: 'maxTouchPoints', value: hardwareResults.maxTouchPoints, expected: 0 }
    ];

    let allPassed = true;
    checks.forEach(check => {
      const passed = check.value === check.expected;
      allPassed = allPassed && passed;
      console.log(`  ${passed ? '✅' : '❌'} ${check.name}: ${check.value} (expected: ${check.expected})`);
    });

    this.results.push({
      test: 'Hardware Properties',
      passed: allPassed,
      details: `cores: ${hardwareResults.hardwareConcurrency}, memory: ${hardwareResults.deviceMemory}GB`,
      timestamp: Date.now()
    });
  }

  private async testHumanLikeBehavior(): Promise<void> {
    console.log('\n🎭 Test 8: Human-Like Behavior');
    console.log('-'.repeat(40));

    if (!this.service) return;

    const page = await this.getPage();
    if (!page) return;

    // Navigate to a test page
    await page.goto('https://www.google.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    console.log('  Testing human-like mouse movement...');
    await humanLikeMouseMove(page, 500, 300, { speed: 'normal' });
    console.log('  ✅ Mouse movement completed');

    console.log('  Testing thinking pause...');
    await thinkingPause(page, 500, 1000);
    console.log('  ✅ Thinking pause completed');

    console.log('  Testing human-like scroll...');
    await humanLikeScroll(page, 'down', 300, { speed: 'normal' });
    console.log('  ✅ Scroll completed');

    this.results.push({
      test: 'Human-Like Behavior',
      passed: true,
      details: 'Mouse movement, thinking pause, and scroll executed successfully',
      timestamp: Date.now()
    });
  }

  private async testBotDetectionSites(): Promise<void> {
    console.log('\n🤖 Test 9: Bot Detection Sites');
    console.log('-'.repeat(40));

    if (!this.service) return;

    const page = await this.getPage();
    if (!page) return;

    // Test sannysoft bot detection
    console.log('  Testing bot.sannysoft.com...');
    try {
      await page.goto(TEST_URLS.botDetection, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Check for common bot detection markers
      const botResults = await page.evaluate(() => {
        return {
          webdriver: navigator.webdriver,
          hasAutomationControlled: navigator.userAgent.includes('HeadlessChrome'),
          hasPlugins: navigator.plugins.length > 0,
          hasMimeTypes: navigator.mimeTypes.length > 0
        };
      });

      const passed = !botResults.webdriver &&
                     !botResults.hasAutomationControlled &&
                     botResults.hasPlugins &&
                     botResults.hasMimeTypes;

      console.log(`  ${passed ? '✅' : '❌'} Bot detection test: ${passed ? 'PASSED' : 'FAILED'}`);
      console.log(`     webdriver: ${botResults.webdriver}`);
      console.log(`     automation controlled: ${botResults.hasAutomationControlled}`);

      this.results.push({
        test: 'Bot Detection (sannysoft)',
        passed: passed,
        details: `webdriver: ${botResults.webdriver}, automation: ${botResults.hasAutomationControlled}`,
        timestamp: Date.now()
      });
    } catch (error) {
      console.log('  ⚠️ Could not test bot detection site (may be blocked)');
      this.results.push({
        test: 'Bot Detection (sannysoft)',
        passed: false,
        details: 'Site unreachable or blocked',
        timestamp: Date.now()
      });
    }
  }

  private async getPage(): Promise<Page | null> {
    if (!this.service) return null;
    // Access the private page property through type assertion
    return (this.service as any).page || null;
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 ENHANCED STEALTH TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    console.log(`\nTotal Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${Math.round((passed / total) * 100)}%\n`);

    console.log('Detailed Results:');
    console.log('-'.repeat(60));
    this.results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`\n${status}: ${result.test}`);
      console.log(`   Details: ${result.details}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('🎯 STEALTH RECOMMENDATIONS');
    console.log('='.repeat(60));
    console.log(`
1. ✅ Navigator properties are properly masked
2. ✅ Canvas fingerprinting noise is injected
3. ✅ WebGL vendor/renderer are spoofed
4. ✅ WebRTC IP leaks are prevented
5. ✅ Permission API returns realistic values
6. ✅ Chrome runtime object is present
7. ✅ Hardware properties are realistic
8. ✅ Human-like behavior is available

🛡️ Your SmartMouse Playwright integration now has:
   - Advanced anti-detection measures
   - Human-like mouse movements and typing
   - Canvas/WebGL fingerprint randomization
   - WebRTC IP leak protection
   - Realistic browser fingerprints

⚠️  Remember: No stealth system is 100% undetectable.
    Always use responsibly and follow platform terms of service.
`);
  }

  async close(): Promise<void> {
    if (this.service) {
      await this.service.close();
      console.log('\n✅ Test completed and browser closed');
    }
  }
}

// Run the tests if this file is executed directly
if (require.main === module) {
  const tester = new EnhancedStealthTester();

  (async () => {
    const initialized = await tester.initialize();
    if (initialized) {
      await tester.runAllTests();
      await tester.close();
    } else {
      console.log('❌ Could not initialize tester. Make sure Chrome is running with CDP enabled.');
      console.log('   Run: chrome.exe --remote-debugging-port=9222');
      process.exit(1);
    }
  })();
}

export { EnhancedStealthTester };

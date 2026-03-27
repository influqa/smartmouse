import { PlaywrightService } from './playwright-service';
import * as path from 'path';

async function testStealthCapabilities() {
  console.log('🧪 Testing stealth capabilities...');

  const service = new PlaywrightService({
    cdpEndpoint: 'http://127.0.0.1:9222',
    stealth: true,
    headless: false, // Set to false so we can see the stealth test
    viewport: { width: 1366, height: 768 }
  });

  if (await service.launch()) {
    console.log('✅ Stealth browser launched successfully');
    
    // Serve the test page and navigate to it
    const testPagePath = `file://${path.resolve('./smartmouse-ts/test-stealth.html')}`;
    console.log(`🌐 Opening stealth test page: ${testPagePath}`);
    
    if (await service.navigateTo(testPagePath)) {
      console.log('✅ Stealth test page loaded successfully');
      console.log('📋 Page title:', await service.getTitle());
      
      // Wait for user to observe the test results
      console.log('⏳ Page opened - please check the stealth detection results in the browser.');
      console.log('Press Ctrl+C to close the browser when done viewing...');
      
      // Keep the browser open for manual inspection
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
    }
  }

  await service.close();
  console.log('✅ Browser closed');
}

// Run the test
testStealthCapabilities().catch(console.error);

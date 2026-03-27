import { executeAction } from './actions';
import * as path from 'path';

async function testStealthIntegration() {
  console.log('🧪 Testing SmartMouse Playwright integration with stealth...');
  
  // Initialize Playwright with connection to existing Chrome
  console.log('🚀 Initializing Playwright with stealth settings...');
  const initResult = await executeAction({
    action: 'init_playwright',
    config: {
      cdpEndpoint: 'http://127.0.0.1:9222',
      stealth: true,
      headless: false
    }
  });
  console.log('✅ Init result:', initResult);
  
  // Navigate to stealth test page
  console.log('🌐 Navigating to stealth test page...');
  const testPagePath = `file://${path.resolve('./smartmouse-ts/test-stealth.html')}`;
  const navResult = await executeAction({
    action: 'navigate',
    url: testPagePath
  });
  console.log('✅ Navigation result:', navResult);
  
  // Get page title
  const titleResult = await executeAction({
    action: 'get_page_title'
  });
  console.log('📋 Page title result:', titleResult);
  
  // Wait for user to observe results
  console.log('⏳ Page opened - please check the stealth detection results in the browser.');
  console.log('ℹ️  Look for any red indicators which would mean detection is happening.');
  console.log('ℹ️  Green indicators mean the browser appears legitimate.');
  
  // Wait 30 seconds for observation
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Close Playwright
  console.log('CloseOperation Closing Playwright...');
  const closeResult = await executeAction({
    action: 'close_playwright'
  });
  console.log('✅ Close result:', closeResult);
  
  console.log('🎉 Stealth integration test completed!');
}

// Run the test
testStealthIntegration().catch(console.error);
/**
 * Test Playwright Integration with SmartMouse
 * Verifies that Playwright actions work properly with the SmartMouse system
 */

import { playwrightActions } from './playwright-actions.js';
import { executeAction } from './actions.js';

async function testPlaywrightIntegration() {
  console.log('🧪 Testing Playwright Integration with SmartMouse...\n');

  // Test 1: Initialize Playwright service
  console.log('Test 1: Initializing Playwright service...');
  const initResult = await playwrightActions.initialize({
    cdpEndpoint: 'http://127.0.0.1:9222', // Connect to main Chrome
    stealth: true,
    headless: false
  });
  console.log(`✅ Init result: ${initResult.success ? 'SUCCESS' : 'FAILED'} - ${initResult.message}\n`);

  if (!initResult.success) {
    console.log('❌ Cannot proceed with tests - Playwright initialization failed');
    return;
  }

  // Test 2: Navigate to a test URL
  console.log('Test 2: Navigating to test URL...');
  const navResult = await playwrightActions.navigateToUrl('https://www.google.com');
  console.log(`✅ Navigation result: ${navResult.success ? 'SUCCESS' : 'FAILED'} - ${navResult.message}\n`);

  // Test 3: Get page title
  console.log('Test 3: Getting page title...');
  const titleResult = await playwrightActions.getPageTitle();
  console.log(`✅ Title result: ${titleResult.success ? 'SUCCESS' : 'FAILED'} - ${titleResult.message}\n`);

  // Test 4: Test the executeAction function with a Playwright action
  console.log('Test 4: Testing executeAction with Playwright action...');
  const actionResult = await executeAction({
    action: 'pw_get_page_title'
  });
  console.log(`✅ Execute action result: ${actionResult.success ? 'SUCCESS' : 'FAILED'} - ${actionResult.message}\n`);

  // Test 5: Try to find an element (search box on Google)
  console.log('Test 5: Finding search element...');
  const findResult = await playwrightActions.findElement([
    { type: 'css', value: 'textarea[name="q"]' },
    { type: 'xpath', value: '//textarea[@name="q"]' },
    { type: 'text', value: 'Search' }
  ]);
  console.log(`✅ Find element result: ${findResult.success ? 'SUCCESS' : 'FAILED'} - ${findResult.message}\n`);

  // Test 6: Close Playwright service
  console.log('Test 6: Closing Playwright service...');
  const closeResult = await playwrightActions.close();
  console.log(`✅ Close result: ${closeResult.success ? 'SUCCESS' : 'FAILED'} - ${closeResult.message}\n`);

  console.log('🎉 Playwright integration tests completed!');
}

// Run the test
testPlaywrightIntegration().catch(console.error);
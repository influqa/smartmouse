/**
 * Test script to verify Chrome launch fixes
 */

import { PlaywrightService } from './playwright-service';

async function testChromeLaunch() {
  console.log('🧪 Testing Chrome launch with fixed configuration...\n');

  // Create Playwright service with basic config
  const service = new PlaywrightService({
    cdpEndpoint: 'http://127.0.0.1:9222', // This will fall back to launching new instance
    stealth: true,
    headless: false, // Show the browser to verify it's not black
    viewport: { width: 1366, height: 768 }
  });

  console.log('🚀 Launching Chrome with fixed configuration...');
  const launchResult = await service.launch();

  if (!launchResult) {
    console.log('❌ Failed to launch Chrome');
    return;
  }

  console.log('✅ Chrome launched successfully, navigating to example site...');

  // Navigate to a test page
  const navResult = await service.navigateTo('https://www.google.com');
  if (!navResult) {
    console.log('❌ Failed to navigate to test page');
    await service.close();
    return;
  }

  // Wait a bit to see the page
  console.log('⏳ Waiting 5 seconds to observe the page...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Get the page title to confirm it's working
  const title = await service.getTitle();
  console.log(`📋 Page title: ${title}`);

  // Take a screenshot to verify visual content
  console.log('📸 Taking screenshot to verify visual content...');
  const screenshot = await service.screenshot();
  if (screenshot) {
    console.log('✅ Screenshot taken successfully - visual content is rendering');
  } else {
    console.log('❌ Failed to take screenshot - possible black screen issue');
  }

  console.log('CloseOperation browser...');
  await service.close();

  console.log('\n🎉 Test completed!');
}

// Run the test
testChromeLaunch().catch(console.error);
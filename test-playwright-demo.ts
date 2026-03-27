import { executeAction } from './actions';

async function demonstratePlaywrightIntegration() {
  console.log('🎯 Demonstrating SmartMouse + Playwright Integration...');
  
  // Initialize Playwright service
  console.log('\n🚀 Initializing Playwright service...');
  const initResult = await executeAction({
    action: 'init_playwright',
    config: {
      cdpEndpoint: 'http://127.0.0.1:9222',
      stealth: true,
      headless: false
    }
  });
  console.log('✅ Init result:', initResult.message);
  
  // Navigate to a reliable test site
  console.log('\n🌐 Navigating to test site...');
  const navResult = await executeAction({
    action: 'navigate',
    url: 'https://httpbin.org/'
  });
  console.log('✅ Navigation result:', navResult.message);
  
  // Get page title
  console.log('\n📋 Getting page title...');
  const titleResult = await executeAction({
    action: 'get_page_title'
  });
  console.log('✅ Title result:', titleResult.message);
  
  // Take a screenshot
  console.log('\n📸 Taking screenshot...');
  const screenshotResult = await executeAction({
    action: 'take_screenshot',
    path: './screenshots/playwright-demo.png'
  });
  console.log('✅ Screenshot result:', screenshotResult.message);
  
  // Close Playwright service
  console.log('\nCloseOperation Playwright service...');
  const closeResult = await executeAction({
    action: 'close_playwright'
  });
  console.log('✅ Close result:', closeResult.message);
  
  console.log('\n🎉 Playwright integration demonstration completed!');
}

// Run the demonstration
demonstratePlaywrightIntegration().catch(console.error);
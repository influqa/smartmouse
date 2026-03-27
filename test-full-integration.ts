import { executeAction, captureActiveChromeUrl, getCursorPosition, sleep, getScreenSize } from './actions';
import { PlaywrightService } from './playwright-service';
import { playwrightActions } from './playwright-actions';
import { ElementSelector } from './playwright-service';

async function testFullIntegration() {
  console.log('🎯 Testing Full SmartMouse + Playwright Integration...');

  // Test basic Windows automation
  console.log('\n🖱️ Testing basic mouse/keyboard actions...');
  const screenSize = await getScreenSize();
  console.log(`📏 Screen size: ${screenSize.width}x${screenSize.height}`);

  // Test Playwright actions through the action system
  console.log('\n🌐 Testing Playwright browser automation through action system...');

  // Initialize Playwright through the action system
  const initResult = await executeAction({
    action: 'init_playwright',
    config: {
      cdpEndpoint: 'http://127.0.0.1:9222',
      stealth: true,
      headless: false,
      viewport: { width: 1366, height: 768 }
    }
  });

  if (initResult.success) {
    console.log('✅ Playwright service launched successfully through action system');

    // Test navigation
    const navResult = await executeAction({
      action: 'navigate',
      url: 'https://www.google.com'
    });
    
    if (navResult.success) {
      console.log('✅ Successfully navigated to Google');

      // Test getting page info
      const titleResult = await executeAction({
        action: 'get_page_title'
      });
      console.log(`📋 Page title: ${(titleResult as any).playwright_specific?.title || titleResult.message}`);

      // Test element finding and interaction
      const fillResult = await executeAction({
        action: 'fill_field',
        selector: 'textarea[name="q"], [title="Search"], #APjFqb',
        text: 'SmartMouse Playwright Integration Test'
      });
      
      if (fillResult.success) {
        console.log('✅ Filled search box');

        // Wait a bit to see the result
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test pressing Enter to submit
        await executeAction({ action: 'press', key: 'Enter', reasoning: 'Submit search' });
        console.log('✅ Pressed Enter to submit search');

        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        console.log('❌ Failed to fill search box');
      }

      // Test taking a screenshot
      const screenshotResult = await executeAction({
        action: 'take_screenshot',
        path: './screenshots/full-integration-test.png'
      });
      
      if (screenshotResult.success) {
        console.log('📸 Screenshot taken successfully');
      } else {
        console.log('⚠️ Screenshot failed:', screenshotResult.message);
      }

      // Close the browser
      const closeResult = await executeAction({
        action: 'close_playwright'
      });
      
      console.log('✅ Browser closed');
    } else {
      console.log('❌ Failed to navigate to Google');
    }
  } else {
    console.log('❌ Failed to launch Playwright service through action system');
    console.log('Details:', initResult.message);
  }

  console.log('\n🎉 Full integration test completed!');
}

// Run the test
testFullIntegration().catch(console.error);

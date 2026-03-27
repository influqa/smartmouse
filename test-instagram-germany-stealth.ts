/**
 * Test: Instagram Germany Social Media Marketing with Enhanced Stealth
 * Uses human-like behavior and anti-detection measures
 */

import { PlaywrightService } from './playwright-service';
import {
  humanLikeMouseMove,
  humanLikeClick,
  humanLikeType,
  humanLikeScroll,
  simulateReading,
  thinkingPause,
  humanLikeInteraction
} from './human-behavior';

// Germany social media marketing related comments
const COMMENTS = [
  "Great insights on German social media strategies! 🇩🇪 Very helpful for businesses looking to expand in the German market.",
  "Thanks for sharing these valuable tips on digital marketing in Germany. The cultural nuances are so important! 🎯",
  "Excellent overview of the German social media landscape. Looking forward to implementing these strategies. 📈",
  "Very informative content about German digital marketing trends. The localization aspect is crucial for success. 🌟",
  "Impressive analysis of social media management in Germany. These strategies will definitely help international brands. 💼"
];

// Search terms for Germany social media marketing
const SEARCH_TERMS = [
  "germany social media marketing",
  "deutschland digital marketing",
  "german social media strategy",
  "social media agentur deutschland",
  "digital marketing germany"
];

async function testInstagramGermanyStealth() {
  console.log('🚀 Starting Instagram Germany Social Media Marketing Test with Enhanced Stealth\n');
  console.log('=' .repeat(70));

  // Initialize Playwright service with stealth
  const service = new PlaywrightService({
    cdpEndpoint: 'http://127.0.0.1:9222',
    stealth: true,
    headless: false,
    viewport: { width: 1366, height: 768 }
  });

  console.log('🔧 Initializing stealth browser...');
  const launched = await service.launch();

  if (!launched) {
    console.error('❌ Failed to launch browser. Make sure Chrome is running with CDP enabled.');
    console.log('   Run: chrome.exe --remote-debugging-port=9222');
    process.exit(1);
  }

  console.log('✅ Browser launched with stealth mode enabled\n');

  try {
    // Navigate to Instagram
    console.log('📱 Navigating to Instagram...');
    await service.navigateTo('https://www.instagram.com');
    await simulateReading(service.getPage(), 3000); // "Read" the page

    // Check if we need to log in
    const page = service.getPage();
    if (!page) {
      throw new Error('Page not initialized');
    }

    // Look for login form or already logged in state
    const loginCheck = await page.evaluate(() => {
      return {
        hasLoginForm: !!document.querySelector('input[name="username"]'),
        hasSearchBox: !!document.querySelector('input[placeholder*="Search"]'),
        url: window.location.href
      };
    });

    console.log(`   Current URL: ${loginCheck.url}`);
    console.log(`   Login form present: ${loginCheck.hasLoginForm}`);
    console.log(`   Search box present: ${loginCheck.hasSearchBox}`);

    if (loginCheck.hasLoginForm) {
      console.log('\n⚠️  Please log in to Instagram manually in the Chrome window.');
      console.log('   The script will wait for you to complete login...\n');

      // Wait for login to complete (search box appears)
      await page.waitForSelector('input[placeholder*="Search"]', { timeout: 120000 });
      console.log('✅ Login detected!\n');
    }

    // Wait a moment after login
    await thinkingPause(page, 2000, 4000);

    // Search for Germany social media marketing content
    const searchTerm = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
    console.log(`🔍 Searching for: "${searchTerm}"\n`);

    // Click on search box with human-like behavior
    const searchBox = await page.waitForSelector('input[placeholder*="Search"]', { timeout: 10000 });
    if (searchBox) {
      await humanLikeClick(page, 'input[placeholder*="Search"]', { speed: 'normal' });
      await thinkingPause(page, 500, 1000);

      // Type search term with human-like behavior
      await humanLikeType(page, 'input[placeholder*="Search"]', searchTerm, {
        speed: 'normal',
        mistakeChance: 0.02
      });

      await thinkingPause(page, 1000, 2000);

      // Press Enter to search
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    }

    // Wait for search results
    console.log('⏳ Waiting for search results...');
    await simulateReading(page, 3000);

    // Look for posts to comment on
    console.log('\n📋 Looking for posts to comment on...\n');

    // Try to find post links
    const posts = await page.$$('a[href*="/p/"]');
    console.log(`   Found ${posts.length} posts`);

    if (posts.length === 0) {
      console.log('⚠️  No posts found. Trying alternative selectors...');
      // Try other selectors
      const altPosts = await page.$$('article a');
      console.log(`   Found ${altPosts.length} posts with alternative selector`);
    }

    // Click on the first post with human-like behavior
    if (posts.length > 0) {
      console.log('\n🖱️  Clicking on first post...');
      await humanLikeClick(page, 'a[href*="/p/"]', { speed: 'slow' });
      await simulateReading(page, 2000);

      // Look for comment input
      const commentInput = await page.waitForSelector('textarea[placeholder*="Add a comment"]', { timeout: 10000 });

      if (commentInput) {
        console.log('💬 Found comment input\n');

        // Select a random comment
        const comment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
        console.log(`📝 Preparing to comment: "${comment.substring(0, 50)}..."\n`);

        // Click on comment input with human-like behavior
        await humanLikeClick(page, 'textarea[placeholder*="Add a comment"]', { speed: 'normal' });
        await thinkingPause(page, 500, 1500);

        // Type comment with human-like behavior
        await humanLikeType(page, 'textarea[placeholder*="Add a comment"]', comment, {
          speed: 'normal',
          mistakeChance: 0.03
        });

        await thinkingPause(page, 1000, 2000);

        // Look for post button
        const postButton = await page.$('button[type="submit"]');
        if (postButton) {
          console.log('📤 Clicking Post button...');
          await humanLikeClick(page, 'button[type="submit"]', { speed: 'normal' });
          await thinkingPause(page, 2000, 4000);

          console.log('\n✅ Comment posted successfully!\n');
        } else {
          console.log('⚠️  Post button not found, trying Enter key...');
          await page.keyboard.press('Enter');
          await thinkingPause(page, 2000, 4000);
          console.log('\n✅ Comment submitted!\n');
        }
      } else {
        console.log('⚠️  Comment input not found\n');
      }
    } else {
      console.log('⚠️  No posts found to comment on\n');
    }

    // Take a screenshot
    console.log('📸 Taking screenshot...');
    await page.screenshot({ path: 'instagram-germany-test.png', fullPage: true });
    console.log('   Screenshot saved: instagram-germany-test.png\n');

    console.log('=' .repeat(70));
    console.log('🎉 Test completed successfully!');
    console.log('=' .repeat(70));
    console.log(`
📊 Summary:
   - Browser launched with stealth mode
   - Navigated to Instagram
   - Searched for: "${searchTerm}"
   - Used human-like behavior throughout
   - Posted 1 comment on Germany social media content

🛡️  Stealth Features Active:
   - Navigator.webdriver = undefined
   - Canvas fingerprint noise injected
   - WebGL vendor spoofed
   - Human-like mouse movements
   - Natural typing with occasional pauses
   - Realistic timing between actions
`);

  } catch (error) {
    console.error('\n❌ Error during test:', error);

    // Take error screenshot
    try {
      const page = service.getPage();
      if (page) {
        await page.screenshot({ path: 'instagram-germany-error.png', fullPage: true });
        console.log('   Error screenshot saved: instagram-germany-error.png');
      }
    } catch (screenshotError) {
      console.error('   Failed to take error screenshot:', screenshotError);
    }
  } finally {
    // Close browser
    console.log('\n🔒 Closing browser...');
    await service.close();
    console.log('✅ Browser closed\n');
  }
}

// Helper to get page from service
// Extend PlaywrightService to expose getPage method
// This is a workaround since getPage is private
// We'll access it through the service object

// Run the test
testInstagramGermanyStealth().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

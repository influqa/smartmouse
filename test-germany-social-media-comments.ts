/**
 * Test script for adding 5 comments to 5 YouTube videos related to Germany social media management
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runGermanySocialMediaCommentTest() {
  console.log('🚀 Starting test: Adding 5 comments to 5 YouTube videos about Germany social media management\n');

  // Define the 5 YouTube videos related to Germany social media management
  // These are actual videos about Germany social media management
  const videos = [
    'https://www.youtube.com/watch?v=ejMaGw0rh20', // Digital Marketing in Germany - Strategies and Insights
    'https://www.youtube.com/watch?v=AR0SZI3_fW0', // Social Media Marketing in Europe - Focus on Germany
    'https://www.youtube.com/watch?v=Zg3p06uTw-w', // German E-commerce and Social Media Trends 2024
    'https://www.youtube.com/watch?v=JzFt521yY0A', // How to Market Your Brand in Germany - Cultural Insights
    'https://www.youtube.com/watch?v=U6ykT0d7biE'  // International Social Media Strategy - Germany Case Study
  ];

  // Define 5 different comments to post
  const comments = [
    "Great insights on German social media strategies! Very helpful for businesses looking to expand in the German market.",
    "Thanks for sharing these valuable tips on digital marketing in Germany. The cultural nuances are so important!",
    "Excellent overview of the German social media landscape. Looking forward to implementing these strategies.",
    "Very informative content about German digital marketing trends. The localization aspect is crucial for success.",
    "Impressive analysis of social media management in Germany. These strategies will definitely help international brands."
  ];

  console.log('📋 Videos to comment on:');
  videos.forEach((video, index) => {
    console.log(`   ${index + 1}. ${video}`);
  });

  console.log('\n💬 Comments to post:');
  comments.forEach((comment, index) => {
    console.log(`   ${index + 1}. "${comment}"`);
  });

  console.log('\n🎬 Running Playwright script for YouTube comments...');

  // Path to the Playwright YouTube comments script
  const scriptPath = join(__dirname, 'scripts', 'playwright-youtube-comments.mjs');

  // Run the Playwright script with dry run first to validate
  console.log('\n🔍 Performing dry run validation...');
  const dryRunArgs = ['--dry', '--videos', videos.join(','), '--comments', comments.join('|||')];
  await runScript(scriptPath, dryRunArgs);

  // If dry run passes, run the actual comment posting
  console.log('\n📝 Running actual comment posting...');
  const runArgs = ['--auto', '--videos', videos.join(','), '--comments', comments.join('|||')];
  await runScript(scriptPath, runArgs);

  console.log('\n🎉 Test completed!');
}

function runScript(scriptPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: dirname(scriptPath)
    });

    childProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Script completed successfully with code ${code}`);
        resolve();
      } else {
        console.log(`❌ Script failed with code ${code}`);
        reject(new Error(`Script failed with code ${code}`));
      }
    });

    childProcess.on('error', (err) => {
      console.error('❌ Error running script:', err);
      reject(err);
    });
  });
}

// Run the test
runGermanySocialMediaCommentTest().catch(console.error);
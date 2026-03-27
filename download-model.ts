/**
 * Manual model download helper
 * Run this if automatic download fails
 * 
 * Usage: bun download-model.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.join(__dirname, 'models');

// Model files to download
const MODEL = 'Xenova/vit-gpt2-image-captioning';
const FILES = [
  'config.json',
  'preprocessor_config.json',
  'model.safetensors',
  'tokenizer.json',
  'tokenizer_config.json'
];

const BASE_URL = `https://huggingface.co/${MODEL}/resolve/main`;

async function downloadFile(url: string, dest: string): Promise<boolean> {
  console.log(`📥 Downloading: ${path.basename(dest)}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`❌ Failed: ${response.status} ${response.statusText}`);
      return false;
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buffer));
    
    const sizeMB = Math.round(buffer.byteLength / 1024 / 1024);
    console.log(`✅ Saved: ${path.basename(dest)} (${sizeMB}MB)`);
    return true;
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    return false;
  }
}

async function main() {
  console.log('\n========================================');
  console.log('📦 SmartMouse Model Downloader');
  console.log('========================================\n');
  
  // Create model directory
  const modelDir = path.join(MODELS_DIR, MODEL.replace('/', '--'));
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
    console.log(`📁 Created: ${modelDir}\n`);
  }
  
  console.log(`Model: ${MODEL}`);
  console.log(`Target: ${modelDir}\n`);
  
  let success = 0;
  let failed = 0;
  
  for (const file of FILES) {
    const url = `${BASE_URL}/${file}`;
    const dest = path.join(modelDir, file);
    
    // Skip if already exists
    if (fs.existsSync(dest)) {
      const stat = fs.statSync(dest);
      if (stat.size > 1000) {
        console.log(`⏭️  Already exists: ${file}`);
        success++;
        continue;
      }
    }
    
    const ok = await downloadFile(url, dest);
    if (ok) success++;
    else failed++;
  }
  
  console.log('\n========================================');
  console.log(`✅ Downloaded: ${success} files`);
  if (failed > 0) console.log(`❌ Failed: ${failed} files`);
  console.log('========================================\n');
  
  if (failed === 0) {
    console.log('🎉 All files downloaded! You can now run:');
    console.log('   bun index.ts\n');
  } else {
    console.log('⚠️ Some files failed. Try:');
    console.log('1. Check internet connection');
    console.log('2. Use VPN if Hugging Face is blocked');
    console.log('3. Download manually from:');
    console.log(`   https://huggingface.co/${MODEL}\n`);
  }
}

main().catch(console.error);

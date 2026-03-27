#!/usr/bin/env bun

const body = {
  goal: "Search YouTube for '{{keyword}}', find 5 videos, comment on each",
  keyword: "canada social media marketing",
  comment_text: "Great strategy!",
  max_iterations: 20,
  wait_for_completion: false
};

console.log("🔍 Testing port 7916...\n");

try {
  const r = await fetch("http://127.0.0.1:7916/run/keyboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(7000)
  });

  console.log(`✅ Response: ${r.status}`);
  const data = await r.json();
  console.log(JSON.stringify(data, null, 2));
} catch (e: any) {
  console.error(`❌ Error: ${e.message}`);
}

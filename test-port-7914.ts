#!/usr/bin/env bun

const body = {
  goal: "Search YouTube for '{{keyword}}', find 5 videos, comment on each",
  keyword: "canada social media marketing",
  comment_text: "Great strategy!",
  max_iterations: 50,
  wait_for_completion: false
};

console.log("🔍 Testing port 7914...\n");

try {
  const r = await fetch("http://127.0.0.1:7914/run/keyboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });

  console.log(`✅ Response: ${r.status}`);
  const data = await r.json();
  console.log(JSON.stringify(data, null, 2));
} catch (e) {
  console.error(`❌ Error: ${e.message}`);
}

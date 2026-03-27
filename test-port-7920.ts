#!/usr/bin/env bun

const body = {
  goal: "Search YouTube for 'canada social media marketing', find 5 videos, comment on each",
  max_iterations: 18,
  wait_for_completion: false
};

const r = await fetch("http://127.0.0.1:7920/run/keyboard", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(8000)
});

console.log(`Status: ${r.status}`);
console.log(await r.text());

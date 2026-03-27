#!/usr/bin/env bun

const body = {
  goal: "Search YouTube for USA social media marketing videos. Open 5 relevant videos and post one comment on each video.",
  keyword: "usa social media marketing",
  comment_text: "Great insights on social media strategy in the USA. Thanks for sharing!",
  max_iterations: 45,
  wait_for_completion: false,
  requesting_agent: "kevin-test"
};

const res = await fetch("http://127.0.0.1:7920/run/keyboard", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(10000)
});

console.log(`HTTP ${res.status}`);
const data = await res.text();
console.log(data);

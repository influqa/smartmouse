#!/usr/bin/env bun

const runId = process.argv[2];
const port = process.argv[3] || '7920';

if (!runId) {
  console.error('Usage: bun check-report.ts <run_id> [port]');
  process.exit(1);
}

const res = await fetch(`http://127.0.0.1:${port}/report?run_id=${encodeURIComponent(runId)}`, {
  signal: AbortSignal.timeout(8000)
});

console.log(`HTTP ${res.status}`);
console.log(await res.text());

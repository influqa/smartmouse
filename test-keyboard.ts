#!/usr/bin/env bun

const goal = `Search YouTube for "canada social media marketing". 
Find 5 videos about this topic and open each one.
On each video, leave a comment saying: "Great strategy! Thanks for sharing."
Stop when all 5 videos have comments.`;

const body = {
  goal,
  keyword: "canada social media marketing",
  comment: "Great strategy! Thanks for sharing.",
  wait_for_completion: false,
  max_iterations: 50,
  requesting_agent: "keyboard-test"
};

// Try to find server with keyboard endpoint
const ports = [7910, 7912,  7901, 7903, 7905, 7907, 7908];
let workingPort: number | null = null;

console.log("🔍 Searching for server with /run/keyboard endpoint...\n");

for (const port of ports) {
  try {
    const testRes = await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(1000) });
    if (testRes.ok) {
      console.log(`✅ Found server on port ${port}`);
      workingPort = port;
      break;
    }
  } catch (e) {
    // Try next port
  }
}

if (!workingPort) {
  console.error("❌ No server found on ports:", ports.join(", "));
  process.exit(1);
}

console.log("\n📤 Sending keyboard-only test request...\n");
console.log("🎯 Goal:");
console.log(`  ${goal.replace(/\n/g, '\n  ')}\n`);

try {
  const response = await fetch(`http://127.0.0.1:${workingPort}/run/keyboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
    const text = await response.text();
    console.error(text);
    process.exit(1);
  }

  const result = await response.json();
  console.log("✅ Request accepted!\n");
  console.log(`📋 Run ID: ${result.run_id}`);
  console.log(`📊 Status: ${result.status}`);
  console.log(`🔗 Poll URL: ${result.poll}\n`);

  // Now poll for progress
  console.log("👀 Monitoring progress...\n");
  const pollInterval = setInterval(async () => {
    try {
      const reportUrl = `http://127.0.0.1:${workingPort}/report?run_id=${encodeURIComponent(result.run_id)}`;
      const reportRes = await fetch(reportUrl);
      const report = await reportRes.json();

      if (report.status === "running") {
        console.log(`⏳ Iteration ${report.iterations || 0}/50 | Actions: ${report.actions_executed || 0} | Status: ${report.note || "..."}`);
      } else if (report.status === "completed") {
        console.log(`\n✅ TASK COMPLETED!\n${JSON.stringify(report, null, 2)}`);
        clearInterval(pollInterval);
        process.exit(0);
      } else if (report.status === "failed") {
        console.log(`\n❌ TASK FAILED: ${report.completion_reason}\n${JSON.stringify(report, null, 2)}`);
        clearInterval(pollInterval);
        process.exit(1);
      } else {
        console.log(`\n📊 Status: ${report.status}\n${JSON.stringify(report, null, 2)}`);
        clearInterval(pollInterval);
      }
    } catch (e) {
      console.error(`⚠️ Poll error: ${e.message}`);
    }
  }, 2000);

  // Stop polling after 5 minutes
  setTimeout(() => {
    clearInterval(pollInterval);
    console.log("\n⏱️ Monitor timeout (5 min). Task may still be running. Check /report endpoint manually.");
    process.exit(0);
  }, 5 * 60 * 1000);
} catch (e) {
  console.error(`❌ Error: ${e.message}`);
  process.exit(1);
}

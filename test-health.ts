#!/usr/bin/env bun

console.log("🔍 Testing server health on 7907...\n");

try {
  const statusRes = await fetch("http://127.0.0.1:7907/status");
  console.log(`HTTP Status: ${statusRes.status}`);
  
  if (statusRes.ok) {
    const status = await statusRes.json();
    console.log("✅ Server is alive!");
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log("⚠️ Server returned error:", await statusRes.text());
  }
} catch (e) {
  console.error("❌ Cannot reach server:", e.message);
  console.log("\nTrying to start new server on 7908...");
  
  // Try starting server
  const { spawn } = await import("child_process");
  const server = spawn("bun", ["index.ts", "--port=7908"], {
    cwd: "c:\\Users\\kevin\\.openclaw\\smartmouse-ts",
    stdio: "pipe"
  });
  
  server.stdout.on("data", (data) => {
    console.log(`[SERVER] ${data}`);
  });
  
  server.stderr.on("data", (data) => {
    console.error(`[ERROR] ${data}`);
  });
  
  console.log("🚀 Server starting on port 7908...");
  process.exit(0);
}

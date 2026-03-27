#!/usr/bin/env bun

const ports = [7920, 7918, 7916, 7914, 7912, 7907, 7901];

for (const port of ports) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'force_stop_mouse' }),
      signal: AbortSignal.timeout(1200)
    });

    if (res.ok) {
      const text = await res.text();
      console.log(`✅ Stopped on ${port}: ${text}`);
    }
  } catch {
    // ignore unreachable ports
  }
}

console.log('Done.');

#!/usr/bin/env bun
import { executeAction } from './actions.ts';

const tests = [
  { action: 'click', x: 100, y: 100 },
  { action: 'move', x: 50, y: 50 },
  { action: 'scroll', direction: 'down', amount: 2 },
  { action: 'press', key: 'tab' }
];

for (const t of tests) {
  const res = await executeAction(t);
  console.log(`${t.action}: success=${res.success} message=${res.message}`);
}

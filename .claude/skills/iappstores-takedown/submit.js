#!/usr/bin/env node
// Usage: node submit.js '<json>' [--dry-run]
// json: {name,email,org,reason,proof,apps:[urls]}
const { chromium } = require('playwright');
(async () => {
  const a = JSON.parse(process.argv[2] || '{}');
  const dry = process.argv.includes('--dry-run');
  for (const k of ['name','email','reason','apps']) if (!a[k]) { console.error('missing '+k); process.exit(2); }
  if (!['dmca','trademark','privacy','impersonation','other'].includes(a.reason)) { console.error('bad reason'); process.exit(2); }
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  await p.goto('https://iappstores.com/takedown', { waitUntil: 'networkidle' });
  await p.fill('#name', a.name);
  await p.fill('#email', a.email);
  if (a.org) await p.fill('#org', a.org);
  await p.selectOption('#reason', a.reason);
  if (a.proof) await p.fill('#proof', a.proof);
  await p.fill('#apps', a.apps.join('\n'));
  if (dry) { console.log('DRY RUN: form filled, not submitted'); await b.close(); return; }
  await p.click('button[type=submit]');
  await p.waitForSelector('text=Request Submitted, .bg-red-50', { timeout: 20000 }).catch(()=>{});
  console.log((await p.innerText('main')).split('\n').filter(l=>/Submitted|Reference|received|Please|error/i.test(l)).join('\n'));
  await b.close();
})();

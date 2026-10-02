// Headless screenshot helper (dev only). Usage:
//   node scripts/screenshot.mjs <url> <out.png> [waitMs] [evalJs]
// Requires a Playwright install (global is fine) and Chromium with SwiftShader.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  const root = execSync('npm root -g').toString().trim();
  pw = require(`${root}/playwright`);
}
const [url, out, waitMs = '2500', evalJs = ''] = process.argv.slice(2);
const browser = await pw.chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(Number(waitMs));
if (evalJs) {
  await page.evaluate(evalJs);
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();

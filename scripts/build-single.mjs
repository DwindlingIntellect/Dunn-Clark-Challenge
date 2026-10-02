// Packs the production build (dist/) into one self-contained HTML file that
// can be opened by double-clicking it: no server, no install, works offline.
// Usage: npm run build:single  ->  release/AshenSpire.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, file) => {
  const css = readFileSync(join(dist, file), 'utf8');
  return `<style>\n${css}\n</style>`;
});

html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, file) => {
  // A literal "</script" inside the code would end the inline tag early.
  const js = readFileSync(join(dist, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});

if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('an asset reference was not inlined');

mkdirSync('release', { recursive: true });
writeFileSync('release/AshenSpire.html', html);
console.log(`release/AshenSpire.html (${(html.length / 1e6).toFixed(1)} MB)`);

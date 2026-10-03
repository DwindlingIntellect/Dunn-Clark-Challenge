import { defineConfig, type Plugin } from 'vitest/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Dev-only endpoints used by the level editor to write course files.
 * Only `src/levels/courses/<id>.json` and `src/levels/campaign.json` can
 * be written; nothing is exposed by production builds.
 */
function editorSavePlugin(): Plugin {
  const ID = /^[a-z0-9][a-z0-9_-]{0,40}$/;
  const levels = resolve(__dirname, 'src/levels');
  const readBody = (req: NodeJS.ReadableStream) =>
    new Promise<string>((ok, fail) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => ok(data));
      req.on('error', fail);
    });
  return {
    name: 'ashen-editor-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__editor/', async (req, res) => {
        const reply = (status: number, msg: string) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: status === 200, msg }));
        };
        if (req.method !== 'POST') return reply(405, 'POST only');
        try {
          const body = JSON.parse(await readBody(req));
          if (req.url === '/save-course') {
            const { id, content } = body as { id: string; content: string };
            if (!ID.test(id)) return reply(400, 'bad course id');
            if (JSON.parse(content).id !== id) return reply(400, 'id mismatch');
            writeFileSync(resolve(levels, 'courses', `${id}.json`), content);
            return reply(200, `saved courses/${id}.json`);
          }
          if (req.url === '/save-campaign') {
            const ids = (body as { ids: string[] }).ids;
            if (!Array.isArray(ids) || !ids.every((i) => ID.test(i))) return reply(400, 'bad campaign');
            writeFileSync(resolve(levels, 'campaign.json'), `${JSON.stringify(ids).replace(/,/g, ', ')}\n`);
            return reply(200, 'saved campaign.json');
          }
          return reply(404, 'unknown endpoint');
        } catch (e) {
          return reply(500, String(e));
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [editorSavePlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
});

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { injectMeta } from './pageMeta.js';

/**
 * Serves the built React app (client/dist) from the same address as the API, so cookies and the
 * CSRF check work without cross-site tricks. Returns false when there is no build to serve
 * (normal during development, where Vite serves the screens instead).
 * resolveMeta(path) may return share-preview details for product and vendor pages.
 */
export function mountClient(app, clientDir, { resolveMeta } = {}) {
  if (!clientDir || !existsSync(join(clientDir, 'index.html'))) return false;
  const indexHtml = readFileSync(join(clientDir, 'index.html'), 'utf8');

  // Built files carry a content hash in their names, so browsers can keep them for a year
  // and can never run an old copy after an update.
  app.use('/assets', express.static(join(clientDir, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  app.use('/assets', (req, res) => res.status(404).type('text/plain').send('Not found'));

  app.use(express.static(clientDir, { index: false, maxAge: '1h' }));

  // Any other page address belongs to the React router. The HTML is never cached.
  app.get('/{*splat}', async (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    if (resolveMeta) {
      try {
        const meta = await resolveMeta(req.path);
        if (meta) return res.type('html').send(injectMeta(indexHtml, meta));
      } catch {
        // a preview failure must never break the page itself
      }
    }
    res.sendFile(join(clientDir, 'index.html'));
  });
  return true;
}

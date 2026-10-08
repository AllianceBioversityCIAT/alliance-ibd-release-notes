import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkTokenStore } from './server/token-store';

// Amplify bundles browser files next to the server entry (compute/default/browser).
const bundledBrowserFolder = join(import.meta.dirname, 'browser');
const browserDistFolder = existsSync(bundledBrowserFolder)
  ? bundledBrowserFolder
  : join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * DynamoDB token store check: write, read and delete one fixed probe item.
 */
app.get('/api/health/db', async (_req, res) => {
  try {
    res.json({ ok: true, ...(await checkTokenStore()) });
  } catch (error) {
    const err = error as Error;
    console.error('Token store check failed', err);
    res.status(500).json({ ok: false, error: err.name, message: err.message });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 3000 (Amplify compute port).
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 3000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

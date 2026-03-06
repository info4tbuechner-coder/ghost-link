import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Middleware to parse JSON bodies
app.use(express.json());

// Security Headers Middleware (SecureMsg Spec 6.4)
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// In-memory store for messages
// Key: Message ID (UUID)
// Value: { encryptedData: string, expiresAt: number }
const messages = new Map<string, { encryptedData: string, expiresAt: number }>();

// Rate Limiting Store (Sliding Window)
// Key: Fingerprint (Hash of IP + UserAgent + WindowBucket)
// Value: Request Count
const rateLimits = new Map<string, number>();
const RL_WINDOW = 60 * 1000; // 1 minute
const RL_LIMIT = 10; // 10 requests per minute
const RL_SALT = randomBytes(16).toString('hex'); // Random salt per server restart

// Cleanup job: Remove expired messages every hour
setInterval(() => {
  const now = Date.now();
  for (const [id, message] of messages.entries()) {
    if (message.expiresAt < now) {
      messages.delete(id);
    }
  }
  // Cleanup rate limits (optional, simplistic)
  if (rateLimits.size > 10000) rateLimits.clear();
}, 60 * 60 * 1000);

// Rate Limiter Middleware
const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const ip = req.ip || 'unknown';
  const ua = req.headers['user-agent'] || '';
  const bucket = Math.floor(Date.now() / RL_WINDOW);
  
  // Create anonymous fingerprint (SecureMsg Spec 6.3)
  const fingerprint = createHash('sha256')
    .update(`${ip}${ua}${RL_SALT}${bucket}`)
    .digest('hex')
    .substring(0, 16);

  const current = rateLimits.get(fingerprint) || 0;
  
  if (current >= RL_LIMIT) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }
  
  rateLimits.set(fingerprint, current + 1);
  next();
};

/**
 * API Endpoints
 */

// POST /api/message - Create a new message
app.post('/api/message', rateLimiter, (req, res) => {
  const { encryptedData } = req.body;

  if (!encryptedData || typeof encryptedData !== 'string') {
    res.status(400).json({ error: 'Invalid encrypted data' });
    return;
  }

  if (encryptedData.length > 65536) { // 64KB limit
     res.status(413).json({ error: 'Payload too large' });
     return;
  }

  // Generate a unique ID
  const id = randomUUID().replace(/-/g, ''); // Remove dashes to match hex style if preferred, or keep UUID

  // Set expiration to 48 hours from now
  const expiresAt = Date.now() + 48 * 60 * 60 * 1000;

  // Store the message
  messages.set(id, { encryptedData, expiresAt });

  res.status(201).json({ id, expiresAt });
});

// GET /api/message/:id - Retrieve and delete a message
app.get('/api/message/:id', rateLimiter, (req, res) => {
  const id = req.params['id'];
  
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid ID format' });
    return;
  }
  
  // Atomic GET+DELETE (SecureMsg Spec 1.1)
  // We retrieve and delete from the map in the same synchronous block
  // to prevent race conditions where two requests could read the same message.
  const message = messages.get(id);
  
  // Delete immediately if found (or if expired, we'll check that next)
  // This ensures "Read Once" property.
  if (message) {
    messages.delete(id);
  }

  if (!message) {
    res.status(404).json({ error: 'Message not found or already read' });
    return;
  }

  // Check if expired
  if (Date.now() > message.expiresAt) {
    // Already deleted above, just return error
    res.status(404).json({ error: 'Message expired' });
    return;
  }

  // Return the encrypted data
  res.json({ encryptedData: message.encryptedData });
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
 * Fallback to index.html for client-side routing if SSR didn't handle it
 */
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.url.startsWith('/api')) {
    res.sendFile(join(browserDistFolder, 'index.html'));
  } else {
    next();
  }
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
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

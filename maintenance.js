'use strict';

/**
 * Maintenance mode middleware.
 *
 * When mounted at the top of the Express app, intercepts every incoming
 * request and responds with a holding page (for browsers) or a 503 JSON
 * response (for API clients). Nothing else runs.
 *
 * To enable:   in index.js, add `app.use(require('./maintenance'));`
 *              immediately after `const app = express();`
 *
 * To disable:  delete (or comment out) that one line. All other routes
 *              resume normal operation.
 *
 * Why this design:
 *   - Single insertion point — cannot accidentally leave a path reachable.
 *   - Does not depend on the rest of the route tree, so it keeps working
 *     even while you continue editing other files.
 *   - Stays in the repo as a reusable tool for future planned outages.
 */

const HOLDING_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ClearStand</title>
<style>
  :root { --navy:#0D1B2A; --blue:#2E86C1; --text:#E8EDF2; --text2:#8BA3BA; --border:#2A3F56; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--navy);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    line-height: 1.6;
  }
  .card {
    max-width: 560px;
    width: 100%;
    padding: 48px 36px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: rgba(46,134,193,0.04);
  }
  h1 {
    font-family: 'Playfair Display', Georgia, serif;
    font-weight: 700;
    font-size: 2.25rem;
    letter-spacing: -0.01em;
    margin-bottom: 4px;
  }
  h1 span { color: var(--blue); }
  .tag {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text2);
    margin-bottom: 28px;
  }
  p { margin-bottom: 16px; color: var(--text); }
  .muted { color: var(--text2); font-size: 0.92rem; }
  a { color: var(--blue); text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <main class="card">
    <h1>Clear<span>Stand</span></h1>
    <div class="tag">Canadian Legal Technology</div>
    <p>ClearStand is not yet available to the public.</p>
    <p>The platform is in final pre-launch preparation and is not currently accepting users, subscriptions, or inquiries from the general public.</p>
    <p class="muted">For professional or regulatory inquiries, please contact the operator directly.</p>
  </main>
</body>
</html>`;

module.exports = function maintenance(req, res, next) {
  // API clients get a structured response; browsers get the holding page.
  // Path-prefix match is used instead of content-negotiation because some
  // clients (curl, fetch without headers) accept */* and we'd rather
  // a developer see a useful JSON body than an HTML blob.
  if (req.path.startsWith('/api/')) {
    return res
      .status(503)
      .set('Retry-After', '86400')
      .json({ error: 'Service temporarily unavailable.', maintenance: true });
  }

  return res
    .status(200)
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(HOLDING_PAGE);
};

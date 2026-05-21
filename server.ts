import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import app, { runDeadlineChecks } from './api/index';

async function startServer() {
  const PORT = 3000;

  // Vite middleware for local development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get(/.*/, (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  // Local auto deadline reminders check interval (disabled on Vercel)
  if (process.env.VERCEL !== '1') {
    // Run every hour
    setInterval(async () => {
      try {
        console.log('Running local auto deadline reminder check...');
        await runDeadlineChecks();
      } catch (err) {
        console.error('Error running automated deadline check:', err);
      }
    }, 60 * 60 * 1000);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('CRITICAL: Server failed to start:', err);
  process.exit(1);
});

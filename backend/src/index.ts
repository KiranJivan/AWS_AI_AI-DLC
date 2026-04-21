import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import teamRoutes from './routes/teams';
import boardRoutes from './routes/boards';
import cardRoutes from './routes/cards';
import actionItemRoutes from './routes/actionItems';
import { AppError } from './types';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security headers ───────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ── Body parsing (10 kb limit to prevent payload attacks) ─────────────────────
app.use(express.json({ limit: '10kb' }));

// ── Rate limiting ──────────────────────────────────────────────────────────────
// Strict limit on auth endpoints to prevent brute-force and enumeration attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// General API limiter for all other routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/teams', apiLimiter, teamRoutes);
app.use('/api/teams/:teamId/boards', apiLimiter, boardRoutes);
app.use('/api/teams/:teamId/boards/:boardId/cards', apiLimiter, cardRoutes);
app.use('/api/teams/:teamId/boards/:boardId/action-items', apiLimiter, actionItemRoutes);

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const isProduction = process.env.NODE_ENV === 'production';

  console.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  res.status(500).json({
    error: 'Internal server error',
    ...(isProduction ? {} : { details: err.message }),
  });
});

app.listen(PORT, () => {
  console.log(`TeamRetro API running on http://localhost:${PORT}`);
});

export default app;

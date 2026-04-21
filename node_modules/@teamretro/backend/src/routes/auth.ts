/**
 * @module routes/auth
 * @description Authentication routes — handles user registration, login, and
 * retrieval of the currently authenticated user's profile.
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/store';
import { signToken, requireAuth, AuthRequest, verifyToken } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

/**
 * @route POST /api/auth/register
 * @access Public
 * @body {string} email - The user's email address (must be unique)
 * @body {string} name - The user's display name (min 2 characters)
 * @body {string} password - The user's password (min 8 characters)
 * @returns {201} { token: string, user: { id, email, name } } — registration successful
 * @returns {409} { error: string } — email already registered
 */
router.post(
  '/register',
  validateBody({
    email: { type: 'string', required: true, maxLength: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    name: { type: 'string', required: true, minLength: 2, maxLength: 100 },
    password: { type: 'string', required: true, minLength: 8, maxLength: 128 },
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, name, password } = req.body as {
      email: string;
      name: string;
      password: string;
    };

    try {
      if (db.getUserByEmail(email)) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = db.saveUser({
        id: uuidv4(),
        email: email.toLowerCase().trim(),
        name: name.trim(),
        passwordHash,
        createdAt: new Date().toISOString(),
      });

      const token = signToken({ userId: user.id, email: user.email });
      res.status(201).json({
        token,
        user: { id: user.id, email: user.email, name: user.name },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @route POST /api/auth/login
 * @access Public
 * @body {string} email - The user's email address
 * @body {string} password - The user's password
 * @returns {200} { token: string, user: { id, email, name } } — login successful
 * @returns {401} { error: string } — invalid email or password
 */
router.post(
  '/login',
  validateBody({
    email: { type: 'string', required: true, maxLength: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    password: { type: 'string', required: true, maxLength: 128 },
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body as { email: string; password: string };

    try {
      const user = db.getUserByEmail(email);
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const token = signToken({ userId: user.id, email: user.email });
      res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @route GET /api/auth/me
 * @access Private (requireAuth)
 * @returns {200} { id: string, email: string, name: string } — current user's profile
 * @returns {401} { error: string } — missing or invalid token
 * @returns {404} { error: string } — user record not found
 */
router.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  const user = db.getUser(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name });
});

export default router;

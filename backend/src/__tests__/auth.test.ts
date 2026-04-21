import request from 'supertest';

// Set required env vars before importing app (JWT_SECRET is validated at startup)
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-validation-32chars';

import app from '../index';

// Use supertest — install it
describe('Auth API', () => {
  const email = `test-${Date.now()}@example.com`;
  const password = 'password123';
  let token: string;

  it('POST /api/auth/register — creates a user', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email,
      name: 'Test User',
      password,
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(email);
    token = res.body.token;
  });

  it('POST /api/auth/register — rejects duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email,
      name: 'Test User 2',
      password,
    });
    expect(res.status).toBe(409);
  });

  it('POST /api/auth/login — returns token', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('POST /api/auth/login — rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me — returns current user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
  });
});

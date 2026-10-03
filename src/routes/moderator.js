const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { requireModerator } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { parse } = require('../utils/validate');
const { STATUSES, canTransition } = require('../utils/workflow');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many login attempts, please try again later' },
});

// Pre-computed hash so login takes similar time whether or not the user exists
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

const loginSchema = z.object({
  username: z.string({ message: 'username is required' }).min(1, 'username is required').max(100),
  password: z.string({ message: 'password is required' }).min(1, 'password is required').max(200),
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = parse(loginSchema, req.body);
  const mod = db.prepare('SELECT id, password_hash FROM moderators WHERE username = ?').get(username);
  const ok = bcrypt.compareSync(password, mod ? mod.password_hash : DUMMY_HASH);
  if (!mod || !ok) throw new HttpError(401, 'Invalid username or password'); // same message for both

  const token = jwt.sign({ sub: String(mod.id), role: 'moderator' }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });
  res.json({ token, tokenType: 'Bearer', expiresIn: config.jwtExpiresIn });
});

// Everything below requires a valid moderator token
router.use(requireModerator);

// Explicit column list: case_code_hash is NEVER selected for moderators
const REPORT_COLS = 'id, category, description, evidence_url, status, created_at, updated_at';
const toDto = (r) => ({
  id: r.id,
  category: r.category,
  description: r.description,
  evidenceUrl: r.evidence_url,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const listSchema = z.object({
  category: z.enum(['Security', 'Harassment', 'Corruption', 'Technical', 'Other']).optional(),
  status: z.enum(STATUSES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/reports', (req, res) => {
  const q = parse(listSchema, req.query);
  const where = [];
  const params = [];
  if (q.category) { where.push('category = ?'); params.push(q.category); }
  if (q.status) { where.push('status = ?'); params.push(q.status); }
  if (q.search) { where.push('description LIKE ?'); params.push(`%${q.search}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM reports ${clause}`).get(...params).n;
  const rows = db
    .prepare(`SELECT ${REPORT_COLS} FROM reports ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, q.limit, q.offset);

  res.json({ total, limit: q.limit, offset: q.offset, reports: rows.map(toDto) });
});

router.get('/reports/:id', (req, res) => {
  const report = db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE id = ?`).get(req.params.id);
  if (!report) throw new HttpError(404, 'Report not found');
  const updates = db
    .prepare('SELECT status, message, created_at FROM status_updates WHERE report_id = ? ORDER BY id ASC')
    .all(report.id);
  res.json({ ...toDto(report), updates: updates.map((u) => ({ status: u.status, message: u.message, at: u.created_at })) });
});

const statusSchema = z.object({
  status: z.enum(STATUSES, { message: `status must be one of: ${STATUSES.join(', ')}` }),
  message: z.string().trim().max(500, 'message must be at most 500 characters').optional(),
});

router.patch('/reports/:id/status', (req, res) => {
  const { status, message } = parse(statusSchema, req.body);

  // Read + validate + write inside one transaction so concurrent updates cannot skip the workflow
  const result = db.transaction(() => {
    const report = db.prepare('SELECT id, status FROM reports WHERE id = ?').get(req.params.id);
    if (!report) throw new HttpError(404, 'Report not found');
    if (!canTransition(report.status, status)) {
      throw new HttpError(409, `Cannot move report from ${report.status} to ${status}`);
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE reports SET status = ?, updated_at = ? WHERE id = ?').run(status, now, report.id);
    db.prepare('INSERT INTO status_updates (report_id, status, message, created_at) VALUES (?, ?, ?, ?)')
      .run(report.id, status, message || null, now);
    return { id: report.id, previousStatus: report.status, status, message: message || null, updatedAt: now };
  })();

  res.json(result);
});

module.exports = router;

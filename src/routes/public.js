const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { generateCaseCode, hashCaseCode, isValidFormat } = require('../utils/caseCode');
const { HttpError } = require('../utils/errors');
const { parse } = require('../utils/validate');

const router = express.Router();
const skip = () => process.env.NODE_ENV === 'test';
const limiter = (max) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit: max,
    skip,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });

const CATEGORIES = ['Security', 'Harassment', 'Corruption', 'Technical', 'Other'];

const reportSchema = z.object({
  category: z.enum(CATEGORIES, { message: `category must be one of: ${CATEGORIES.join(', ')}` }),
  description: z
    .string({ message: 'description is required' })
    .trim()
    .min(10, 'description must be at least 10 characters')
    .max(5000, 'description must be at most 5000 characters'),
  evidenceUrl: z
    .string()
    .trim()
    .max(2000)
    .url('evidenceUrl must be a valid URL')
    .refine((u) => /^https?:\/\//i.test(u), 'evidenceUrl must start with http:// or https://')
    .optional(),
});

// POST /api/reports  - submit anonymously
router.post('/reports', limiter(10), (req, res) => {
  const data = parse(reportSchema, req.body);
  const caseCode = generateCaseCode();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO reports (id, case_code_hash, category, description, evidence_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?, ?)`
    ).run(id, hashCaseCode(caseCode), data.category, data.description, data.evidenceUrl ?? null, now, now);
    db.prepare(
      `INSERT INTO status_updates (report_id, status, message, created_at) VALUES (?, 'SUBMITTED', 'Report received', ?)`
    ).run(id, now);
  })();

  res.status(201).json({
    caseCode,
    status: 'SUBMITTED',
    message: 'Save this case code now. It is shown only once and cannot be recovered.',
  });
});

// GET /api/reports/track/:caseCode  - reporter checks status
router.get('/reports/track/:caseCode', limiter(20), (req, res) => {
  const { caseCode } = req.params;
  if (!isValidFormat(caseCode)) throw new HttpError(400, 'Invalid case code format');

  const report = db
    .prepare('SELECT id, category, status, created_at, updated_at FROM reports WHERE case_code_hash = ?')
    .get(hashCaseCode(caseCode));
  if (!report) throw new HttpError(404, 'No report found for this case code');

  const updates = db
    .prepare('SELECT status, message, created_at FROM status_updates WHERE report_id = ? ORDER BY id ASC')
    .all(report.id);

  res.json({
    category: report.category,
    status: report.status,
    submittedAt: report.created_at,
    lastUpdatedAt: report.updated_at,
    updates: updates.map((u) => ({ status: u.status, message: u.message, at: u.created_at })),
  });
});

module.exports = router;

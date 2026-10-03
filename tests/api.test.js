process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.CASE_CODE_PEPPER = 'test-pepper';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const db = require('../src/db');

let token;
const validReport = { category: 'Security', description: 'Admin credentials are shared in a public channel.' };

const submit = (body = validReport) => request(app).post('/api/reports').send(body);

beforeAll(async () => {
  db.prepare('INSERT INTO moderators (username, password_hash) VALUES (?, ?)').run('mod', bcrypt.hashSync('Password123!', 4));
  const res = await request(app).post('/api/moderator/login').send({ username: 'mod', password: 'Password123!' });
  token = res.body.token;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('public reporting', () => {
  test('valid report returns 201 and a case code', async () => {
    const res = await submit({ ...validReport, evidenceUrl: 'https://example.com/evidence' });
    expect(res.status).toBe(201);
    expect(res.body.caseCode).toMatch(/^WD-[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    expect(res.body.status).toBe('SUBMITTED');
  });

  test('case codes are unique and not sequential', async () => {
    const a = (await submit()).body.caseCode;
    const b = (await submit()).body.caseCode;
    expect(a).not.toBe(b);
  });

  test('invalid category returns 400', async () => {
    const res = await submit({ ...validReport, category: 'Nope' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('category');
  });

  test('short description and bad URL return 400', async () => {
    expect((await submit({ category: 'Other', description: 'short' })).status).toBe(400);
    expect((await submit({ ...validReport, evidenceUrl: 'ftp://x.com' })).status).toBe(400);
    expect((await submit({ ...validReport, evidenceUrl: 'not a url' })).status).toBe(400);
  });

  test('missing body returns 400 and malformed JSON returns 400', async () => {
    expect((await request(app).post('/api/reports').send({})).status).toBe(400);
    const bad = await request(app).post('/api/reports').set('Content-Type', 'application/json').send('{bad');
    expect(bad.status).toBe(400);
  });
});

describe('case tracking', () => {
  test('tracks a report with its case code (case-insensitive, dashes optional)', async () => {
    const { caseCode } = (await submit()).body;
    const res = await request(app).get(`/api/reports/track/${caseCode}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.updates).toHaveLength(1);
    expect(res.body).not.toHaveProperty('id');
    expect(res.body).not.toHaveProperty('description');

    const loose = await request(app).get(`/api/reports/track/${caseCode.toLowerCase().replace(/-/g, '')}`);
    expect(loose.status).toBe(200);
  });

  test('unknown case code returns 404, malformed returns 400', async () => {
    expect((await request(app).get('/api/reports/track/WD-AAAA-AAAA-AAAA-AAAA')).status).toBe(404);
    expect((await request(app).get('/api/reports/track/garbage')).status).toBe(400);
  });
});

describe('moderator access', () => {
  test('routes without token return 401; bad token returns 401', async () => {
    expect((await request(app).get('/api/moderator/reports')).status).toBe(401);
    expect((await request(app).get('/api/moderator/reports').set('Authorization', 'Bearer abc')).status).toBe(401);
    expect((await request(app).patch('/api/moderator/reports/x/status').send({ status: 'UNDER_REVIEW' })).status).toBe(401);
  });

  test('login failures return 401 with the same message', async () => {
    const wrongPass = await request(app).post('/api/moderator/login').send({ username: 'mod', password: 'wrong' });
    const wrongUser = await request(app).post('/api/moderator/login').send({ username: 'ghost', password: 'wrong' });
    expect(wrongPass.status).toBe(401);
    expect(wrongUser.status).toBe(401);
    expect(wrongPass.body.error).toBe(wrongUser.body.error);
  });

  test('list supports filters and never exposes case code or hash', async () => {
    await submit({ category: 'Harassment', description: 'A manager keeps making inappropriate comments.' });
    const res = await request(app).get('/api/moderator/reports?category=Harassment&status=SUBMITTED').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.reports.length).toBeGreaterThan(0);
    for (const r of res.body.reports) expect(r.category).toBe('Harassment');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/case_code|caseCode|hash|WD-/i);
  });

  test('invalid filter returns 400', async () => {
    const res = await request(app).get('/api/moderator/reports?status=BOGUS').set(auth());
    expect(res.status).toBe(400);
  });
});

describe('status workflow', () => {
  test('full lifecycle is visible to the reporter', async () => {
    const unique = `Unique lifecycle report ${Date.now()}`;
    const { caseCode: code2 } = (await submit({ category: 'Technical', description: unique })).body;
    const rid = (await request(app).get(`/api/moderator/reports?search=${encodeURIComponent(unique)}`).set(auth())).body.reports[0].id;
    const p = (body) => request(app).patch(`/api/moderator/reports/${rid}/status`).set(auth()).send(body);

    expect((await p({ status: 'RESOLVED' })).status).toBe(409); // skipping UNDER_REVIEW
    expect((await p({ status: 'UNDER_REVIEW', message: 'We are investigating' })).status).toBe(200);
    expect((await p({ status: 'UNDER_REVIEW' })).status).toBe(409); // same status
    expect((await p({ status: 'RESOLVED', message: 'Fixed' })).status).toBe(200);
    const after = await p({ status: 'DISMISSED' });
    expect(after.status).toBe(409); // terminal state
    expect(after.body.error).toMatch(/RESOLVED to DISMISSED/);

    const track = await request(app).get(`/api/reports/track/${code2}`);
    expect(track.body.status).toBe('RESOLVED');
    expect(track.body.updates.map((u) => u.status)).toEqual(['SUBMITTED', 'UNDER_REVIEW', 'RESOLVED']);
    expect(track.body.updates[1].message).toBe('We are investigating');
  });

  test('invalid status value, long message, unknown id', async () => {
    const id = (await request(app).get('/api/moderator/reports').set(auth())).body.reports[0].id;
    const p = (i, body) => request(app).patch(`/api/moderator/reports/${i}/status`).set(auth()).send(body);
    expect((await p(id, { status: 'DONE' })).status).toBe(400);
    expect((await p(id, { status: 'UNDER_REVIEW', message: 'x'.repeat(501) })).status).toBe(400);
    expect((await p('does-not-exist', { status: 'UNDER_REVIEW' })).status).toBe(404);
  });
});

describe('misc', () => {
  test('unknown route returns 404 JSON', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('DB stores only a hash of the case code', async () => {
    const { caseCode } = (await submit()).body;
    const rows = db.prepare('SELECT * FROM reports').all();
    expect(JSON.stringify(rows)).not.toContain(caseCode);
    expect(Object.keys(rows[0])).not.toEqual(expect.arrayContaining(['ip', 'user_agent']));
  });
});

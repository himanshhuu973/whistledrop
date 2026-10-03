require("dotenv").config({ quiet: true });
const bcrypt = require('bcryptjs');
const db = require('../src/db');

const username = process.env.MODERATOR_USERNAME;
const password = process.env.MODERATOR_PASSWORD;
if (!username || !password || password.length < 10) {
  console.error('Set MODERATOR_USERNAME and MODERATOR_PASSWORD (min 10 chars) in .env');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
db.prepare(
  `INSERT INTO moderators (username, password_hash) VALUES (?, ?)
   ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`
).run(username, hash);
console.log(`Moderator "${username}" is ready.`);

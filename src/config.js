require('dotenv').config({ quiet: true });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || 'whistledrop.db',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  pepper: process.env.CASE_CODE_PEPPER,
};

if (!config.jwtSecret || !config.pepper) {
  throw new Error('JWT_SECRET and CASE_CODE_PEPPER must be set (see .env.example)');
}

module.exports = config;

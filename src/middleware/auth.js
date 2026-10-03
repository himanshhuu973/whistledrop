const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('../utils/errors');

function requireModerator(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Authentication required'));
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (payload.role !== 'moderator') throw new Error('bad role');
    req.moderator = { id: payload.sub };
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}
module.exports = { requireModerator };

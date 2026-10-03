const notFound = (req, res) => res.status(404).json({ error: 'Route not found' });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  if (err.status && err.status < 500) {
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }
  // Deliberately not logging request data (privacy). Only the error itself.
  console.error('Internal error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
};

module.exports = { notFound, errorHandler };

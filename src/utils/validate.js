const { HttpError } = require('./errors');

// Parses `data` with a zod schema or throws a 400 with field-level details
function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || 'body',
      message: i.message,
    }));
    throw new HttpError(400, 'Validation failed', details);
  }
  return result.data;
}
module.exports = { parse };

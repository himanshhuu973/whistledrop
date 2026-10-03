const bearer = [{ bearerAuth: [] }];
const err = (d) => ({
  description: d,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

module.exports = {
  openapi: '3.0.3',
  info: { title: 'WhistleDrop API', version: '1.0.0', description: 'Anonymous confidential reporting backend' },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' }, details: { type: 'array', items: { type: 'object' } } } },
      NewReport: {
        type: 'object',
        required: ['category', 'description'],
        properties: {
          category: { type: 'string', enum: ['Security', 'Harassment', 'Corruption', 'Technical', 'Other'] },
          description: { type: 'string', minLength: 10, maxLength: 5000 },
          evidenceUrl: { type: 'string', format: 'uri' },
        },
      },
      StatusChange: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['UNDER_REVIEW', 'RESOLVED', 'DISMISSED'] },
          message: { type: 'string', maxLength: 500 },
        },
      },
    },
  },
  paths: {
    '/api/reports': {
      post: {
        tags: ['Public'],
        summary: 'Submit an anonymous report',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewReport' } } } },
        responses: { 201: { description: 'Created. Returns the one-time case code.' }, 400: err('Validation failed'), 429: err('Rate limited') },
      },
    },
    '/api/reports/track/{caseCode}': {
      get: {
        tags: ['Public'],
        summary: 'Check report status with a case code',
        parameters: [{ name: 'caseCode', in: 'path', required: true, schema: { type: 'string' }, example: 'WD-XXXX-XXXX-XXXX-XXXX' }],
        responses: { 200: { description: 'Status and public updates' }, 400: err('Bad format'), 404: err('Unknown code'), 429: err('Rate limited') },
      },
    },
    '/api/moderator/login': {
      post: {
        tags: ['Moderator'],
        summary: 'Log in and get a JWT',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'JWT token' }, 400: err('Validation failed'), 401: err('Invalid credentials') },
      },
    },
    '/api/moderator/reports': {
      get: {
        tags: ['Moderator'],
        summary: 'List and filter reports',
        security: bearer,
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { 200: { description: 'Paginated list' }, 400: err('Bad filter'), 401: err('Unauthorized') },
      },
    },
    '/api/moderator/reports/{id}': {
      get: {
        tags: ['Moderator'],
        summary: 'Get one report with its history',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Report' }, 401: err('Unauthorized'), 404: err('Not found') },
      },
    },
    '/api/moderator/reports/{id}/status': {
      patch: {
        tags: ['Moderator'],
        summary: 'Update status and add a public status message',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StatusChange' } } } },
        responses: { 200: { description: 'Updated' }, 400: err('Validation failed'), 401: err('Unauthorized'), 404: err('Not found'), 409: err('Invalid transition') },
      },
    },
  },
};

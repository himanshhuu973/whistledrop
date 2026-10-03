const express = require('express');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const publicRoutes = require('./routes/public');
const moderatorRoutes = require('./routes/moderator');
const openapi = require('./openapi');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
// Set TRUST_PROXY=1 when deployed behind a proxy (Render, Railway) so rate limiting sees client IPs.
// IPs are used in memory by the rate limiter only; they are never stored or logged.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
// No request logger on purpose: nothing about reporters is logged.

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use('/api', publicRoutes);
app.use('/api/moderator', moderatorRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

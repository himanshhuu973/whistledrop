const config = require('./config');
const app = require('./app');

app.listen(config.port, () => {
  console.log(`WhistleDrop running on http://localhost:${config.port}  (docs: /docs)`);
});

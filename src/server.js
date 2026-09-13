const app = require('./app');
const config = require('./config/env');

app.listen(config.port, () => {
  console.log(`nutria-backend escuchando en http://localhost:${config.port}`);
});

const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const config = require('./config/env');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());
app.use(routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const config = require('./config/env');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// El backend siempre corre detrás de Traefik (local y staging): con un salto de
// proxy de confianza, req.ip es la IP del cliente y no la del proxy. El rate
// limit del login cuenta por esa IP.
app.set('trust proxy', 1);

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());
app.use(routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

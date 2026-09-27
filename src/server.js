const app = require('./app');
const config = require('./config/env');

// Desde Node 15 una promesa rechazada sin catch termina el proceso. Express 5 ya
// captura los rechazos de los handlers de rutas; esto cubre los que queden
// fuera de una request (un timer, un listener) para que no tiren el backend.
process.on('unhandledRejection', (reason) => {
  console.error('Promesa rechazada sin manejar:', reason);
});

app.listen(config.port, () => {
  console.log(`nutria-backend escuchando en http://localhost:${config.port}`);
});

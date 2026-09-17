// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);
  const body = { error: err.message || 'Internal server error' };
  if (err.fields) body.fields = err.fields;
  res.status(err.status || 500).json(body);
}

module.exports = errorHandler;

function notFound(req, res) {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
}

module.exports = notFound;

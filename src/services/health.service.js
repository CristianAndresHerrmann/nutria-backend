function getStatus() {
  return {
    status: 'ok',
    service: 'nutria-backend',
    timestamp: new Date().toISOString(),
  };
}

module.exports = { getStatus };

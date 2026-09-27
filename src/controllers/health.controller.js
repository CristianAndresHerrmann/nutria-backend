const healthService = require('../services/health.service');

function getHealth(req, res) {
  res.status(200).json(healthService.getStatus());
}

async function getIaHealth(req, res, next) {
  try {
    res.status(200).json(await healthService.getIaStatus());
  } catch (error) {
    next(error);
  }
}

module.exports = { getHealth, getIaHealth };

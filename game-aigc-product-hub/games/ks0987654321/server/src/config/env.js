'use strict';
const path = require('node:path');
module.exports = {
  port: Number(process.env.PORT || 3100),
  host: '127.0.0.1',
  fixtureDir: process.env.CONFIG_FIXTURE_DIR || path.resolve(__dirname, '../../fixtures'),
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*'
};

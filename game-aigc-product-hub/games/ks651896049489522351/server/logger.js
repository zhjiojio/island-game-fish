const util = require('util');
const pino = require('pino');
const config = require('./config/log-config');

const pinoLogger = pino({
  level: config.level,
  base: { service: config.service },
  timestamp: pino.stdTimeFunctions.isoTime,
});

function write (level, args) {
  const values = Array.from(args);
  const [first, ...rest] = values;
  if (first && typeof first === 'object' && !(first instanceof Error) && !Array.isArray(first)) {
    const message = rest.length > 0 ? util.format(...rest) : undefined;
    pinoLogger[level](first, message);
    return;
  }
  const error = values.find(value => value instanceof Error);
  const message = util.format(...values);
  if (error) pinoLogger[level]({ err: error }, message);
  else pinoLogger[level](message);
}

const logger = {
  trace: (...args) => write('trace', args),
  debug: (...args) => write('debug', args),
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
  log: (...args) => write('info', args),
  child: bindings => pinoLogger.child(bindings),
};

function installConsoleBridge () {
  console.log = (...args) => logger.info(...args);
  console.warn = (...args) => logger.warn(...args);
  console.error = (...args) => logger.error(...args);
  console.debug = (...args) => logger.debug(...args);
}

module.exports = { ...logger, installConsoleBridge };

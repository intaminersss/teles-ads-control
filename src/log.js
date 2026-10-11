'use strict';
/* log.js — pino structured logging (spec §8.5). Consistent ids, redaction, severity.
   pino redact drops exact paths; free-form secrets pass through safe() wrapper first. */
const pino = require('pino');
const { redact } = require('./config');

const base = {
  svc: 'teles-ads-control',
  ver: require('../package.json').version
};

const pinoSink = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['req.headers.authorization', '*.token', '*.BOT_TOKEN', 'ADS_API_TOKEN', 'SUPABASE_DB_URL'],
    censor: '[REDACTED]'
  },
  base
});

/* Wrap free-form messages through redact() so pasted secrets never hit logs. */
const log = {
  info: (msg, extra) => pinoSink.info(extra || {}, redact(msg)),
  warn: (msg, extra) => pinoSink.warn(extra || {}, redact(msg)),
  error: (msg, extra) => pinoSink.error(extra || {}, redact(msg)),
  debug: (msg, extra) => pinoSink.debug(extra || {}, redact(msg)),
  child: bindings => pinoSink.child(bindings)
};

module.exports = { log, pinoSink };

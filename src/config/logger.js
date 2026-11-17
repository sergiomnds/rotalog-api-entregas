const pino = require('pino');

function resolverNivel() {
    if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
    return process.env.NODE_ENV === 'test' ? 'silent' : 'info';
}

const logger = pino({
    level: resolverNivel(),
    redact: {
        paths: [
            'authorization',
            'body',
            'req.headers.authorization',
            'req.body',
            '*.authorization',
            '*.body'
        ],
        censor: '[REDACTED]'
    }
});

module.exports = logger;

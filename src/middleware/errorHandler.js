const logger = require('../config/logger');

function errorHandler(err, req, res, next) {
    const status = err.status || 500;

    logger.error({ err, method: req.method, url: req.url, status }, 'Erro ao processar requisição');

    if (res.headersSent) {
        return next(err);
    }

    const corpo = { error: err.expose ? err.message : 'Erro interno do servidor' };
    if (err.campos) corpo.campos = err.campos;

    return res.status(status).json(corpo);
}

function notFoundHandler(req, res) {
    res.status(404).json({
        error: 'Rota não encontrada',
        path: req.path,
        method: req.method
    });
}

module.exports = { errorHandler, notFoundHandler };

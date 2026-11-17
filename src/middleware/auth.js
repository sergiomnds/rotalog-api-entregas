const jwt = require('jsonwebtoken');
const { getJwtConfig } = require('../config/env');

const ALGORITMOS_PERMITIDOS = ['HS256'];
const BEARER_REGEX = /^Bearer (\S+)$/;

function negar(res, motivo) {
    // O motivo detalhado fica só no log; o cliente recebe uma resposta genérica.
    console.warn('[AUTH] Acesso negado: ' + motivo);
    return res.status(401).json({ error: 'Não autorizado' });
}

function authMiddleware(req, res, next) {
    let config;
    try {
        config = getJwtConfig();
    } catch (error) {
        console.error('[AUTH] ' + error.message);
        return res.status(500).json({ error: 'Erro interno' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return negar(res, 'token não fornecido');
    }

    const match = BEARER_REGEX.exec(authHeader);
    if (!match) {
        return negar(res, 'header Authorization mal formatado');
    }

    let payload;
    try {
        payload = jwt.verify(match[1], config.secret, {
            algorithms: ALGORITMOS_PERMITIDOS,
            issuer: config.issuer,
            audience: config.audience
        });
    } catch (error) {
        return negar(res, error.name + ': ' + error.message);
    }

    if (!payload.sub || typeof payload.role !== 'string' || !payload.role) {
        return negar(res, 'payload sem sub ou role');
    }

    req.user = { id: payload.sub, nome: payload.nome, role: payload.role };
    return next();
}

module.exports = authMiddleware;

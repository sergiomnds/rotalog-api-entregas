const { z } = require('zod');
const { ValidacaoError } = require('../errors/AppError');

z.config(z.locales.pt());

const PARTES = ['params', 'query', 'body'];

function formatarCampos(issues) {
    return issues.map((issue) => ({
        campo: issue.path.join('.') || '(raiz)',
        mensagem: issue.message
    }));
}

function validate(schemas) {
    return function (req, res, next) {
        const campos = [];
        const validados = {};

        for (const parte of PARTES) {
            if (!schemas[parte]) continue;
            const resultado = schemas[parte].safeParse(req[parte]);
            if (resultado.success) {
                validados[parte] = resultado.data;
            } else {
                campos.push(...formatarCampos(resultado.error.issues));
            }
        }

        if (campos.length > 0) {
            return next(new ValidacaoError(campos));
        }

        Object.assign(req, validados);
        return next();
    };
}

module.exports = validate;

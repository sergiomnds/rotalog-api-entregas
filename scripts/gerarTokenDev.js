require('dotenv').config();

if (process.env.NODE_ENV !== 'development') {
    console.error('Este script só roda com NODE_ENV=development.');
    process.exit(1);
}

const jwt = require('jsonwebtoken');
const { getJwtConfig } = require('../src/config/env');

const { secret, issuer, audience } = getJwtConfig();
const role = process.argv[2] || 'admin';

const token = jwt.sign({ nome: 'Usuário de desenvolvimento', role }, secret, {
    algorithm: 'HS256',
    issuer,
    audience,
    subject: 'dev-user',
    expiresIn: '8h'
});

console.log(token);

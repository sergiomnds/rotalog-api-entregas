const { getJwtConfig, MIN_SECRET_LENGTH } = require('../../src/config/env');

const valido = {
    JWT_SECRET: 'x'.repeat(MIN_SECRET_LENGTH),
    JWT_ISSUER: 'rotalog',
    JWT_AUDIENCE: 'rotalog-api-entregas'
};

describe('getJwtConfig', () => {
    it('retorna a configuração quando tudo é válido', () => {
        expect(getJwtConfig(valido)).toEqual({
            secret: valido.JWT_SECRET,
            issuer: 'rotalog',
            audience: 'rotalog-api-entregas'
        });
    });

    it('lê de process.env por padrão', () => {
        const original = { ...process.env };
        Object.assign(process.env, valido);
        try {
            expect(getJwtConfig().issuer).toBe('rotalog');
        } finally {
            process.env = original;
        }
    });

    it('exige JWT_SECRET, sem valor padrão', () => {
        expect(() => getJwtConfig({ ...valido, JWT_SECRET: undefined })).toThrow(/JWT_SECRET é obrigatório/);
    });

    it('rejeita segredo curto', () => {
        expect(() => getJwtConfig({ ...valido, JWT_SECRET: 'curto' })).toThrow(/pelo menos 32/);
    });

    it('rejeita o segredo que já esteve hardcoded', () => {
        expect(() =>
            getJwtConfig({ ...valido, JWT_SECRET: 'super-secret-key-that-should-not-be-hardcoded' })
        ).toThrow(/já foi exposto/);
    });

    it('exige JWT_ISSUER', () => {
        expect(() => getJwtConfig({ ...valido, JWT_ISSUER: undefined })).toThrow(/JWT_ISSUER/);
    });

    it('exige JWT_AUDIENCE', () => {
        expect(() => getJwtConfig({ ...valido, JWT_AUDIENCE: undefined })).toThrow(/JWT_AUDIENCE/);
    });

    it('lista todos os problemas de uma vez', () => {
        expect(() => getJwtConfig({})).toThrow(/JWT_SECRET.*JWT_ISSUER.*JWT_AUDIENCE/);
    });
});

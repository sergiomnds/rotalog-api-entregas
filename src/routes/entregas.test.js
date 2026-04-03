const request = require('supertest');
const express = require('express');

jest.mock('../models', () => ({
	Entrega: {
		findAll: jest.fn(),
		findByPk: jest.fn(),
		findOne: jest.fn(),
		create: jest.fn(),
	},
	Rastreamento: {
		create: jest.fn(),
	},
}));

jest.mock('../config/database', () => ({
	sequelize: {
		query: jest.fn(),
		constructor: { QueryTypes: { SELECT: 'SELECT' } },
	},
}));

const { Entrega, Rastreamento } = require('../models');
const { sequelize } = require('../config/database');
const entregasRouter = require('./entregas');

function buildApp() {
	const app = express();
	app.use(express.json());
	app.use((req, res, next) => {
		req.user = { id: 1, nome: 'Test', role: 'admin' };
		next();
	});
	app.use('/api/entregas', entregasRouter);
	return app;
}

const app = buildApp();

beforeEach(() => {
	jest.clearAllMocks();
});

describe('entregas routes', () => {
	describe('GET /api/entregas', () => {
		describe('when no filters are provided', () => {
			it('whenNoFilters_thenReturnsAllEntregas', async () => {
				// Arrange
				const fakeEntregas = [{ id: 1, numero_pedido: 'PED-001' }];
				Entrega.findAll.mockResolvedValue(fakeEntregas);

				// Act
				const res = await request(app).get('/api/entregas');

				// Assert
				expect(res.status).toBe(200);
				expect(res.body).toEqual(fakeEntregas);
				expect(Entrega.findAll).toHaveBeenCalledTimes(1);
			});
		});

		describe('when veiculo filter is provided', () => {
			it('whenVeiculoFilter_thenPassesVeiculoPlacaToWhere', async () => {
				// Arrange
				Entrega.findAll.mockResolvedValue([]);

				// Act
				await request(app).get('/api/entregas?veiculo=ABC1234');

				// Assert
				const callArgs = Entrega.findAll.mock.calls[0][0];
				expect(callArgs.where.veiculo_placa).toBe('ABC1234');
			});
		});

		describe('when status filter is provided', () => {
			it('whenStatusFilter_thenNormalizesToUpperCase', async () => {
				// Arrange
				Entrega.findAll.mockResolvedValue([]);

				// Act
				await request(app).get('/api/entregas?status=pendente');

				// Assert
				const callArgs = Entrega.findAll.mock.calls[0][0];
				expect(callArgs.where.status).toBe('PENDENTE');
			});
		});

		describe('when motorista_id filter is provided', () => {
			it('whenMotoristaFilter_thenPassesMotoristaIdToWhere', async () => {
				// Arrange
				Entrega.findAll.mockResolvedValue([]);

				// Act
				await request(app).get('/api/entregas?motorista_id=42');

				// Assert
				const callArgs = Entrega.findAll.mock.calls[0][0];
				expect(callArgs.where.motorista_id).toBe('42');
			});
		});

		describe('when database throws', () => {
			it('whenDatabaseError_thenReturns500', async () => {
				// Arrange
				Entrega.findAll.mockRejectedValue(new Error('DB error'));

				// Act
				const res = await request(app).get('/api/entregas');

				// Assert
				expect(res.status).toBe(500);
				expect(res.body).toEqual({ error: 'Erro interno do servidor' });
			});
		});
	});

	describe('GET /api/entregas/stats', () => {
		describe('when stats are returned successfully', () => {
			it('whenStatsQuery_thenReturnsTotalAndPorStatus', async () => {
				// Arrange
				const fakeStats = [
					{ status: 'PENDENTE', total: '3', distancia_media: '10.5', peso_medio: '5.0' },
					{ status: 'ENTREGUE', total: '7', distancia_media: '20.0', peso_medio: '8.0' },
				];
				sequelize.query.mockResolvedValue(fakeStats);

				// Act
				const res = await request(app).get('/api/entregas/stats');

				// Assert
				expect(res.status).toBe(200);
				expect(res.body.total).toBe(10);
				expect(res.body.por_status).toEqual(fakeStats);
				expect(res.body.gerado_em).toBeDefined();
			});
		});

		describe('when database throws', () => {
			it('whenStatsQueryError_thenReturns500', async () => {
				// Arrange
				sequelize.query.mockRejectedValue(new Error('DB error'));

				// Act
				const res = await request(app).get('/api/entregas/stats');

				// Assert
				expect(res.status).toBe(500);
				expect(res.body).toEqual({ error: 'Erro ao buscar estatísticas' });
			});
		});
	});

	describe('GET /api/entregas/:id', () => {
		describe('when entrega exists', () => {
			it('whenEntregaFound_thenReturns200WithEntrega', async () => {
				// Arrange
				const fakeEntrega = { id: 1, numero_pedido: 'PED-001' };
				Entrega.findByPk.mockResolvedValue(fakeEntrega);

				// Act
				const res = await request(app).get('/api/entregas/1');

				// Assert
				expect(res.status).toBe(200);
				expect(res.body).toEqual(fakeEntrega);
			});
		});

		describe('when entrega does not exist', () => {
			it('whenEntregaNotFound_thenReturns404', async () => {
				// Arrange
				Entrega.findByPk.mockResolvedValue(null);

				// Act
				const res = await request(app).get('/api/entregas/999');

				// Assert
				expect(res.status).toBe(404);
				expect(res.body).toEqual({ error: 'Entrega não encontrada' });
			});
		});

		describe('when database throws', () => {
			it('whenDatabaseError_thenReturns500', async () => {
				// Arrange
				Entrega.findByPk.mockRejectedValue(new Error('DB error'));

				// Act
				const res = await request(app).get('/api/entregas/1');

				// Assert
				expect(res.status).toBe(500);
				expect(res.body).toEqual({ error: 'Erro interno do servidor' });
			});
		});
	});

	describe('GET /api/entregas/pedido/:numeroPedido', () => {
		describe('when pedido exists', () => {
			it('whenPedidoFound_thenReturns200WithEntrega', async () => {
				// Arrange
				const fakeEntrega = { id: 1, numero_pedido: 'PED-123' };
				Entrega.findOne.mockResolvedValue(fakeEntrega);

				// Act
				const res = await request(app).get('/api/entregas/pedido/PED-123');

				// Assert
				expect(res.status).toBe(200);
				expect(res.body).toEqual(fakeEntrega);
			});
		});

		describe('when pedido does not exist', () => {
			it('whenPedidoNotFound_thenReturns404', async () => {
				// Arrange
				Entrega.findOne.mockResolvedValue(null);

				// Act
				const res = await request(app).get('/api/entregas/pedido/INEXISTENTE');

				// Assert
				expect(res.status).toBe(404);
				expect(res.body).toEqual({ error: 'Pedido não encontrado' });
			});
		});

		describe('when database throws', () => {
			it('whenDatabaseError_thenReturns500', async () => {
				// Arrange
				Entrega.findOne.mockRejectedValue(new Error('DB error'));

				// Act
				const res = await request(app).get('/api/entregas/pedido/PED-123');

				// Assert
				expect(res.status).toBe(500);
				expect(res.body).toEqual({ error: 'Erro interno do servidor' });
			});
		});
	});

	describe('POST /api/entregas', () => {
		const validBody = {
			origem_endereco: 'Rua A, 100',
			destino_endereco: 'Rua B, 200',
			peso_kg: 5,
		};

		describe('when required fields are missing', () => {
			it('whenOrigemMissing_thenReturns400', async () => {
				// Act
				const res = await request(app)
					.post('/api/entregas')
					.send({ destino_endereco: 'Rua B' });

				// Assert
				expect(res.status).toBe(400);
				expect(res.body).toEqual({ error: 'Endereços de origem e destino são obrigatórios' });
			});

			it('whenDestinoMissing_thenReturns400', async () => {
				// Act
				const res = await request(app)
					.post('/api/entregas')
					.send({ origem_endereco: 'Rua A' });

				// Assert
				expect(res.status).toBe(400);
				expect(res.body).toEqual({ error: 'Endereços de origem e destino são obrigatórios' });
			});
		});

		describe('when valid body without coordinates', () => {
			it('whenValidBodyNoCoords_thenCreatesEntregaAndReturns201', async () => {
				// Arrange
				const fakeEntrega = { id: 1, numero_pedido: 'PED-123', status: 'PENDENTE' };
				Entrega.create.mockResolvedValue(fakeEntrega);
				Rastreamento.create.mockResolvedValue({});

				// Act
				const res = await request(app)
					.post('/api/entregas')
					.send(validBody);

				// Assert
				expect(res.status).toBe(201);
				expect(res.body).toEqual(fakeEntrega);
				expect(Entrega.create).toHaveBeenCalledTimes(1);
				expect(Rastreamento.create).toHaveBeenCalledTimes(1);

				const createArgs = Entrega.create.mock.calls[0][0];
				expect(createArgs.status).toBe('PENDENTE');
				expect(createArgs.numero_pedido).toMatch(/^PED-/);
				expect(createArgs.distancia_km).toBeNull();
				expect(createArgs.tempo_estimado_minutos).toBeNull();
			});
		});

		describe('when valid body with coordinates', () => {
			it('whenValidBodyWithCoords_thenCalculatesDistanciaKm', async () => {
				// Arrange
				const fakeEntrega = { id: 2, numero_pedido: 'PED-456', status: 'PENDENTE' };
				Entrega.create.mockResolvedValue(fakeEntrega);
				Rastreamento.create.mockResolvedValue({});

				// Act
				const res = await request(app)
					.post('/api/entregas')
					.send({
						...validBody,
						origem_lat: -23.5505,
						origem_lng: -46.6333,
						destino_lat: -23.5615,
						destino_lng: -46.6559,
					});

				// Assert
				expect(res.status).toBe(201);
				const createArgs = Entrega.create.mock.calls[0][0];
				expect(createArgs.distancia_km).not.toBeNull();
				expect(createArgs.tempo_estimado_minutos).not.toBeNull();
			});
		});

		describe('when database throws', () => {
			it('whenCreateFails_thenReturns500WithDetalhes', async () => {
				// Arrange
				Entrega.create.mockRejectedValue(new Error('unique constraint'));

				// Act
				const res = await request(app)
					.post('/api/entregas')
					.send(validBody);

				// Assert
				expect(res.status).toBe(500);
				expect(res.body.error).toBe('Erro ao criar entrega');
				expect(res.body.detalhes).toBe('unique constraint');
			});
		});
	});

	describe('PUT /api/entregas/:id', () => {
		describe('when entrega exists and body has fields to update', () => {
			it('whenValidUpdate_thenSavesAndReturns200', async () => {
				// Arrange
				const fakeEntrega = {
					id: 1,
					origem_endereco: 'Rua A',
					destino_endereco: 'Rua B',
					peso_kg: 5,
					observacoes: null,
					data_atualizacao: null,
					save: jest.fn().mockResolvedValue(true),
				};
				Entrega.findByPk.mockResolvedValue(fakeEntrega);

				// Act
				const res = await request(app)
					.put('/api/entregas/1')
					.send({ origem_endereco: 'Rua C, 999', peso_kg: 10 });

				// Assert
				expect(res.status).toBe(200);
				expect(fakeEntrega.save).toHaveBeenCalledTimes(1);
				expect(fakeEntrega.origem_endereco).toBe('Rua C, 999');
				expect(fakeEntrega.peso_kg).toBe(10);
			});

			it('whenObservacoesProvided_thenUpdatesObservacoes', async () => {
				// Arrange
				const fakeEntrega = {
					id: 1,
					origem_endereco: 'Rua A',
					destino_endereco: 'Rua B',
					peso_kg: 5,
					observacoes: null,
					data_atualizacao: null,
					save: jest.fn().mockResolvedValue(true),
				};
				Entrega.findByPk.mockResolvedValue(fakeEntrega);

				// Act
				const res = await request(app)
					.put('/api/entregas/1')
					.send({ observacoes: 'Fragil' });

				// Assert
				expect(res.status).toBe(200);
				expect(fakeEntrega.observacoes).toBe('Fragil');
			});
		});

		describe('when entrega does not exist', () => {
			it('whenEntregaNotFound_thenReturns404', async () => {
				// Arrange
				Entrega.findByPk.mockResolvedValue(null);

				// Act
				const res = await request(app)
					.put('/api/entregas/999')
					.send({ origem_endereco: 'Rua C' });

				// Assert
				expect(res.status).toBe(404);
				expect(res.body).toEqual({ error: 'Entrega não encontrada' });
			});
		});

		describe('when database throws', () => {
			it('whenDatabaseError_thenReturns500', async () => {
				// Arrange
				Entrega.findByPk.mockRejectedValue(new Error('DB error'));

				// Act
				const res = await request(app)
					.put('/api/entregas/1')
					.send({ origem_endereco: 'Rua C' });

				// Assert
				expect(res.status).toBe(500);
				expect(res.body).toEqual({ error: 'Erro ao atualizar entrega' });
			});
		});
	});

	describe('PATCH /api/entregas/:id/status', () => {
		describe('when status transition is valid', () => {
			it('whenStatusEmTransito_thenSetsDataColetaAndReturns200', async () => {
				// Arrange
				const fakeEntrega = {
					id: 1,
					numero_pedido: 'PED-001',
					status: 'PENDENTE',
					data_atualizacao: null,
					data_coleta: null,
					data_entrega: null,
					save: jest.fn().mockResolvedValue(true),
				};
				Entrega.findByPk.mockResolvedValue(fakeEntrega);
				Rastreamento.create.mockResolvedValue({});

				// Act
				const res = await request(app)
					.patch('/api/entregas/1/status')
					.send({ status: 'EM_TRANSITO' });

				// Assert
				expect(res.status).toBe(200);
				expect(fakeEntrega.status).toBe('EM_TRANSITO');
				expect(fakeEntrega.data_coleta).not.toBeNull();
				expect(Rastreamento.create).toHaveBeenCalledTimes(1);
			});

			it('whenStatusEntregue_thenSetsDataEntregaAndReturns200', async () => {
				// Arrange
				const fakeEntrega = {
					id: 1,
					numero_pedido: 'PED-001',
					status: 'EM_TRANSITO',
					data_atualizacao: null,
					data_coleta: null,
					data_entrega: null,
					save: jest.fn().mockResolvedValue(true),
				};
				Entrega.findByPk.mockResolvedValue(fakeEntrega);
				Rastreamento.create.mockResolvedValue({});

				// Act
				const res = await request(app)
					.patch('/api/entregas/1/status')
					.send({ status: 'ENTREGUE' });

				// Assert
				expect(res.status).toBe(200);
				expect(fakeEntrega.data_entrega).not.toBeNull();
			});

			it('whenStatusPendente_thenNoDateFieldsAreSet', async () => {
				// Arrange
				const fakeEntrega = {
					id: 1,
					numero_pedido: 'PED-001',
					status: 'ATRIBUIDA',
					data_atualizacao: null,
					data_coleta: null,
					data_entrega: null,
					save: jest.fn().mockResolvedValue(true),
				};
				Entrega.findByPk.mockResolvedValue(fakeEntrega);
				Rastreamento.create.mockResolvedValue({});

				// Act
				const res = await request(app)
					.patch('/api/entregas/1/status')
					.send({ status: 'PENDENTE' });

				// Assert
				expect(res.status).toBe(200);
				expect(fakeEntrega.data_coleta).toBeNull();
				expect(fakeEntrega.data_entrega).toBeNull();
			});
		});

		describe('when status is invalid', () => {
			it('whenInvalidStatus_thenReturns400WithStatusValidos', async () => {
				// Arrange
				const fakeEntrega = { id: 1, status: 'PENDENTE' };
				Entrega.findByPk.mockResolvedValue(fakeEntrega);

				// Act
				const res = await request(app)
					.patch('/api/entregas/1/status')
					.send({ status: 'INVALIDO' });

				// Assert
				expect(res.status).toBe(400);
				expect(res.body.error).toBe('Status inválido');
				expect(res.body.statusValidos).toBeDefined();
			});
		});

		describe('when entrega does not exist', () => {
			it('whenEntregaNotFound_thenReturns404', async () => {
				// Arrange
				Entrega.findByPk.mockResolvedValue(null);

				// Act
				const res = await request(app)
					.patch('/api/entregas/999/status')
					.send({ status: 'ENTREGUE' });

				// Assert
				expect(res.status).toBe(404);
				expect(res.body).toEqual({ error: 'Entrega não encontrada' });
			});
		});

		describe('when database throws', () => {
			it('whenDatabaseError_thenReturns500', async () => {
				// Arrange
				Entrega.findByPk.mockRejectedValue(new Error('DB error'));

				// Act
				const res = await request(app)
					.patch('/api/entregas/1/status')
					.send({ status: 'ENTREGUE' });

				// Assert
				expect(res.status).toBe(500);
				expect(res.body).toEqual({ error: 'Erro ao atualizar status' });
			});
		});
	});

	describe('PATCH /api/entregas/:id/atribuir', () => {
		describe('when valid assignment data is provided', () => {
			it('whenValidAtribuir_thenAssignsAndReturns200', async () => {
				// Arrange
				const fakeEntrega = {
					id: 1,
					numero_pedido: 'PED-001',
					status: 'PENDENTE',
					veiculo_placa: null,
					motorista_id: null,
					motorista_nome: null,
					veiculo_modelo: null,
					data_atualizacao: null,
					save: jest.fn().mockResolvedValue(true),
				};
				Entrega.findByPk.mockResolvedValue(fakeEntrega);
				Rastreamento.create.mockResolvedValue({});

				// Act
				const res = await request(app)
					.patch('/api/entregas/1/atribuir')
					.send({ veiculo_placa: 'ABC1234', motorista_id: 10, motorista_nome: 'Carlos', veiculo_modelo: 'VW Gol' });

				// Assert
				expect(res.status).toBe(200);
				expect(fakeEntrega.veiculo_placa).toBe('ABC1234');
				expect(fakeEntrega.motorista_id).toBe(10);
				expect(fakeEntrega.motorista_nome).toBe('Carlos');
				expect(fakeEntrega.veiculo_modelo).toBe('VW Gol');
				expect(fakeEntrega.status).toBe('ATRIBUIDA');
				expect(Rastreamento.create).toHaveBeenCalledTimes(1);
			});

			it('whenAtribuirWithoutOptionalFields_thenSetsNullForOptionals', async () => {
				// Arrange
				const fakeEntrega = {
					id: 1,
					numero_pedido: 'PED-001',
					status: 'PENDENTE',
					veiculo_placa: null,
					motorista_id: null,
					motorista_nome: 'old',
					veiculo_modelo: 'old',
					data_atualizacao: null,
					save: jest.fn().mockResolvedValue(true),
				};
				Entrega.findByPk.mockResolvedValue(fakeEntrega);
				Rastreamento.create.mockResolvedValue({});

				// Act
				const res = await request(app)
					.patch('/api/entregas/1/atribuir')
					.send({ veiculo_placa: 'XYZ9999', motorista_id: 5 });

				// Assert
				expect(res.status).toBe(200);
				expect(fakeEntrega.motorista_nome).toBeNull();
				expect(fakeEntrega.veiculo_modelo).toBeNull();
			});
		});

		describe('when required fields are missing', () => {
			it('whenVeiculoPlacarMissing_thenReturns400', async () => {
				// Arrange
				const fakeEntrega = { id: 1 };
				Entrega.findByPk.mockResolvedValue(fakeEntrega);

				// Act
				const res = await request(app)
					.patch('/api/entregas/1/atribuir')
					.send({ motorista_id: 10 });

				// Assert
				expect(res.status).toBe(400);
				expect(res.body).toEqual({ error: 'Placa do veículo e ID do motorista são obrigatórios' });
			});

			it('whenMotoristaIdMissing_thenReturns400', async () => {
				// Arrange
				const fakeEntrega = { id: 1 };
				Entrega.findByPk.mockResolvedValue(fakeEntrega);

				// Act
				const res = await request(app)
					.patch('/api/entregas/1/atribuir')
					.send({ veiculo_placa: 'ABC1234' });

				// Assert
				expect(res.status).toBe(400);
				expect(res.body).toEqual({ error: 'Placa do veículo e ID do motorista são obrigatórios' });
			});
		});

		describe('when entrega does not exist', () => {
			it('whenEntregaNotFound_thenReturns404', async () => {
				// Arrange
				Entrega.findByPk.mockResolvedValue(null);

				// Act
				const res = await request(app)
					.patch('/api/entregas/999/atribuir')
					.send({ veiculo_placa: 'ABC1234', motorista_id: 10 });

				// Assert
				expect(res.status).toBe(404);
				expect(res.body).toEqual({ error: 'Entrega não encontrada' });
			});
		});

		describe('when database throws', () => {
			it('whenDatabaseError_thenReturns500', async () => {
				// Arrange
				Entrega.findByPk.mockRejectedValue(new Error('DB error'));

				// Act
				const res = await request(app)
					.patch('/api/entregas/1/atribuir')
					.send({ veiculo_placa: 'ABC1234', motorista_id: 10 });

				// Assert
				expect(res.status).toBe(500);
				expect(res.body).toEqual({ error: 'Erro ao atribuir entrega' });
			});
		});
	});

	describe('DELETE /api/entregas/:id', () => {
		describe('when entrega exists', () => {
			it('whenEntregaFound_thenCancelsAndReturns200', async () => {
				// Arrange
				const fakeEntrega = {
					id: 1,
					numero_pedido: 'PED-001',
					status: 'PENDENTE',
					data_atualizacao: null,
					save: jest.fn().mockResolvedValue(true),
				};
				Entrega.findByPk.mockResolvedValue(fakeEntrega);
				Rastreamento.create.mockResolvedValue({});

				// Act
				const res = await request(app).delete('/api/entregas/1');

				// Assert
				expect(res.status).toBe(200);
				expect(res.body.message).toBe('Entrega cancelada');
				expect(fakeEntrega.status).toBe('CANCELADA');
				expect(Rastreamento.create).toHaveBeenCalledTimes(1);
				const rastrArgs = Rastreamento.create.mock.calls[0][0];
				expect(rastrArgs.evento).toBe('ENTREGA_CANCELADA');
			});
		});

		describe('when entrega does not exist', () => {
			it('whenEntregaNotFound_thenReturns404', async () => {
				// Arrange
				Entrega.findByPk.mockResolvedValue(null);

				// Act
				const res = await request(app).delete('/api/entregas/999');

				// Assert
				expect(res.status).toBe(404);
				expect(res.body).toEqual({ error: 'Entrega não encontrada' });
			});
		});

		describe('when database throws', () => {
			it('whenDatabaseError_thenReturns500', async () => {
				// Arrange
				Entrega.findByPk.mockRejectedValue(new Error('DB error'));

				// Act
				const res = await request(app).delete('/api/entregas/1');

				// Assert
				expect(res.status).toBe(500);
				expect(res.body).toEqual({ error: 'Erro ao cancelar entrega' });
			});
		});
	});
});

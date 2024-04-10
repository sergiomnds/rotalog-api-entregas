# RotaLog - API Entregas

Microsserviço de gerenciamento de entregas do sistema RotaLog.

## Tech Stack

- **Node.js** com **Express 4.x**
- **Sequelize 6** com **PostgreSQL**
- **dotenv** para variáveis de ambiente
- **http nativo** para comunicação entre serviços (sem axios)

## Pré-requisitos

- Node.js 16+
- PostgreSQL rodando (via docker-compose do rotalog-workspace)
- api-frotas rodando em `http://localhost:8080/api` (opcional, para integração)
- api-notificacoes rodando em `http://localhost:5000` (opcional, para notificações)

## Como rodar

```bash
# Subir o banco de dados
cd ../rotalog-workspace && docker-compose up -d postgres

# Instalar dependências
npm install

# Executar migrations
npm run db:migrate

# Executar seed data (opcional)
npm run db:seed

# Rodar a aplicação
npm start

# Ou em modo desenvolvimento (com nodemon)
npm run dev
```

A API estará disponível em `http://localhost:3000/api`

## Endpoints

### Health Check

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/health` | Status do serviço |

### Entregas (`/api/entregas`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/entregas` | Listar entregas (filtros: `veiculo`, `status`, `motorista_id`) |
| GET | `/api/entregas/stats` | Estatísticas de entregas |
| GET | `/api/entregas/:id` | Buscar entrega por ID (com rastreamentos) |
| GET | `/api/entregas/pedido/:numero` | Buscar por número do pedido |
| POST | `/api/entregas` | Criar nova entrega |
| PUT | `/api/entregas/:id` | Atualizar dados da entrega |
| PATCH | `/api/entregas/:id/status` | Atualizar status |
| PATCH | `/api/entregas/:id/atribuir` | Atribuir veículo e motorista |
| DELETE | `/api/entregas/:id` | Cancelar entrega (soft delete) |

### Rastreamento (`/api/rastreamento`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/rastreamento/:entregaId` | Listar eventos de rastreamento |
| GET | `/api/rastreamento/:entregaId/ultimo` | Último evento |
| GET | `/api/rastreamento/pedido/:numeroPedido` | Rastreamento público por pedido |
| POST | `/api/rastreamento/:entregaId` | Registrar evento (posição GPS, etc) |

### Integração com API Frotas (`/api/frotas`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/frotas/veiculos/disponiveis` | Listar veículos ativos (proxy api-frotas) |
| GET | `/api/frotas/veiculos/:placa` | Buscar veículo por placa |
| GET | `/api/frotas/veiculos/:placa/disponibilidade` | Verificar disponibilidade |
| GET | `/api/frotas/motoristas/:id` | Buscar motorista por ID |

## Exemplos de Request

### Criar entrega

```bash
curl -X POST http://localhost:3000/api/entregas \
  -H "Content-Type: application/json" \
  -d '{
    "origem_endereco": "Rua Augusta, 1500 - São Paulo, SP",
    "destino_endereco": "Av. Paulista, 2000 - São Paulo, SP",
    "origem_lat": -23.5558,
    "origem_lng": -46.6622,
    "destino_lat": -23.5631,
    "destino_lng": -46.6565,
    "peso_kg": 25.5,
    "observacoes": "Entrega urgente"
  }'
```

### Atribuir veículo e motorista

```bash
curl -X PATCH http://localhost:3000/api/entregas/1/atribuir \
  -H "Content-Type: application/json" \
  -d '{
    "veiculo_placa": "ABC1D23",
    "motorista_id": 1
  }'
```

### Atualizar status

```bash
curl -X PATCH http://localhost:3000/api/entregas/1/status \
  -H "Content-Type: application/json" \
  -d '{"status": "EM_TRANSITO"}'
```

### Registrar posição GPS

```bash
curl -X POST http://localhost:3000/api/rastreamento/1 \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": -23.5700,
    "longitude": -46.6750,
    "evento": "POSICAO_ATUALIZADA",
    "descricao": "Em trânsito - Av. Faria Lima"
  }'
```

## Fluxo de uma Entrega

```
PENDENTE → ATRIBUIDA → EM_TRANSITO → ENTREGUE
    ↓          ↓           ↓
 CANCELADA  CANCELADA   CANCELADA
```

1. **PENDENTE**: Entrega criada, aguardando atribuição
2. **ATRIBUIDA**: Veículo e motorista atribuídos
3. **EM_TRANSITO**: Coleta realizada, em rota de entrega
4. **ENTREGUE**: Entrega concluída com sucesso
5. **CANCELADA**: Entrega cancelada (soft delete)

## Comunicação entre serviços

| Destino | URL | Tipo | Uso |
|---------|-----|------|-----|
| api-frotas | `http://localhost:8080/api` | HTTP GET | Consultar veículos e motoristas |
| api-notificacoes | `http://localhost:5000` | HTTP POST | Notificar criação, status, conclusão |

## Testes via HTTP

O arquivo `requests.http` contém todos os requests prontos para testar com o REST Client do VS Code. Inclui:
- CRUD completo de entregas
- Rastreamento de eventos
- Integração com api-frotas
- Fluxo completo de entrega passo a passo

## Dívida Técnica Conhecida

- [ ] Mix de callbacks e async/await (60% callbacks)
- [ ] URLs de serviços hardcoded
- [ ] Credenciais no .env commitado no repositório
- [ ] JWT secret hardcoded e validação fake
- [ ] Auth bypass em desenvolvimento
- [ ] CORS permite todas as origens
- [ ] Rastreamento público sem autenticação
- [ ] Sem rate limiting
- [ ] Sem circuit breaker para chamadas HTTP
- [ ] http nativo em vez de axios ou similar
- [ ] Número de pedido gerado com Math.random
- [ ] Cálculo de distância com fórmula simplificada
- [ ] Raw SQL queries misturadas com Sequelize
- [ ] Error handler expondo stack trace
- [ ] Status como String em vez de Enum
- [ ] Sem testes unitários ou de integração
- [ ] Sem paginação nos endpoints de listagem
- [ ] Sem cache
- [ ] Sem graceful shutdown
- [ ] Sem métricas ou logging estruturado

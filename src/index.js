/**
 * RotaLog - API Entregas
 * Delivery management microservice
 * 
 * Legacy codebase with intentional technical debt for Alura course
 * Express 4.x with 60% callbacks, hardcoded credentials, raw SQL queries
 */

const express = require('express');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// TODO: Add proper error handling middleware
// TODO: Add request logging middleware
// TODO: Add authentication middleware
// TODO: Add CORS middleware
// TODO: Add rate limiting middleware

/**
 * Legacy authentication middleware copied from StackOverflow (2020)
 * FIXME: Hardcoded JWT secret
 * FIXME: No token validation
 * FIXME: No expiration handling
 * TODO: Implement proper JWT validation
 * TODO: Add refresh token mechanism
 * TODO: Add role-based access control
 */
function authMiddleware(req, res, next) {
    // TODO: Extract token from header
    // TODO: Validate token
    // TODO: Check expiration
    // TODO: Attach user to request

    // FIXME: Hardcoded secret
    const jwtSecret = 'super-secret-key-that-should-not-be-hardcoded';

    // FIXME: No proper validation
    console.log('Auth middleware executed'); // TODO: Use logger

    next();
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Create delivery order - Legacy callback-based implementation
 * FIXME: 60% callbacks - no async/await
 * FIXME: No error handling
 * FIXME: Mixed concerns
 */
app.post('/deliveries', authMiddleware, (req, res) => {
    const { origin, destination, weight } = req.body;

    // FIXME: Validation mixed with business logic
    if (!origin || !destination) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // FIXME: Callback hell
    validateAddress(origin, (err, validOrigin) => {
        if (err) {
            // TODO: Proper error handling
            return res.status(500).json({ error: 'Validation failed' });
        }

        validateAddress(destination, (err, validDestination) => {
            if (err) {
                // TODO: Proper error handling
                return res.status(500).json({ error: 'Validation failed' });
            }

            // FIXME: Raw SQL query
            const query = `
                INSERT INTO entregas (origem, destino, peso, status, data_criacao)
                VALUES ('${origin}', '${destination}', ${weight}, 'PENDENTE', NOW())
                RETURNING *;
            `;

            // FIXME: No prepared statements - SQL injection vulnerability
            executeQuery(query, (err, result) => {
                if (err) {
                    // TODO: Proper error handling
                    return res.status(500).json({ error: 'Database error' });
                }

                // FIXME: Hardcoded notification URL
                notifyDeliveryCreated(result.id, 'http://localhost:5000/notify', (err) => {
                    if (err) {
                        console.log('Notification failed'); // TODO: Use logger
                        // FIXME: No retry logic
                    }

                    res.status(201).json(result);
                });
            });
        });
    });
});

/**
 * Get delivery status
 * FIXME: Sequelize with raw queries misturadas
 * FIXME: env vars hardcoded
 * FIXME: No caching
 */
app.get('/deliveries/:id', (req, res) => {
    const { id } = req.params;

    // FIXME: Hardcoded database credentials
    const dbConfig = {
        host: 'localhost',
        port: 5432,
        database: 'rotalog',
        user: 'rotalog_admin',
        password: 'rotalog123',
        schema: 'entregas'
    };

    // FIXME: Raw SQL query
    const query = `SELECT * FROM entregas WHERE id = ${id}`;

    executeQuery(query, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!result) {
            return res.status(404).json({ error: 'Delivery not found' });
        }

        res.json(result);
    });
});

/**
 * Update delivery status
 * FIXME: No validation
 * FIXME: No authorization
 * FIXME: No audit trail
 */
app.patch('/deliveries/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    // FIXME: No status validation
    // FIXME: No state machine validation

    // FIXME: Raw SQL query with no prepared statements
    const query = `
        UPDATE entregas 
        SET status = '${status}', data_atualizacao = NOW()
        WHERE id = ${id}
        RETURNING *;
    `;

    executeQuery(query, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        res.json(result);
    });
});

/**
 * TODO: Implement tracking endpoint
 * TODO: Implement route optimization
 * TODO: Implement delivery assignment
 * TODO: Implement real-time updates
 * TODO: Implement webhook notifications
 */

// Helper functions with callback hell
function validateAddress(address, callback) {
    // TODO: Implement proper validation
    // TODO: Add geocoding
    // TODO: Add distance calculation
    // TODO: Add delivery zone validation

    setTimeout(() => {
        callback(null, { valid: true, address });
    }, 100);
}

function executeQuery(query, callback) {
    // TODO: Implement proper database connection
    // TODO: Add connection pooling
    // TODO: Add query logging
    // TODO: Add performance monitoring

    console.log('Executing query:', query); // TODO: Use logger - FIXME: SQL injection risk!

    setTimeout(() => {
        callback(null, { id: 1, status: 'created' });
    }, 100);
}

function notifyDeliveryCreated(deliveryId, notificationUrl, callback) {
    // TODO: Implement proper HTTP client
    // TODO: Add retry logic
    // TODO: Add timeout handling
    // TODO: Add circuit breaker

    console.log('Notifying:', notificationUrl); // TODO: Use logger

    // FIXME: Hardcoded URL
    // FIXME: No error handling
    // FIXME: No retry logic

    setTimeout(() => {
        callback(null);
    }, 100);
}

// TODO: Add proper error handling middleware
// TODO: Add 404 handler
// TODO: Add 500 handler

// Start server
app.listen(PORT, () => {
    console.log(`API Entregas running on port ${PORT}`); // TODO: Use logger
    console.log('TODO: Add health checks');
    console.log('TODO: Add graceful shutdown');
    console.log('TODO: Add metrics collection');
});

// TODO: Add process error handlers
// TODO: Add unhandled rejection handlers
// TODO: Add graceful shutdown logic

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { TradingSimulator } from './TradingSimulator.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            "script-src-attr": ["'unsafe-inline'"]
        }
    }
}));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Store simulator instances per session (in production, use Redis or similar)
const simulators = new Map();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize simulator
app.post('/api/simulator/init', (req, res) => {
    try {
        const sessionId = req.body.sessionId || Date.now().toString();
        const simulator = new TradingSimulator(req.body.options || {});
        simulators.set(sessionId, simulator);
        
        res.json({ success: true, sessionId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Load data
app.post('/api/data/load', async (req, res) => {
    try {
        const { sessionId, symbol, startDate, endDate, useCache = true } = req.body;
        const simulator = simulators.get(sessionId);
        
        if (!simulator) {
            return res.status(400).json({ error: 'Simulator not initialized' });
        }

        const { data, fromCache } = await simulator.loadData(symbol, startDate, endDate, useCache);
        res.json({
            success: true,
            data: { symbol: data.symbol, recordCount: data.dates.length },
            fromCache: fromCache
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Calculate indicator
app.post('/api/indicator/calculate', (req, res) => {
    try {
        const { sessionId, params } = req.body;
        const simulator = simulators.get(sessionId);
        
        if (!simulator) {
            return res.status(400).json({ error: 'Simulator not initialized' });
        }

        const indicators = simulator.calculateIndicator(params);
        res.json({ success: true, indicators });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generate signals
app.post('/api/signals/generate', (req, res) => {
    try {
        const { sessionId, params } = req.body;
        const simulator = simulators.get(sessionId);
        
        if (!simulator) {
            return res.status(400).json({ error: 'Simulator not initialized' });
        }

        const signals = simulator.generateSignals(params);
        res.json({ success: true, signalCount: signals.filter(s => s !== 0).length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Run backtest
app.post('/api/backtest/run', (req, res) => {
    try {
        const { sessionId, params } = req.body;
        const simulator = simulators.get(sessionId);
        
        if (!simulator) {
            return res.status(400).json({ error: 'Simulator not initialized' });
        }

        const results = simulator.runBacktest(params);
        res.json({ success: true, results: results.metrics });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get basic results (for chart display after loading data)
app.get('/api/results/basic/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const simulator = simulators.get(sessionId);

        if (!simulator) {
            return res.status(400).json({ error: 'Simulator not initialized' });
        }

        const results = simulator.getBasicResults();
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get comprehensive results
app.get('/api/results/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const simulator = simulators.get(sessionId);

        if (!simulator) {
            return res.status(400).json({ error: 'Simulator not initialized' });
        }

        const results = simulator.getResults();
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export to CSV
app.post('/api/export/csv', async (req, res) => {
    try {
        const { sessionId, filename } = req.body;
        const simulator = simulators.get(sessionId);
        
        if (!simulator) {
            return res.status(400).json({ error: 'Simulator not initialized' });
        }

        const filepath = await simulator.exportToCSV(filename || `export_${Date.now()}.csv`);
        res.json({ success: true, filepath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save results
app.post('/api/results/save', async (req, res) => {
    try {
        const { sessionId, strategyName } = req.body;
        const simulator = simulators.get(sessionId);
        
        if (!simulator) {
            return res.status(400).json({ error: 'Simulator not initialized' });
        }

        await simulator.saveResults(strategyName);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Clear cache
app.post('/api/cache/clear', async (req, res) => {
    try {
        // Close all simulators first
        for (const [sessionId, simulator] of simulators.entries()) {
            try {
                await simulator.close();
            } catch (error) {
                console.warn(`Error closing simulator ${sessionId}:`, error);
            }
        }
        simulators.clear();

        // Clear database files
        const { DatabaseService } = await import('./services/DatabaseService.js');
        const tempDb = new DatabaseService();
        await tempDb.clearAllData();
        await tempDb.close();

        res.json({ success: true, message: 'Cache cleared successfully' });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clean up simulator session
app.delete('/api/simulator/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const simulator = simulators.get(sessionId);

        if (simulator) {
            await simulator.close();
            simulators.delete(sessionId);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`MTR Trading Simulator server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to access the web interface`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    
    // Close all simulator instances
    for (const [sessionId, simulator] of simulators) {
        try {
            await simulator.close();
        } catch (error) {
            console.error(`Error closing simulator ${sessionId}:`, error);
        }
    }
    
    process.exit(0);
});
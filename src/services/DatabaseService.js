import sqlite3 from 'sqlite3';
import { promisify } from 'util';

/**
 * Database service for storing stock data and trades
 */
export class DatabaseService {
    constructor(dbPath = 'trading_simulator.db') {
        this.db = new sqlite3.Database(dbPath);
        
        // Promisify database methods
        this.run = promisify(this.db.run.bind(this.db));
        this.get = promisify(this.db.get.bind(this.db));
        this.all = promisify(this.db.all.bind(this.db));
        
        this.initializeTables();
    }

    async initializeTables() {
        try {
            // Create stock_data table
            await this.run(`
                CREATE TABLE IF NOT EXISTS stock_data (
                    id INTEGER PRIMARY KEY,
                    symbol TEXT,
                    date TEXT,
                    open REAL,
                    high REAL,
                    low REAL,
                    close REAL,
                    volume INTEGER,
                    UNIQUE(symbol, date)
                )
            `);

            // Create trades table
            await this.run(`
                CREATE TABLE IF NOT EXISTS trades (
                    id INTEGER PRIMARY KEY,
                    symbol TEXT,
                    date TEXT,
                    type TEXT,
                    price REAL,
                    shares INTEGER,
                    commission REAL,
                    pnl REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create backtest_results table
            await this.run(`
                CREATE TABLE IF NOT EXISTS backtest_results (
                    id INTEGER PRIMARY KEY,
                    symbol TEXT,
                    strategy_name TEXT,
                    start_date TEXT,
                    end_date TEXT,
                    initial_capital REAL,
                    final_equity REAL,
                    total_return REAL,
                    total_trades INTEGER,
                    winning_trades INTEGER,
                    win_rate REAL,
                    parameters TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('Database tables initialized successfully');
        } catch (error) {
            console.error('Error initializing database tables:', error);
            throw error;
        }
    }

    /**
     * Save stock data to database
     */
    async saveStockData(symbol, data) {
        const { dates, open, high, low, close, volume } = data;
        
        try {
            const stmt = await this.db.prepare(`
                INSERT OR REPLACE INTO stock_data 
                (symbol, date, open, high, low, close, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            for (let i = 0; i < dates.length; i++) {
                await new Promise((resolve, reject) => {
                    stmt.run([symbol, dates[i], open[i], high[i], low[i], close[i], volume[i]], 
                        (err) => err ? reject(err) : resolve());
                });
            }

            stmt.finalize();
            console.log(`Saved ${dates.length} records for ${symbol}`);
        } catch (error) {
            console.error('Error saving stock data:', error);
            throw error;
        }
    }

    /**
     * Get stock data from database
     */
    async getStockData(symbol, startDate = null, endDate = null) {
        try {
            let query = 'SELECT * FROM stock_data WHERE symbol = ?';
            const params = [symbol];

            if (startDate) {
                query += ' AND date >= ?';
                params.push(startDate);
            }

            if (endDate) {
                query += ' AND date <= ?';
                params.push(endDate);
            }

            query += ' ORDER BY date ASC';

            const rows = await this.all(query, params);
            
            if (rows.length === 0) {
                return null;
            }

            // Convert to our data format
            const dates = rows.map(row => row.date);
            const open = rows.map(row => row.open);
            const high = rows.map(row => row.high);
            const low = rows.map(row => row.low);
            const close = rows.map(row => row.close);
            const volume = rows.map(row => row.volume);

            return { symbol, dates, open, high, low, close, volume };
        } catch (error) {
            console.error('Error getting stock data:', error);
            throw error;
        }
    }

    /**
     * Save trades to database
     */
    async saveTrades(symbol, trades) {
        try {
            const stmt = await this.db.prepare(`
                INSERT INTO trades 
                (symbol, date, type, price, shares, commission, pnl)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            for (const trade of trades) {
                await new Promise((resolve, reject) => {
                    stmt.run([symbol, trade.date, trade.type, trade.price, 
                             trade.shares, trade.commission, trade.pnl], 
                        (err) => err ? reject(err) : resolve());
                });
            }

            stmt.finalize();
            console.log(`Saved ${trades.length} trades for ${symbol}`);
        } catch (error) {
            console.error('Error saving trades:', error);
            throw error;
        }
    }

    /**
     * Save backtest results
     */
    async saveBacktestResults(symbol, strategyName, results, parameters) {
        try {
            await this.run(`
                INSERT INTO backtest_results 
                (symbol, strategy_name, start_date, end_date, initial_capital, 
                 final_equity, total_return, total_trades, winning_trades, win_rate, parameters)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                symbol,
                strategyName,
                parameters.startDate || null,
                parameters.endDate || null,
                results.initialCapital,
                results.finalEquity,
                results.totalReturn,
                results.totalTrades,
                results.winningTrades,
                results.winRate,
                JSON.stringify(parameters)
            ]);

            console.log('Backtest results saved successfully');
        } catch (error) {
            console.error('Error saving backtest results:', error);
            throw error;
        }
    }


    /**
     * Close database connection
     */
    close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                }
                resolve();
            });
        });
    }
}
import { MTRIndicator } from './indicators/MTRIndicator.js';
import { TradingStrategy } from './strategies/TradingStrategy.js';
import { BacktestEngine } from './engine/BacktestEngine.js';
import { DataService } from './services/DataService.js';
import { DatabaseService } from './services/DatabaseService.js';
import { GoogleSheetsService } from './services/GoogleSheetsService.js';
import createCsvWriter from 'csv-writer';

/**
 * Main Trading Simulator class that orchestrates all components
 */
export class TradingSimulator {
    constructor(options = {}) {
        this.dataService = new DataService(options.apiKey);
        this.database = new DatabaseService(options.dbPath);
        
        // Initialize with default parameters
        this.mtrIndicator = new MTRIndicator(options.mtrParams || {});
        this.strategy = new TradingStrategy(options.strategyParams || {});
        this.backtestEngine = new BacktestEngine(options.backtestParams || {});
        
        // Data storage
        this.marketData = null;
        this.indicators = null;
        this.signals = null;
        this.backtestResults = null;
    }

    /**
     * Load market data for a symbol
     */
    async loadData(symbol, startDate, endDate, useCache = true) {
        try {
            console.log(`Loading data for ${symbol} from ${startDate} to ${endDate}`);
            
            // Try to get cached data first
            if (useCache) {
                const cachedData = await this.database.getStockData(symbol, startDate, endDate);
                if (cachedData && cachedData.dates.length > 0) {
                    // Check if cached data covers the full date range requested
                    const firstDate = new Date(cachedData.dates[0]);
                    const lastDate = new Date(cachedData.dates[cachedData.dates.length - 1]);
                    const requestStart = new Date(startDate);
                    const requestEnd = new Date(endDate);

                    // Use cached data if it covers the requested range (with some tolerance for non-trading days)
                    console.log(`Cache check: first=${firstDate.toISOString().split('T')[0]}, last=${lastDate.toISOString().split('T')[0]}, requested=${requestStart.toISOString().split('T')[0]} to ${requestEnd.toISOString().split('T')[0]}`);

                    // Allow some tolerance: cached data is good if it starts within a few days of request and covers the end
                    const startDiffDays = (firstDate - requestStart) / (1000 * 60 * 60 * 24);
                    const endDiffDays = (requestEnd - lastDate) / (1000 * 60 * 60 * 24);

                    if (startDiffDays <= 3 && endDiffDays <= 1) {
                        console.log(`Using cached data: ${cachedData.dates.length} records`);
                        this.marketData = cachedData;
                        return { data: this.marketData, fromCache: true };
                    } else {
                        console.log(`Cached data incomplete for range ${startDate} to ${endDate}, fetching fresh data`);
                    }
                }
            }

            // Fetch fresh data
            try {
                this.marketData = await this.dataService.fetchStockData(symbol, startDate, endDate);
            } catch (apiError) {
                console.warn('API fetch failed, using mock data:', apiError.message);
                this.marketData = this.dataService.generateMockData(symbol, startDate, endDate);
            }

            // Cache the data
            await this.database.saveStockData(symbol, this.marketData);

            console.log(`Loaded ${this.marketData.dates.length} records for ${symbol}`);
            return { data: this.marketData, fromCache: false };

        } catch (error) {
            console.error('Error loading data:', error);
            throw error;
        }
    }

    /**
     * Calculate MTR indicator
     */
    calculateIndicator(params = null) {
        if (!this.marketData) {
            throw new Error('No market data loaded. Call loadData() first.');
        }

        if (params) {
            this.mtrIndicator = new MTRIndicator(params);
        }

        console.log('Calculating MTR indicator...');
        this.indicators = this.mtrIndicator.calculate(this.marketData);
        
        return this.indicators;
    }

    /**
     * Generate trading signals
     */
    async generateSignals(params = null) {
        if (!this.indicators) {
            throw new Error('No indicators calculated. Call calculateIndicator() first.');
        }

        if (params) {
            this.strategy = new TradingStrategy(params);
        }

        console.log('Generating trading signals...');
        this.signals = this.strategy.generateSignals({
            close: this.marketData.close,
            mtrUpper: this.indicators.mtrUpper,
            mtrLower: this.indicators.mtrLower
        });

        // Save MTR data and signals to database (temporarily disabled)
        // await this.saveMTRData();

        return this.signals;
    }

    /**
     * Save MTR indicators and signals to database
     */
    async saveMTRData() {
        if (!this.marketData || !this.indicators || !this.signals) {
            return;
        }

        try {
            await this.database.updateMTRData(this.marketData.symbol, {
                dates: this.marketData.dates,
                mtrBase: this.indicators.mtrBase,
                mtrUpper: this.indicators.mtrUpper,
                mtrLower: this.indicators.mtrLower,
                signals: this.signals
            });
        } catch (error) {
            console.error('Error saving MTR data:', error);
        }
    }

    /**
     * Run backtest
     */
    runBacktest(params = null) {
        if (!this.signals) {
            throw new Error('No signals generated. Call generateSignals() first.');
        }

        if (params) {
            this.backtestEngine = new BacktestEngine(params);
        }

        console.log('Running backtest...');
        const backtestData = {
            dates: this.marketData.dates,
            close: this.marketData.close,
            signals: this.signals
        };

        const { trades, equityCurve } = this.backtestEngine.backtest(backtestData, this.strategy);
        const metrics = this.backtestEngine.calculateMetrics(trades, equityCurve);

        this.backtestResults = {
            trades,
            equityCurve,
            metrics
        };

        return this.backtestResults;
    }

    /**
     * Calculate Buy & Hold comparison
     */
    calculateBuyHoldComparison() {
        if (!this.marketData || !this.backtestResults) {
            return null;
        }

        const firstPrice = this.marketData.close[0];
        const lastPrice = this.marketData.close[this.marketData.close.length - 1];
        const initialCapital = this.backtestResults.metrics.initialCapital;
        
        const sharesBuyHold = Math.floor(initialCapital / firstPrice);
        const commissionBuyHold = Math.max(sharesBuyHold * 0.01, 7.0);
        const remainingCash = initialCapital - (sharesBuyHold * firstPrice + commissionBuyHold);
        const finalBuyHoldEquity = sharesBuyHold * lastPrice + remainingCash;
        const buyHoldReturn = ((finalBuyHoldEquity - initialCapital) / initialCapital) * 100;

        return {
            finalEquity: finalBuyHoldEquity,
            totalReturn: buyHoldReturn,
            commission: commissionBuyHold,
            outperformance: this.backtestResults.metrics.totalReturn - buyHoldReturn
        };
    }

    /**
     * Get basic chart data (for display after loading data and calculating indicators)
     */
    getBasicResults() {
        if (!this.marketData) {
            throw new Error('No market data available. Load data first.');
        }

        return {
            marketData: this.marketData,
            indicators: this.indicators || null,
            signals: this.signals || null
        };
    }

    /**
     * Get comprehensive results
     */
    getResults() {
        if (!this.backtestResults) {
            throw new Error('No backtest results available. Run backtest first.');
        }

        const buyHoldComparison = this.calculateBuyHoldComparison();

        return {
            strategy: this.backtestResults.metrics,
            buyHold: buyHoldComparison,
            trades: this.backtestResults.trades,
            equityCurve: this.backtestResults.equityCurve,
            marketData: this.marketData,
            indicators: this.indicators,
            signals: this.signals
        };
    }

    /**
     * Export results to CSV
     */
    async exportToCSV(filename) {
        if (!this.backtestResults || !this.marketData) {
            throw new Error('No data available for export. Run simulation first.');
        }

        try {
            const fs = await import('fs');
            const path = await import('path');

            // Ensure out directory exists
            const outDir = 'out';
            await fs.promises.mkdir(outDir, { recursive: true });

            // Create full path with out directory
            const fullPath = path.join(outDir, filename);
            // Prepare data for export
            const exportData = [];
            
            for (let i = 0; i < this.marketData.dates.length; i++) {
                const signal = this.signals[i] || 0;
                const price = this.marketData.close[i];
                
                // Determine MTR place
                let mtrPlace = '';
                if (this.indicators && !isNaN(this.indicators.mtrUpper[i])) {
                    if (price >= this.indicators.mtrUpper[i]) {
                        mtrPlace = 'upper+';
                    } else if (price >= this.indicators.mtrBase[i]) {
                        mtrPlace = 'upper-mid';
                    } else if (price >= this.indicators.mtrLower[i]) {
                        mtrPlace = 'mid-low';
                    } else {
                        mtrPlace = 'low-';
                    }
                }

                exportData.push({
                    Date: this.marketData.dates[i],
                    Close_Price: price.toFixed(2),
                    Should_Buy: signal === 1,
                    Should_Sell: signal === -1,
                    Signal_Raw: signal,
                    MTR_Place: mtrPlace,
                    MTR_Base: this.indicators ? (this.indicators.mtrBase[i] || '').toString() : '',
                    MTR_Upper: this.indicators ? (this.indicators.mtrUpper[i] || '').toString() : '',
                    MTR_Lower: this.indicators ? (this.indicators.mtrLower[i] || '').toString() : '',
                    Equity_Worth: this.backtestResults.equityCurve[i] ? this.backtestResults.equityCurve[i].toFixed(2) : ''
                });
            }

            // Create CSV writer
            const csvWriter = createCsvWriter.createObjectCsvWriter({
                path: fullPath,
                header: [
                    { id: 'Date', title: 'Date' },
                    { id: 'Close_Price', title: 'Close_Price' },
                    { id: 'Should_Buy', title: 'Should_Buy' },
                    { id: 'Should_Sell', title: 'Should_Sell' },
                    { id: 'Signal_Raw', title: 'Signal_Raw' },
                    { id: 'MTR_Place', title: 'MTR_Place' },
                    { id: 'MTR_Base', title: 'MTR_Base' },
                    { id: 'MTR_Upper', title: 'MTR_Upper' },
                    { id: 'MTR_Lower', title: 'MTR_Lower' },
                    { id: 'Equity_Worth', title: 'Equity_Worth' }
                ]
            });

            await csvWriter.writeRecords(exportData);
            console.log(`Data exported to ${fullPath}`);
            return fullPath;

        } catch (error) {
            console.error('Error exporting CSV:', error);
            throw error;
        }
    }

    /**
     * Export backtest results to Google Sheets with formulas for debugging
     */
    async exportToGoogleSheets(sheetTitle = 'MTR Trading Analysis') {
        if (!this.backtestResults || !this.marketData || !this.signals) {
            throw new Error('No results to export. Run simulation first.');
        }

        try {
            console.log('Starting Google Sheets export...');

            const sheetsService = new GoogleSheetsService();
            await sheetsService.initialize();

            // Create the spreadsheet
            const spreadsheet = await sheetsService.createTradingSpreadsheet(
                sheetTitle,
                this.marketData.symbol
            );

            console.log(`Created spreadsheet: ${spreadsheet.spreadsheetUrl}`);

            // Setup structure
            await sheetsService.setupSpreadsheetStructure(spreadsheet.spreadsheetId);

            // Prepare export data with more detailed information
            const exportData = [];
            for (let i = 0; i < this.marketData.dates.length; i++) {
                const price = this.marketData.close[i];
                const signal = this.signals[i];
                let mtrPlace = '';

                if (this.indicators && this.indicators.mtrUpper[i] && this.indicators.mtrLower[i]) {
                    if (price > this.indicators.mtrUpper[i]) {
                        mtrPlace = 'high+';
                    } else if (price < this.indicators.mtrLower[i]) {
                        mtrPlace = 'low-';
                    } else {
                        mtrPlace = 'inside';
                    }
                }

                exportData.push({
                    Date: this.marketData.dates[i],
                    Close_Price: price.toFixed(4),
                    Volume: this.marketData.volume ? this.marketData.volume[i] : '',
                    High: this.marketData.high ? this.marketData.high[i].toFixed(4) : '',
                    Low: this.marketData.low ? this.marketData.low[i].toFixed(4) : '',
                    Open: this.marketData.open ? this.marketData.open[i].toFixed(4) : '',
                    Should_Buy: signal === 1,
                    Should_Sell: signal === -1,
                    Signal_Raw: signal,
                    MTR_Place: mtrPlace
                });
            }

            // Add trading data
            await sheetsService.addTradingData(spreadsheet.spreadsheetId, exportData);

            // Add code-calculated equity values for comparison
            await sheetsService.addCodeEquityValues(spreadsheet.spreadsheetId, this.backtestResults.equityCurve);

            // Add summary with comparison between formula and code calculations
            await sheetsService.addSummarySheet(
                spreadsheet.spreadsheetId,
                this.backtestResults,
                exportData.length
            );

            console.log(`Google Sheets export completed: ${spreadsheet.spreadsheetUrl}`);
            return {
                success: true,
                spreadsheetId: spreadsheet.spreadsheetId,
                spreadsheetUrl: spreadsheet.spreadsheetUrl,
                message: 'Data exported to Google Sheets with debugging formulas'
            };

        } catch (error) {
            console.error('Error exporting to Google Sheets:', error);

            // Fallback: still create a local analysis file
            const fs = await import('fs');
            const path = await import('path');

            // Ensure out directory exists
            const outDir = 'out';
            await fs.promises.mkdir(outDir, { recursive: true });

            const fallbackFile = path.join(outDir, `sheets_fallback_${Date.now()}.json`);
            const fallbackData = {
                error: error.message,
                timestamp: new Date().toISOString(),
                note: 'Google Sheets API not available. Set up credentials.json for full functionality.',
                dataPreview: {
                    recordCount: this.marketData.dates.length,
                    symbol: this.marketData.symbol,
                    dateRange: {
                        start: this.marketData.dates[0],
                        end: this.marketData.dates[this.marketData.dates.length - 1]
                    },
                    performance: this.backtestResults.strategy
                }
            };

            await fs.promises.writeFile(fallbackFile, JSON.stringify(fallbackData, null, 2));

            return {
                success: false,
                error: error.message,
                fallbackFile,
                message: 'Google Sheets export failed. Created fallback file with analysis data.'
            };
        }
    }

    /**
     * Save backtest results to database
     */
    async saveResults(strategyName = 'MTR Strategy') {
        if (!this.backtestResults || !this.marketData) {
            throw new Error('No results to save. Run simulation first.');
        }

        try {
            // Save trades
            await this.database.saveTrades(this.marketData.symbol, this.backtestResults.trades);
            
            // Save backtest summary
            await this.database.saveBacktestResults(
                this.marketData.symbol,
                strategyName,
                this.backtestResults.metrics,
                {
                    startDate: this.marketData.dates[0],
                    endDate: this.marketData.dates[this.marketData.dates.length - 1],
                    mtrParams: {
                        serenityWindow: this.mtrIndicator.serenityWindow,
                        atrWindow: this.mtrIndicator.atrWindow,
                        bandMult: this.mtrIndicator.bandMult
                    },
                    strategyParams: {
                        stopLossPct: this.strategy.stopLossPct,
                        minDaysBetweenTrades: this.strategy.minDaysBetweenTrades
                    }
                }
            );

            console.log('Results saved to database');
        } catch (error) {
            console.error('Error saving results:', error);
            throw error;
        }
    }

    /**
     * Close database connection
     */
    async close() {
        await this.database.close();
    }
}
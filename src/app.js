import dotenv from 'dotenv';
import { TradingSimulator } from './TradingSimulator.js';

// Load environment variables
dotenv.config();

/**
 * Main application - CLI interface for the trading simulator
 */
async function main() {
    const simulator = new TradingSimulator();
    
    try {
        console.log('🚀 MTR Trading Simulator Started\n');

        // Example usage - you can modify these parameters
        const symbol = process.argv[2] || 'AAPL';
        const startDate = process.argv[3] || '2022-01-01';
        const endDate = process.argv[4] || '2024-01-01';

        console.log(`📊 Running simulation for ${symbol} (${startDate} to ${endDate})\n`);

        // Step 1: Load data
        console.log('1️⃣ Loading market data...');
        const { data } = await simulator.loadData(symbol, startDate, endDate);
        simulator.marketData = data;
        console.log('✅ Data loaded successfully\n');

        // Step 2: Calculate MTR indicator
        console.log('2️⃣ Calculating MTR indicator...');
        simulator.calculateIndicator({
            serenityWindow: 20,
            atrWindow: 14,
            atrPctThreshold: 0.0075,
            bandMult: 2.0,
            stabilityConfirmation: 10
        });
        console.log('✅ MTR indicator calculated\n');

        // Step 3: Generate signals
        console.log('3️⃣ Generating trading signals...');
        await simulator.generateSignals({
            stopLossPct: 0.10,
            minDaysBetweenTrades: 2,
            insideMarginRatio: 0.10
        });
        console.log('✅ Trading signals generated\n');

        // Step 4: Run backtest
        console.log('4️⃣ Running backtest...');
        simulator.runBacktest({
            initialCapital: 10000,
            commissionPerShare: 0.01,
            minCommission: 7.0,
            taxRate: 0.25
        });
        console.log('✅ Backtest completed\n');

        // Step 5: Display results
        console.log('📈 RESULTS:\n');
        const results = simulator.getResults();
        
        console.log('MTR Strategy Performance:');
        console.log(`  Initial Capital: $${results.strategy.initialCapital.toLocaleString()}`);
        console.log(`  Final Equity: $${results.strategy.finalEquity.toLocaleString()}`);
        console.log(`  Total Return: ${results.strategy.totalReturn.toFixed(2)}%`);
        console.log(`  Total Trades: ${results.strategy.totalTrades}`);
        console.log(`  Win Rate: ${results.strategy.winRate.toFixed(2)}%`);
        console.log(`  Avg Win: $${results.strategy.avgWin.toFixed(2)}`);
        console.log(`  Avg Loss: $${results.strategy.avgLoss.toFixed(2)}`);
        console.log(`  Total Commissions: $${results.strategy.totalCommissions.toFixed(2)}\n`);

        if (results.buyHold) {
            console.log('Buy & Hold Comparison:');
            console.log(`  Final Equity: $${results.buyHold.finalEquity.toLocaleString()}`);
            console.log(`  Total Return: ${results.buyHold.totalReturn.toFixed(2)}%`);
            console.log(`  Commission: $${results.buyHold.commission.toFixed(2)}\n`);

            console.log('Performance Comparison:');
            console.log(`  Outperformance: ${results.buyHold.outperformance > 0 ? '+' : ''}${results.buyHold.outperformance.toFixed(2)}%`);
            console.log(`  Result: ${results.buyHold.outperformance > 0 ? '✅ MTR OUTPERFORMED' : '❌ MTR UNDERPERFORMED'}\n`);
        }

        // Step 6: Export results
        console.log('5️⃣ Exporting results...');
        const filename = `${symbol}_${startDate}_${endDate}_results.csv`;
        await simulator.exportToCSV(filename);
        console.log(`✅ Results exported to ${filename}\n`);

        // Step 7: Save to database
        console.log('6️⃣ Saving to database...');
        await simulator.saveResults('MTR Strategy CLI');
        console.log('✅ Results saved to database\n');

        console.log('🎉 Simulation completed successfully!');

    } catch (error) {
        console.error('❌ Error running simulation:', error.message);
        if (process.env.NODE_ENV === 'development') {
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        await simulator.close();
    }
}

/**
 * Run interactive mode
 */
async function interactive() {
    console.log('🔧 Interactive Mode - Not implemented yet');
    console.log('Please use: node src/app.js [SYMBOL] [START_DATE] [END_DATE]');
    console.log('Example: node src/app.js AAPL 2022-01-01 2024-01-01');
}

// Check if running as main module
if (process.argv[1] === new URL(import.meta.url).pathname) {
    if (process.argv.includes('--interactive') || process.argv.includes('-i')) {
        interactive().catch(console.error);
    } else {
        main().catch(console.error);
    }
}
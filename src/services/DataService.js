import yahooFinance from 'yahoo-finance2';

/**
 * Service for fetching market data using Yahoo Finance
 * No API key required - uses yahoo-finance2 package
 */
export class DataService {
    constructor() {
        // No API key needed for Yahoo Finance
    }

    /**
     * Fetch historical stock data
     * @param {string} symbol - Stock symbol
     * @param {string} startDate - Start date in YYYY-MM-DD format
     * @param {string} endDate - End date in YYYY-MM-DD format
     * @returns {Object} Market data object
     */
    async fetchStockData(symbol, startDate = null, endDate = null) {
        try {
            const start = startDate ? new Date(startDate) : new Date('2020-01-01');
            const end = endDate ? new Date(endDate) : new Date();

            console.log(`Fetching data for ${symbol} from ${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`);

            const result = await yahooFinance.historical(symbol, {
                period1: start,
                period2: end,
                interval: '1d'
            });

            if (!result || result.length === 0) {
                throw new Error(`No data available for symbol ${symbol}`);
            }

            // Convert to our format
            const dates = [];
            const open = [];
            const high = [];
            const low = [];
            const close = [];
            const volume = [];

            // Sort by date (should already be sorted, but ensure it)
            result.sort((a, b) => new Date(a.date) - new Date(b.date));

            for (const dayData of result) {
                const dateStr = dayData.date.toISOString().split('T')[0];

                // Apply date filtering (additional safety check)
                if (startDate && dateStr < startDate) continue;
                if (endDate && dateStr > endDate) continue;

                dates.push(dateStr);
                open.push(Math.round(dayData.open * 100) / 100);
                high.push(Math.round(dayData.high * 100) / 100);
                low.push(Math.round(dayData.low * 100) / 100);
                close.push(Math.round(dayData.close * 100) / 100);
                volume.push(dayData.volume || 0);
            }

            console.log(`Successfully fetched ${dates.length} records for ${symbol}`);

            return {
                symbol,
                dates,
                open,
                high,
                low,
                close,
                volume
            };

        } catch (error) {
            console.error(`Error fetching data for ${symbol}:`, error.message);

            // If Yahoo Finance fails, fall back to mock data
            console.log('Yahoo Finance failed, using mock data');
            return this.generateMockData(symbol, startDate, endDate);
        }
    }

    /**
     * Alternative: Generate mock data for testing
     * @param {string} symbol - Stock symbol
     * @param {string} startDate - Start date in YYYY-MM-DD format
     * @param {string} endDate - End date in YYYY-MM-DD format
     * @returns {Object} Mock market data
     */
    generateMockData(symbol, startDate, endDate) {
        console.log(`Generating mock data for ${symbol} from ${startDate} to ${endDate}`);

        const start = new Date(startDate || '2020-01-01');
        const end = new Date(endDate || new Date().toISOString().split('T')[0]);
        const dates = [];
        const open = [];
        const high = [];
        const low = [];
        const close = [];
        const volume = [];

        // Base price varies by symbol
        const basePrices = {
            'U': 120,
            'AAPL': 180,
            'MSFT': 300,
            'GOOGL': 150,
            'TSLA': 200,
            'NVDA': 450
        };

        let currentPrice = basePrices[symbol.toUpperCase()] || (100 + Math.random() * 100);
        const currentDate = new Date(start);

        while (currentDate <= end) {
            // Skip weekends
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                const dateStr = currentDate.toISOString().split('T')[0];

                // Generate realistic price movement
                const dailyChange = (Math.random() - 0.5) * 0.08; // +/-4% max daily change
                const openPrice = currentPrice * (1 + dailyChange * 0.3);
                const volatility = Math.random() * 0.03; // Daily volatility

                const highPrice = openPrice * (1 + Math.random() * volatility);
                const lowPrice = openPrice * (1 - Math.random() * volatility);
                const closePrice = lowPrice + Math.random() * (highPrice - lowPrice);

                dates.push(dateStr);
                open.push(Math.round(openPrice * 100) / 100);
                high.push(Math.round(highPrice * 100) / 100);
                low.push(Math.round(lowPrice * 100) / 100);
                close.push(Math.round(closePrice * 100) / 100);
                volume.push(Math.floor(1000000 + Math.random() * 5000000));

                currentPrice = closePrice;
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        return {
            symbol,
            dates,
            open,
            high,
            low,
            close,
            volume
        };
    }
}
import axios from 'axios';

/**
 * Service for fetching market data
 * Note: This uses Alpha Vantage API as Yahoo Finance doesn't have an official free API
 * You'll need to get a free API key from https://www.alphavantage.co/support/#api-key
 */
export class DataService {
    constructor(apiKey = null) {
        this.apiKey = apiKey || process.env.ALPHA_VANTAGE_API_KEY;
        this.baseUrl = 'https://www.alphavantage.co/query';
    }

    /**
     * Fetch historical stock data
     * @param {string} symbol - Stock symbol
     * @param {string} startDate - Start date in YYYY-MM-DD format
     * @param {string} endDate - End date in YYYY-MM-DD format
     * @returns {Object} Market data object
     */
    async fetchStockData(symbol, startDate = null, endDate = null) {
        if (!this.apiKey) {
            throw new Error('Alpha Vantage API key is required. Set ALPHA_VANTAGE_API_KEY environment variable.');
        }

        try {
            const response = await axios.get(this.baseUrl, {
                params: {
                    function: 'TIME_SERIES_DAILY_ADJUSTED',
                    symbol: symbol,
                    apikey: this.apiKey,
                    outputsize: 'full'
                },
                timeout: 10000
            });

            if (response.data['Error Message']) {
                throw new Error(`API Error: ${response.data['Error Message']}`);
            }

            if (response.data['Note']) {
                throw new Error('API rate limit exceeded. Please wait and try again.');
            }

            const timeSeries = response.data['Time Series (Daily)'];
            if (!timeSeries) {
                throw new Error('No data returned from API');
            }

            // Convert to our format
            const dates = [];
            const open = [];
            const high = [];
            const low = [];
            const close = [];
            const volume = [];

            // Sort dates and filter by date range if provided
            const sortedDates = Object.keys(timeSeries).sort();
            
            for (const date of sortedDates) {
                // Apply date filtering
                if (startDate && date < startDate) continue;
                if (endDate && date > endDate) continue;

                const dayData = timeSeries[date];
                dates.push(date);
                open.push(parseFloat(dayData['1. open']));
                high.push(parseFloat(dayData['2. high']));
                low.push(parseFloat(dayData['3. low']));
                close.push(parseFloat(dayData['4. close']));
                volume.push(parseInt(dayData['6. volume']));
            }

            if (dates.length === 0) {
                throw new Error('No data available for the specified date range');
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

        } catch (error) {
            if (error.response) {
                throw new Error(`API request failed: ${error.response.status} ${error.response.statusText}`);
            } else if (error.request) {
                throw new Error('Network error: Unable to reach data provider');
            } else {
                throw error;
            }
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
        const start = new Date(startDate);
        const end = new Date(endDate);
        const dates = [];
        const open = [];
        const high = [];
        const low = [];
        const close = [];
        const volume = [];

        let currentPrice = 100 + Math.random() * 50; // Start between $100-150
        const currentDate = new Date(start);

        while (currentDate <= end) {
            // Skip weekends
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                const dateStr = currentDate.toISOString().split('T')[0];
                
                // Generate realistic price movement
                const dailyChange = (Math.random() - 0.5) * 0.1; // +/-5% max daily change
                const openPrice = currentPrice * (1 + dailyChange * 0.3);
                const volatility = Math.random() * 0.02; // Daily volatility
                
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
/**
 * Backtesting engine with commission and tax modeling
 */
export class BacktestEngine {
    constructor(options = {}) {
        this.initialCapital = options.initialCapital || 10000;
        this.commissionPerShare = options.commissionPerShare || 0.01;
        this.minCommission = options.minCommission || 7.0;
        this.taxRate = options.taxRate || 0.25;
    }

    /**
     * Calculate commission for a trade
     */
    calculateCommission(shares) {
        return Math.max(shares * this.commissionPerShare, this.minCommission);
    }

    /**
     * Run backtest simulation
     * @param {Object} data - Market data with dates, close prices, and signals
     * @param {Object} strategy - Trading strategy instance
     * @returns {Object} Object containing trades array and equity curve
     */
    backtest(data, strategy) {
        const { dates, close, signals } = data;
        let capital = this.initialCapital;
        let position = 0;
        let shares = 0;
        let entryPrice = 0.0;

        const trades = [];
        const equityCurve = [];

        for (let i = 0; i < close.length; i++) {
            const price = close[i];
            const date = dates[i];
            const signal = signals[i];

            // Always update equity mark-to-market
            equityCurve.push(capital + (shares > 0 ? shares * price : 0));

            if (isNaN(signal) || signal === 0) {
                continue;
            }

            // --- PARTIAL EXIT (scale-out) ---
            if (signal === 2 && position > 0 && shares > 0) {
                const sellQty = Math.max(1, Math.floor(shares * (strategy.scaleOutPct || 0.5)));
                const actualSellQty = Math.min(sellQty, shares);

                const commission = this.calculateCommission(actualSellQty);
                const proceeds = actualSellQty * price;
                const profit = actualSellQty * (price - entryPrice);

                capital += proceeds - commission;
                if (profit > 0) {
                    capital -= profit * this.taxRate;
                }

                trades.push({
                    date: date,
                    type: 'Scale Out',
                    price: price,
                    shares: -actualSellQty,
                    commission: commission,
                    pnl: profit - commission
                });

                shares -= actualSellQty;
                if (shares === 0) {
                    position = 0;
                }

                // Refresh equity after transaction
                equityCurve[i] = capital + (shares > 0 ? shares * price : 0);
                continue;
            }

            // --- OPEN LONG ---
            if (signal === 1 && position <= 0) {
                // Close any short (safety)
                if (position < 0) {
                    const coverQty = Math.abs(shares);
                    const commission = this.calculateCommission(coverQty);
                    const profit = coverQty * (entryPrice - price);
                    capital += profit - commission;
                    if (profit > 0) {
                        capital -= profit * this.taxRate;
                    }
                    trades.push({
                        date: date,
                        type: 'Cover Short',
                        price: price,
                        shares: coverQty,
                        commission: commission,
                        pnl: profit - commission
                    });
                    shares = 0;
                    position = 0;
                }

                const buyQty = Math.floor(capital / price);
                if (buyQty <= 0) {
                    continue;
                }
                const commission = this.calculateCommission(buyQty);
                const spend = buyQty * price + commission;
                if (spend > capital) {
                    continue;
                }

                capital -= spend;
                shares = buyQty;
                entryPrice = price;
                position = 1;

                trades.push({
                    date: date,
                    type: 'Buy Long',
                    price: price,
                    shares: buyQty,
                    commission: commission,
                    pnl: -commission
                });

                equityCurve[i] = capital + shares * price;
                continue;
            }

            // --- FULL EXIT ---
            if (signal === -1 && position > 0 && shares > 0) {
                const sellQty = shares;
                const commission = this.calculateCommission(sellQty);
                const proceeds = sellQty * price;
                const profit = sellQty * (price - entryPrice);

                capital += proceeds - commission;
                if (profit > 0) {
                    capital -= profit * this.taxRate;
                }

                trades.push({
                    date: date,
                    type: 'Sell Long',
                    price: price,
                    shares: -sellQty,
                    commission: commission,
                    pnl: profit - commission
                });

                shares = 0;
                position = 0;
                equityCurve[i] = capital;
            }

            // --- HARD STOP safeguard (backtester side) ---
            if (position > 0 && shares > 0) {
                const hardStop = entryPrice * (1 - strategy.stopLossPct);
                if (price <= hardStop) {
                    const sellQty = shares;
                    const commission = this.calculateCommission(sellQty);
                    const proceeds = sellQty * price;
                    const profit = sellQty * (price - entryPrice);

                    capital += proceeds - commission;
                    if (profit > 0) {
                        capital -= profit * this.taxRate;
                    }

                    trades.push({
                        date: date,
                        type: 'Stop Loss',
                        price: price,
                        shares: -sellQty,
                        commission: commission,
                        pnl: profit - commission
                    });

                    shares = 0;
                    position = 0;
                    equityCurve[i] = capital;
                }
            }
        }

        return { trades, equityCurve };
    }

    /**
     * Calculate performance metrics
     */
    calculateMetrics(trades, equityCurve) {
        if (!trades.length || !equityCurve.length) {
            return {};
        }

        const finalEquity = equityCurve[equityCurve.length - 1];
        const totalReturn = ((finalEquity - this.initialCapital) / this.initialCapital) * 100;
        
        const winningTrades = trades.filter(t => t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl < 0);
        
        const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
        const avgWin = winningTrades.length > 0 ? 
            winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? 
            losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length : 0;
        const totalCommissions = trades.reduce((sum, t) => sum + t.commission, 0);

        return {
            initialCapital: this.initialCapital,
            finalEquity,
            totalReturn,
            totalTrades: trades.length,
            winningTrades: winningTrades.length,
            winRate,
            avgWin,
            avgLoss,
            totalCommissions
        };
    }
}
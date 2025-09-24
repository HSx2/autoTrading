/**
 * MTR Strategy – Basic, Band-Aware, All-In
 * Rules:
 *   1) If Close > Upper: BUY and hold until re-enter <= Upper.
 *   2) If Close < Lower: SELL/exit and stay flat until re-enter >= Lower.
 *   3) Between bands: mean-revert using margins (buy near Lower, sell near Upper).
 *   4) On band changes: re-evaluate immediately and align with the new regime.
 * Emits: 1 = buy, -1 = sell, 0 = hold
 */
export class TradingStrategy {
    constructor(options = {}) {
        this.stopLossPct = options.stopLossPct || 0.10;
        this.minDaysBetweenTrades = options.minDaysBetweenTrades || 2;
        this.insideMarginRatio = options.insideMarginRatio || 0.10;
        this.bandChangeEps = options.bandChangeEps || 1e-6;
        this.reassessOnBandChange = options.reassessOnBandChange !== false;
        
        // Runtime state
        this.reset();
    }

    reset() {
        this.inPos = false;
        this.lastTradeIndex = -10000;
        this.prevUpper = null;
        this.prevLower = null;
    }

    _levels(upper, lower) {
        const width = Math.max(1e-9, upper - lower);
        const buyLvl = lower + this.insideMarginRatio * width;
        const sellLvl = upper - this.insideMarginRatio * width;
        return { buyLvl, sellLvl };
    }

    _bandChanged(upper, lower) {
        if (this.prevUpper === null || this.prevLower === null) {
            return false;
        }
        return (Math.abs(upper - this.prevUpper) > this.bandChangeEps ||
                Math.abs(lower - this.prevLower) > this.bandChangeEps);
    }

    /**
     * Generate trading signals
     * @param {Object} data - Market data with close, mtrUpper, mtrLower arrays
     * @returns {Array} Array of signals (1 = buy, -1 = sell, 0 = hold)
     */
    generateSignals(data) {
        const { close, mtrUpper, mtrLower } = data;
        const signals = [0]; // First bar padded

        // Reset state
        this.reset();

        for (let i = 1; i < close.length; i++) {
            const price = close[i];
            const prevPrice = close[i - 1];
            const upper = mtrUpper[i];
            const lower = mtrLower[i];
            const prevUpper = mtrUpper[i - 1];
            const prevLower = mtrLower[i - 1];

            // Bands must exist
            if (isNaN(upper) || isNaN(lower)) {
                signals.push(0);
                continue;
            }

            const { buyLvl, sellLvl } = this._levels(upper, lower);
            let sig = 0;

            // Cooldown to limit churn
            if (i - this.lastTradeIndex < this.minDaysBetweenTrades) {
                signals.push(0);
                this.prevUpper = upper;
                this.prevLower = lower;
                continue;
            }

            // --- Handle band change (step) first ---
            if (this.reassessOnBandChange && this._bandChanged(upper, lower)) {
                // If our current position contradicts the new regime, fix it immediately.
                if (this.inPos && price < lower) {
                    sig = -1;
                    this.inPos = false;
                    this.lastTradeIndex = i;
                    signals.push(sig);
                    this.prevUpper = upper;
                    this.prevLower = lower;
                    continue;
                }
                if (!this.inPos && price > upper) {
                    sig = 1;
                    this.inPos = true;
                    this.lastTradeIndex = i;
                    signals.push(sig);
                    this.prevUpper = upper;
                    this.prevLower = lower;
                    continue;
                }
                // Otherwise fall through and apply the normal rules below.
            }

            // --- Regime rules ---
            if (price > upper) {
                // Breakout above: be long; if not in, buy on first cross
                const crossedAbove = (prevPrice <= prevUpper) && (price > upper);
                if (!this.inPos && crossedAbove) {
                    sig = 1;
                    this.inPos = true;
                    this.lastTradeIndex = i;
                }
            } else if (price < lower) {
                // Breakdown below: be flat; if in, sell on first cross
                const crossedBelow = (prevPrice >= prevLower) && (price < lower);
                if (this.inPos && crossedBelow) {
                    sig = -1;
                    this.inPos = false;
                    this.lastTradeIndex = i;
                }
            } else {
                // Inside band: mean-revert using margins
                if (!this.inPos) {
                    const crossedUpFromBelow = (prevPrice < buyLvl) && (price >= buyLvl);
                    if (crossedUpFromBelow) {
                        sig = 1;
                        this.inPos = true;
                        this.lastTradeIndex = i;
                    }
                } else {
                    const crossedDownFromAbove = (prevPrice > sellLvl) && (price <= sellLvl);
                    if (crossedDownFromAbove) {
                        sig = -1;
                        this.inPos = false;
                        this.lastTradeIndex = i;
                    }
                }
            }

            signals.push(sig);
            this.prevUpper = upper;
            this.prevLower = lower;
        }

        // Diagnostics
        const buys = signals.filter(s => s === 1).length;
        const sells = signals.filter(s => s === -1).length;
        console.log(`- Signals: buys=${buys}, sells=${sells}`);
        
        return signals;
    }
}
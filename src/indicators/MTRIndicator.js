/**
 * MTR Static Indicator - Revised for stable horizontal lines
 */
export class MTRIndicator {
    constructor(options = {}) {
        this.serenityWindow = options.serenityWindow || 20;
        this.atrWindow = options.atrWindow || 14;
        this.atrPctThreshold = options.atrPctThreshold || 0.0075;
        this.bandMult = options.bandMult || 2.0;
        this.stabilityConfirmation = options.stabilityConfirmation || 10;
        this.initialBaseline = options.initialBaseline || null;
    }

    /**
     * Calculate Average True Range
     */
    calculateATR(high, low, close) {
        const atrValues = [];
        
        for (let i = 0; i < high.length; i++) {
            if (i === 0) {
                atrValues.push(high[i] - low[i]);
                continue;
            }
            
            const highLow = high[i] - low[i];
            const highClose = Math.abs(high[i] - close[i - 1]);
            const lowClose = Math.abs(low[i] - close[i - 1]);
            
            const trueRange = Math.max(highLow, Math.max(highClose, lowClose));
            atrValues.push(trueRange);
        }

        // Calculate rolling average
        const atr = [];
        for (let i = 0; i < atrValues.length; i++) {
            if (i < this.atrWindow - 1) {
                atr.push(NaN);
            } else {
                const sum = atrValues.slice(i - this.atrWindow + 1, i + 1).reduce((a, b) => a + b, 0);
                atr.push(sum / this.atrWindow);
            }
        }
        
        return atr;
    }

    /**
     * Calculate MTR Static Indicator with ultra-stable horizontal lines
     */
    calculate(data) {
        const { high, low, close } = data;
        const atr = this.calculateATR(high, low, close);
        const atrPct = atr.map((val, i) => val / close[i]);
        
        // Initialize output arrays
        const mtrBase = new Array(close.length).fill(NaN);
        const mtrUpper = new Array(close.length).fill(NaN);
        const mtrLower = new Array(close.length).fill(NaN);
        
        // Set initial baseline
        const startIdx = Math.max(this.serenityWindow, this.atrWindow);
        if (startIdx >= close.length) {
            return {
                mtrBase,
                mtrUpper,
                mtrLower,
                atrPct
            };
        }
        
        // Much more conservative baseline changes
        let currentBaseline = this.initialBaseline || close[startIdx];
        const initialBandWidth = this.bandMult * atrPct[startIdx];
        let currentUpper = currentBaseline * (1 + initialBandWidth);
        let currentLower = currentBaseline * (1 - initialBandWidth);
        
        // Track for very major moves only
        let daysSinceLastChange = 0;
        const baselineChanges = [];
        
        console.log(`MTR Calculation - Ultra Conservative:`);
        console.log(`- Starting baseline: ${currentBaseline.toFixed(2)}`);
        
        for (let i = startIdx; i < close.length; i++) {
            const currentPrice = close[i];
            daysSinceLastChange++;
            
            // Only consider MAJOR moves (>25%) and only after significant time has passed
            const priceChangeFromBaseline = Math.abs(currentPrice - currentBaseline) / currentBaseline;
            
            // Very restrictive conditions for baseline change:
            // 1. Price moved >25% from current baseline
            // 2. At least 30 days since last baseline change
            // 3. Price has been in new range for stability_confirmation days
            if (priceChangeFromBaseline > 0.25 && daysSinceLastChange > 30) {
                // Check if price has been stable in new range
                const lookbackStart = Math.max(0, i - this.stabilityConfirmation);
                const recentPrices = close.slice(lookbackStart, i + 1);
                const recentVolatility = (Math.max(...recentPrices) - Math.min(...recentPrices)) / 
                    (recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length);
                
                // Only change if recent volatility is low (<15%)
                if (recentVolatility < 0.15) {
                    // Make the baseline change
                    const oldBaseline = currentBaseline;
                    currentBaseline = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
                    
                    const bandWidth = this.bandMult * atrPct[i];
                    currentUpper = currentBaseline * (1 + bandWidth);
                    currentLower = currentBaseline * (1 - bandWidth);
                    
                    daysSinceLastChange = 0;
                    baselineChanges.push({ index: i, oldBaseline, newBaseline: currentBaseline });
                    console.log(`- Baseline change at index ${i}: ${oldBaseline.toFixed(2)} -> ${currentBaseline.toFixed(2)}`);
                }
            }
            
            // Set the static values (horizontal lines)
            mtrBase[i] = currentBaseline;
            mtrUpper[i] = currentUpper;
            mtrLower[i] = currentLower;
        }
        
        console.log(`- Total baseline changes: ${baselineChanges.length}`);
        console.log(`- Final baseline: ${currentBaseline.toFixed(2)}`);
        
        return {
            mtrBase,
            mtrUpper,
            mtrLower,
            atrPct
        };
    }
}
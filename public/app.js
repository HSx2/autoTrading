// MTR Trading Simulator Frontend
let sessionId = null;
let chart = null;
let currentResults = null;

// Range selection variables
let isSelecting = false;
let selectionStart = null;
let selectionOverlay = null;
let originalStartDate = null;
let originalEndDate = null;

// Initialize session on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeSession();
    updateEndDateToToday();
    setupSliderListeners();
    setupWatchlistListeners();
    setupSymbolInputListener();
    loadVersionInfo();
});

// Setup real-time slider value updates and auto-recalculation
function setupSliderListeners() {
    const sliders = [
        { slider: 'priceChangeThreshold', display: 'priceChangeValue' },
        { slider: 'minDaysBetweenChanges', display: 'minDaysValue' },
        { slider: 'stabilityConfirmation', display: 'stabilityValue' },
        { slider: 'volatilityThreshold', display: 'volatilityValue' },
        { slider: 'stopLoss', display: 'stopLossValue' },
        { slider: 'serenityWindow', display: 'serenityValue' },
        { slider: 'atrWindow', display: 'atrValue' },
        { slider: 'bandMult', display: 'bandMultValue' }
    ];

    // All sliders for auto-recalculation
    const allSliders = sliders;

    let recalcTimeout;

    allSliders.forEach(({ slider, display }) => {
        const sliderElement = document.getElementById(slider);
        const displayElement = display ? document.getElementById(display) : null;

        if (sliderElement) {
            // Update display value in real-time as you drag
            sliderElement.addEventListener('input', function() {
                if (displayElement) {
                    displayElement.textContent = this.value;
                }

                // Debounce the recalculation to avoid too many requests while dragging
                clearTimeout(recalcTimeout);
                recalcTimeout = setTimeout(() => {
                    // Only recalculate if we have data loaded
                    if (chart && chart.data && chart.data.labels && chart.data.labels.length > 0) {
                        calculateAndShowChart(true); // true = silent update
                    }
                }, 200); // 200ms delay after stopping movement
            });

            // Also update on change (when you release the slider)
            sliderElement.addEventListener('change', function() {
                if (displayElement) {
                    displayElement.textContent = this.value;
                }

                // Immediate recalculation when slider is released
                if (chart && chart.data && chart.data.labels && chart.data.labels.length > 0) {
                    calculateAndShowChart(true); // true = silent update
                }
            });
        }
    });
}

// Setup watchlist item click handlers
function setupWatchlistListeners() {
    document.querySelectorAll('.watchlist-item').forEach(item => {
        item.addEventListener('click', function() {
            const symbol = this.dataset.symbol;

            // Update active state
            document.querySelectorAll('.watchlist-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');

            // Update symbol in search box and chart header
            document.getElementById('symbol').value = symbol;
            document.getElementById('currentSymbol').textContent = symbol;

            // Update chart info based on symbol
            const symbolName = this.querySelector('.watchlist-name').textContent;
            document.querySelector('.chart-info').textContent = `${symbolName} • NASDAQ`;

            // Auto-load data for the selected symbol
            loadData();
        });
    });
}

// Setup symbol input Enter key handler
function setupSymbolInputListener() {
    const symbolInput = document.getElementById('symbol');
    if (symbolInput) {
        symbolInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                loadData();
            }
        });
    }
}

// Load and display version information
async function loadVersionInfo() {
    try {
        const response = await fetch('/api/version');
        const data = await response.json();
        if (response.ok) {
            document.getElementById('versionInfo').textContent = `v${data.version}`;
        }
    } catch (error) {
        console.warn('Could not load version info:', error);
    }
}

async function initializeSession() {
    try {
        const response = await fetch('/api/simulator/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        const data = await response.json();
        if (data.success) {
            sessionId = data.sessionId;
            showStatus('Session initialized successfully', 'success');
        } else {
            throw new Error('Failed to initialize session');
        }
    } catch (error) {
        showStatus('Error initializing session: ' + error.message, 'error');
    }
}

function updateEndDateToToday() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('endDate').value = today;
}

function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
    
    // Auto-hide success messages
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.innerHTML = '';
        }, 3000);
    }
}

function showLoading(message = 'Processing...') {
    const modal = document.getElementById('loadingModal');
    const modalText = document.getElementById('modalText');
    modalText.textContent = message;
    modal.style.display = 'flex';
}

function hideLoading() {
    const modal = document.getElementById('loadingModal');
    modal.style.display = 'none';
}

async function loadData() {
    if (!sessionId) {
        showStatus('Session not initialized', 'error');
        return;
    }

    const symbol = document.getElementById('symbol').value.toUpperCase();
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!symbol || !startDate || !endDate) {
        showStatus('Please fill in all required fields', 'error');
        return;
    }

    if (new Date(startDate) >= new Date(endDate)) {
        showStatus('Start date must be before end date', 'error');
        return;
    }

    showLoading('Loading market data...');

    try {
        const response = await fetch('/api/data/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                symbol,
                startDate,
                endDate,
                useCache: true
            })
        });

        const data = await response.json();
        if (data.success) {
            // Hide modal immediately if data was cached
            if (data.fromCache) {
                hideLoading();
            }

            showStatus(`Data loaded: ${data.data.recordCount} records for ${data.data.symbol}${data.fromCache ? ' (cached)' : ''}`, 'success');

            // Calculate indicators and show chart immediately
            await calculateAndShowChart();
        } else {
            throw new Error(data.error || 'Failed to load data');
        }
    } catch (error) {
        showStatus('Error loading data: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function calculateAndShowChart(silent = false) {
    if (!sessionId) return;

    try {
        // Show subtle loading indicator for non-silent updates
        if (!silent) {
            showStatus('Calculating indicators...', 'info');
        }
        // Calculate indicators
        const indicatorParams = {
            serenityWindow: parseInt(document.getElementById('serenityWindow').value),
            atrWindow: parseInt(document.getElementById('atrWindow').value),
            bandMult: parseFloat(document.getElementById('bandMult').value),
            stabilityConfirmation: parseInt(document.getElementById('stabilityConfirmation').value),
            priceChangeThreshold: parseFloat(document.getElementById('priceChangeThreshold').value) / 100,
            minDaysBetweenChanges: parseInt(document.getElementById('minDaysBetweenChanges').value),
            volatilityThreshold: parseFloat(document.getElementById('volatilityThreshold').value) / 100
        };

        const response = await fetch('/api/indicator/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                params: indicatorParams
            })
        });

        if (response.ok) {
            // Get basic results to show chart
            const resultsResponse = await fetch(`/api/results/basic/${sessionId}`);
            const resultsData = await resultsResponse.json();

            if (resultsData.success) {
                // Skip creating basic chart to avoid flickering, go directly to backtest
                // which will create the full chart
                if (!silent) {
                    showStatus('Indicators calculated, running backtest...', 'info');
                }

                // Show equity toggle when ready
                showEquityToggle();

                // Run backtest immediately to create the full chart
                runBacktest(true); // true = auto-run, less verbose
            }
        }
    } catch (error) {
        if (!silent) {
            showStatus('Error calculating indicators: ' + error.message, 'error');
        } else {
            console.warn('Could not update chart:', error);
        }
    }
}

async function runBacktest(autoRun = false) {
    if (!sessionId) {
        if (!autoRun) showStatus('Session not initialized', 'error');
        return;
    }

    if (!autoRun) {
        showLoading('Running backtest simulation...');
    }

    try {
        // Step 1: Calculate indicators
        const indicatorParams = {
            serenityWindow: parseInt(document.getElementById('serenityWindow').value),
            atrWindow: parseInt(document.getElementById('atrWindow').value),
            bandMult: parseFloat(document.getElementById('bandMult').value),
            stabilityConfirmation: parseInt(document.getElementById('stabilityConfirmation').value),
            priceChangeThreshold: parseFloat(document.getElementById('priceChangeThreshold').value) / 100,
            minDaysBetweenChanges: parseInt(document.getElementById('minDaysBetweenChanges').value),
            volatilityThreshold: parseFloat(document.getElementById('volatilityThreshold').value) / 100
        };

        let response = await fetch('/api/indicator/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                params: indicatorParams
            })
        });

        if (!response.ok) throw new Error('Failed to calculate indicators');

        // Step 2: Generate signals
        const strategyParams = {
            stopLossPct: parseInt(document.getElementById('stopLoss').value) / 100,
            minDaysBetweenTrades: 2,
            insideMarginRatio: 0.10
        };

        response = await fetch('/api/signals/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                params: strategyParams
            })
        });

        if (!response.ok) throw new Error('Failed to generate signals');

        // Step 3: Run backtest
        const backtestParams = {
            initialCapital: parseFloat(document.getElementById('initialCapital').value),
            commissionPerShare: 0.01,
            minCommission: 7.0,
            taxRate: 0.25
        };

        response = await fetch('/api/backtest/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                params: backtestParams
            })
        });

        if (!response.ok) throw new Error('Failed to run backtest');

        // Step 4: Get results
        response = await fetch(`/api/results/${sessionId}`);
        const resultsData = await response.json();

        if (resultsData.success) {
            currentResults = resultsData.results;
            displayResults(currentResults);
            createChart(currentResults);
            document.getElementById('exportBtn').disabled = false;
            
            // Save results automatically
            await saveResults();
            
            if (!autoRun) {
                showStatus('Backtest completed successfully!', 'success');
            }
        } else {
            throw new Error(resultsData.error || 'Failed to get results');
        }
    } catch (error) {
        if (!autoRun) {
            showStatus('Error running backtest: ' + error.message, 'error');
        }
    } finally {
        if (!autoRun) {
            hideLoading();
        }
    }
}

function displayResults(results) {
    const { strategy, buyHold } = results;
    
    // Make sure we're targeting the sidebar results grid
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsContent = document.getElementById('resultsContent');
    resultsGrid.innerHTML = `
        <div style="margin-bottom: 16px;">
            <h5 style="color: #d1d4dc; margin-bottom: 12px; font-size: 13px; font-weight: 600;">MTR Strategy Performance</h5>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Initial Capital</span>
                <span style="color: #d1d4dc; font-weight: 600;">$${strategy.initialCapital.toLocaleString()}</span>
            </div>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Final Equity</span>
                <span style="color: #d1d4dc; font-weight: 600;">$${strategy.finalEquity.toLocaleString()}</span>
            </div>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Total Return</span>
                <span class="${strategy.totalReturn > 0 ? 'positive' : 'negative'}" style="font-weight: 600;">${strategy.totalReturn.toFixed(2)}%</span>
            </div>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Total Trades</span>
                <span style="color: #d1d4dc; font-weight: 600;">${strategy.totalTrades}</span>
            </div>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Win Rate</span>
                <span style="color: #d1d4dc; font-weight: 600;">${strategy.winRate.toFixed(2)}%</span>
            </div>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Average Win</span>
                <span class="positive" style="font-weight: 600;">$${strategy.avgWin.toFixed(2)}</span>
            </div>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Average Loss</span>
                <span class="negative" style="font-weight: 600;">$${strategy.avgLoss.toFixed(2)}</span>
            </div>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Commissions</span>
                <span style="color: #d1d4dc; font-weight: 600;">$${strategy.totalCommissions.toFixed(2)}</span>
            </div>
        </div>

        <div>
            <h5 style="color: #d1d4dc; margin-bottom: 12px; font-size: 13px; font-weight: 600;">Buy & Hold Comparison</h5>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Final Equity</span>
                <span style="color: #d1d4dc; font-weight: 600;">$${buyHold.finalEquity.toLocaleString()}</span>
            </div>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Total Return</span>
                <span class="${buyHold.totalReturn > 0 ? 'positive' : 'negative'}" style="font-weight: 600;">${buyHold.totalReturn.toFixed(2)}%</span>
            </div>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Commission</span>
                <span style="color: #d1d4dc; font-weight: 600;">$${buyHold.commission.toFixed(2)}</span>
            </div>
            <div class="result-item" style="font-size: 12px; margin-bottom: 6px;">
                <span style="color: #787b86;">Outperformance</span>
                <span class="${buyHold.outperformance > 0 ? 'positive' : 'negative'}" style="font-weight: 600;">${buyHold.outperformance > 0 ? '+' : ''}${buyHold.outperformance.toFixed(2)}%</span>
            </div>
            <div class="result-item" style="font-size: 12px;">
                <span class="${buyHold.outperformance > 0 ? 'positive' : 'negative'}" style="font-weight: 600; font-size: 11px;">
                    ${buyHold.outperformance > 0 ? '✅ MTR OUTPERFORMED' : '❌ MTR UNDERPERFORMED'}
                </span>
            </div>
        </div>
    `;
    
    // Show results container (always visible now)
    if (resultsContainer && resultsContent) {
        resultsContainer.style.display = 'block';
        resultsContent.style.display = 'block';
        console.log('Results displayed in sidebar');
    } else {
        console.error('Results container not found in sidebar');
    }

    // Show the equity toggle switch
    const toggleContainer = document.getElementById('toggleResultsContainer');
    const checkbox = document.getElementById('resultsToggle');
    if (toggleContainer && checkbox) {
        toggleContainer.style.display = 'flex';
        checkbox.checked = true; // Equity curve shown by default
        console.log('Equity toggle displayed');
    }
}

// Show equity toggle switch
function showEquityToggle() {
    const toggleContainer = document.getElementById('toggleResultsContainer');
    const checkbox = document.getElementById('resultsToggle');
    if (toggleContainer && checkbox) {
        toggleContainer.style.display = 'flex';
        checkbox.checked = true; // Equity curve shown by default
        console.log('Equity toggle displayed');
    }
}

// Toggle equity curve and trading signals visibility
function toggleResults() {
    const checkbox = document.getElementById('resultsToggle');

    if (checkbox && chart) {
        // Find and toggle the exact datasets by their labels
        chart.data.datasets.forEach(dataset => {
            if (dataset.label === 'MTR Strategy (%)' ||
                dataset.label === 'Buy Signals' ||
                dataset.label === 'Sell Signals') {
                dataset.hidden = !checkbox.checked;
            }
        });

        chart.update('none'); // Update without animation for instant response
        console.log('Toggle trading data - visible:', checkbox.checked,
                   'Affected datasets: MTR Strategy (%), Buy Signals, Sell Signals');
    }
}

function createBasicChart(results) {
    const ctx = document.getElementById('priceChart').getContext('2d');

    // Destroy existing chart if it exists
    if (chart) {
        chart.destroy();
    }

    const { marketData, indicators } = results;

    // Prepare data for chart
    const labels = marketData.dates;
    const priceData = marketData.close;
    const mtrBase = indicators.mtrBase;
    const mtrUpper = indicators.mtrUpper;
    const mtrLower = indicators.mtrLower;

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Price',
                    data: priceData,
                    borderColor: 'white',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'MTR Base',
                    data: mtrBase,
                    borderColor: 'orange',
                    backgroundColor: 'rgba(255,165,0,0.1)',
                    borderWidth: 1.5,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'MTR Upper',
                    data: mtrUpper,
                    borderColor: 'red',
                    backgroundColor: 'rgba(255,0,0,0.1)',
                    borderWidth: 1.5,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'MTR Lower',
                    data: mtrLower,
                    borderColor: 'green',
                    backgroundColor: 'rgba(0,255,0,0.1)',
                    borderWidth: 1.5,
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Price ($)'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `${document.getElementById('symbol').value} - MTR Strategy Analysis`
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            }
        }
    });

    // Add mouse event listeners for range selection
    addRangeSelectionEvents();

    document.getElementById('chartContainer').style.display = 'block';
}

function createChart(results) {
    const ctx = document.getElementById('priceChart').getContext('2d');

    // Destroy existing chart if it exists
    if (chart) {
        chart.destroy();
    }

    const { marketData, indicators, equityCurve, trades } = results;

    // Prepare data for chart
    const labels = marketData.dates;
    const priceData = marketData.close;
    const mtrBase = indicators.mtrBase;
    const mtrUpper = indicators.mtrUpper;
    const mtrLower = indicators.mtrLower;

    // Normalize price and equity to start from same baseline (100%)
    const startPrice = priceData[0];
    const startEquity = equityCurve[0];

    const normalizedPrice = priceData.map(price => (price / startPrice) * 100);
    const normalizedEquity = equityCurve.map(equity => (equity / startEquity) * 100);
    const normalizedMtrBase = mtrBase.map(value => value != null && !isNaN(value) ? (value / startPrice) * 100 : null);
    const normalizedMtrUpper = mtrUpper.map(value => value != null && !isNaN(value) ? (value / startPrice) * 100 : null);
    const normalizedMtrLower = mtrLower.map(value => value != null && !isNaN(value) ? (value / startPrice) * 100 : null);
    
    // Create buy/sell markers (normalized)
    const buyPoints = [];
    const sellPoints = [];

    if (trades) {
        trades.forEach((trade) => {
            const dateIndex = labels.findIndex(date => date === trade.date);
            if (dateIndex !== -1) {
                const point = {
                    x: trade.date,
                    y: (trade.price / startPrice) * 100  // Normalize trade markers too
                };

                if (trade.type === 'Buy Long') {
                    buyPoints.push(point);
                } else if (trade.type === 'Sell Long' || trade.type === 'Stop Loss') {
                    sellPoints.push(point);
                }
            }
        });
    }

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Buy & Hold (%)',
                    data: normalizedPrice,
                    borderColor: 'white',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'MTR Strategy (%)',
                    data: normalizedEquity,
                    borderColor: 'purple',
                    backgroundColor: 'rgba(128,0,128,0.1)',
                    borderWidth: 3,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'MTR Base',
                    data: normalizedMtrBase,
                    borderColor: 'orange',
                    backgroundColor: 'rgba(255,165,0,0.1)',
                    borderWidth: 1.5,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'MTR Upper',
                    data: normalizedMtrUpper,
                    borderColor: 'red',
                    backgroundColor: 'rgba(255,0,0,0.1)',
                    borderWidth: 1.5,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'MTR Lower',
                    data: normalizedMtrLower,
                    borderColor: 'green',
                    backgroundColor: 'rgba(0,255,0,0.1)',
                    borderWidth: 1.5,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'Buy Signals',
                    type: 'scatter',
                    data: buyPoints,
                    borderColor: 'blue',
                    backgroundColor: 'blue',
                    borderWidth: 2,
                    showLine: false,
                    pointRadius: 6,
                    pointStyle: 'triangle',
                    pointHoverRadius: 8
                },
                {
                    label: 'Sell Signals',
                    type: 'scatter',
                    data: sellPoints,
                    borderColor: 'red',
                    backgroundColor: 'red',
                    borderWidth: 2,
                    showLine: false,
                    pointRadius: 6,
                    pointStyle: 'triangle',
                    rotation: 180,
                    pointHoverRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    title: {
                        display: true,
                        text: 'Performance (%)'
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(1) + '%';
                        }
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `${document.getElementById('symbol').value} - MTR Strategy Analysis`
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            }
        }
    });

    // Add mouse event listeners for range selection
    addRangeSelectionEvents();

    document.getElementById('chartContainer').style.display = 'block';
}

async function exportCSV() {
    if (!sessionId) {
        showStatus('No session available', 'error');
        return;
    }

    showLoading('Exporting to CSV...');

    try {
        const symbol = document.getElementById('symbol').value;
        const filename = `${symbol}_${Date.now()}_results.csv`;

        const response = await fetch('/api/export/csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                filename
            })
        });

        if (response.ok) {
            // Create blob from response
            const blob = await response.blob();

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            // Cleanup
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showStatus('CSV file downloaded successfully', 'success');
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Export failed');
        }
    } catch (error) {
        showStatus('Error exporting CSV: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}


async function saveResults() {
    if (!sessionId) return;

    try {
        await fetch('/api/results/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                strategyName: 'MTR Strategy Web'
            })
        });
    } catch (error) {
        console.warn('Failed to save results:', error);
    }
}

async function clearCache() {
    showLoading('Clearing cache...');

    try {
        const response = await fetch('/api/cache/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        if (data.success) {
            showStatus('Cache cleared successfully!', 'success');

            // Reset UI state
            document.getElementById('exportBtn').disabled = true;
            document.getElementById('chartContainer').style.display = 'none';
            document.getElementById('resultsContainer').style.display = 'none';

            // Hide toggle container
            const toggleContainer = document.getElementById('toggleResultsContainer');
            if (toggleContainer) {
                toggleContainer.style.display = 'none';
            }

            // Destroy existing chart
            if (chart) {
                chart.destroy();
                chart = null;
            }

            // Reinitialize session since cache clear destroys all sessions
            await initializeSession();
        } else {
            throw new Error(data.error || 'Failed to clear cache');
        }
    } catch (error) {
        showStatus('Error clearing cache: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function addRangeSelectionEvents() {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;

    // Store original date range on first chart creation
    if (!originalStartDate) {
        originalStartDate = document.getElementById('startDate').value;
        originalEndDate = document.getElementById('endDate').value;
    }

    // Remove existing event listeners
    removeRangeSelectionEvents();

    canvas.addEventListener('mousedown', onSelectionStart);
    canvas.addEventListener('mousemove', onSelectionMove);
    canvas.addEventListener('mouseup', onSelectionEnd);
    canvas.addEventListener('mouseleave', onSelectionCancel);
}

function removeRangeSelectionEvents() {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;

    canvas.removeEventListener('mousedown', onSelectionStart);
    canvas.removeEventListener('mousemove', onSelectionMove);
    canvas.removeEventListener('mouseup', onSelectionEnd);
    canvas.removeEventListener('mouseleave', onSelectionCancel);
}

function onSelectionStart(event) {
    if (!chart) return;

    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;

    isSelecting = true;
    selectionStart = x;

    // Create selection overlay
    createSelectionOverlay();
}

function onSelectionMove(event) {
    if (!isSelecting || !chart) return;

    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;

    updateSelectionOverlay(selectionStart, x);
}

function onSelectionEnd(event) {
    if (!isSelecting || !chart) return;

    const rect = event.target.getBoundingClientRect();
    const endX = event.clientX - rect.left;

    // Convert pixel positions to data indices
    const startIndex = getDateIndexFromPixel(Math.min(selectionStart, endX));
    const endIndex = getDateIndexFromPixel(Math.max(selectionStart, endX));

    if (startIndex !== null && endIndex !== null && Math.abs(endX - selectionStart) > 10) {
        updateDateRange(startIndex, endIndex);
    }

    // Clean up
    isSelecting = false;
    selectionStart = null;
    removeSelectionOverlay();
}

function onSelectionCancel() {
    isSelecting = false;
    selectionStart = null;
    removeSelectionOverlay();
}

function createSelectionOverlay() {
    const chartWrapper = document.querySelector('.chart-wrapper');
    if (!chartWrapper || selectionOverlay) return;

    selectionOverlay = document.createElement('div');
    selectionOverlay.style.position = 'absolute';
    selectionOverlay.style.backgroundColor = 'rgba(54, 162, 235, 0.2)';
    selectionOverlay.style.border = '1px solid rgba(54, 162, 235, 1)';
    selectionOverlay.style.pointerEvents = 'none';
    selectionOverlay.style.top = '0';
    selectionOverlay.style.height = '100%';
    selectionOverlay.style.zIndex = '1000';

    chartWrapper.style.position = 'relative';
    chartWrapper.appendChild(selectionOverlay);
}

function updateSelectionOverlay(startX, endX) {
    if (!selectionOverlay) return;

    const left = Math.min(startX, endX);
    const width = Math.abs(endX - startX);

    selectionOverlay.style.left = `${left}px`;
    selectionOverlay.style.width = `${width}px`;
    selectionOverlay.style.display = 'block';
}

function removeSelectionOverlay() {
    if (selectionOverlay) {
        selectionOverlay.remove();
        selectionOverlay = null;
    }
}

function getDateIndexFromPixel(pixelX) {
    if (!chart || !chart.data.labels) return null;

    const chartArea = chart.chartArea;
    if (pixelX < chartArea.left || pixelX > chartArea.right) return null;

    // Calculate relative position within chart area
    const relativeX = (pixelX - chartArea.left) / (chartArea.right - chartArea.left);
    const index = Math.round(relativeX * (chart.data.labels.length - 1));

    return Math.max(0, Math.min(index, chart.data.labels.length - 1));
}

function updateDateRange(startIndex, endIndex) {
    if (!chart || !chart.data.labels) return;

    const startDate = chart.data.labels[startIndex];
    const endDate = chart.data.labels[endIndex];

    if (startDate && endDate) {
        // Filter chart data to show only the selected range
        filterChartData(startIndex, endIndex);

        showStatus(`Chart view filtered: ${startDate} to ${endDate} (view only)`, 'info');
    }
}

function filterChartData(startIndex, endIndex) {
    if (!chart || !chart.data) return;

    // Simply slice all existing datasets to the selected range
    const filteredLabels = chart.data.labels.slice(startIndex, endIndex + 1);

    // Update labels
    chart.data.labels = filteredLabels;

    // Update all datasets by slicing their existing data
    chart.data.datasets.forEach(dataset => {
        if (dataset.data && Array.isArray(dataset.data)) {
            if (dataset.type === 'scatter') {
                // For scatter plots (signals), filter points within the date range
                const startDate = filteredLabels[0];
                const endDate = filteredLabels[filteredLabels.length - 1];

                dataset.data = dataset.data.filter(point => {
                    return point.x >= startDate && point.x <= endDate;
                });
            } else {
                // For line datasets, just slice the data array
                dataset.data = dataset.data.slice(startIndex, endIndex + 1);
            }
        }
    });

    // Update the chart display
    chart.update('none'); // 'none' animation for instant update
}

function resetDateRange() {
    if (!currentResults) return;

    // Restore full chart data view without recalculating signals
    restoreFullChartData();
    showStatus('Chart view reset to full range (view only)', 'info');
}

function restoreFullChartData() {
    if (!chart || !currentResults) return;

    // Recreate the chart with full data to restore everything properly
    createChart(currentResults);
}


// Cleanup on page unload
window.addEventListener('beforeunload', async function() {
    if (sessionId) {
        try {
            await fetch(`/api/simulator/${sessionId}`, { method: 'DELETE' });
        } catch (error) {
            console.warn('Failed to cleanup session:', error);
        }
    }
});
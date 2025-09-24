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
});

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
            document.getElementById('backtestBtn').disabled = false;

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

async function calculateAndShowChart() {
    if (!sessionId) return;

    try {
        // Calculate indicators
        const indicatorParams = {
            serenityWindow: parseInt(document.getElementById('serenityWindow').value),
            atrWindow: parseInt(document.getElementById('atrWindow').value),
            bandMult: parseFloat(document.getElementById('bandMult').value),
            stabilityConfirmation: 10
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
                createBasicChart(resultsData.results);
            }
        }
    } catch (error) {
        console.warn('Could not show chart immediately:', error);
    }
}

async function runBacktest() {
    if (!sessionId) {
        showStatus('Session not initialized', 'error');
        return;
    }

    showLoading('Running backtest simulation...');

    try {
        // Step 1: Calculate indicators
        const indicatorParams = {
            serenityWindow: parseInt(document.getElementById('serenityWindow').value),
            atrWindow: parseInt(document.getElementById('atrWindow').value),
            bandMult: parseFloat(document.getElementById('bandMult').value),
            stabilityConfirmation: 10
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
            // document.getElementById('exportSheetsBtn').disabled = false;
            
            // Save results automatically
            await saveResults();
            
            showStatus('Backtest completed successfully!', 'success');
        } else {
            throw new Error(resultsData.error || 'Failed to get results');
        }
    } catch (error) {
        showStatus('Error running backtest: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function displayResults(results) {
    const { strategy, buyHold } = results;
    
    const resultsGrid = document.getElementById('resultsGrid');
    resultsGrid.innerHTML = `
        <div class="result-card">
            <h4>MTR Strategy Performance</h4>
            <div class="result-item">
                <span class="result-label">Initial Capital</span>
                <span class="result-value">$${strategy.initialCapital.toLocaleString()}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Final Equity</span>
                <span class="result-value">$${strategy.finalEquity.toLocaleString()}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Total Return</span>
                <span class="result-value ${strategy.totalReturn > 0 ? 'positive' : 'negative'}">${strategy.totalReturn.toFixed(2)}%</span>
            </div>
            <div class="result-item">
                <span class="result-label">Total Trades</span>
                <span class="result-value">${strategy.totalTrades}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Win Rate</span>
                <span class="result-value">${strategy.winRate.toFixed(2)}%</span>
            </div>
            <div class="result-item">
                <span class="result-label">Average Win</span>
                <span class="result-value positive">$${strategy.avgWin.toFixed(2)}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Average Loss</span>
                <span class="result-value negative">$${strategy.avgLoss.toFixed(2)}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Total Commissions</span>
                <span class="result-value">$${strategy.totalCommissions.toFixed(2)}</span>
            </div>
        </div>

        <div class="result-card">
            <h4>Buy & Hold Comparison</h4>
            <div class="result-item">
                <span class="result-label">Final Equity</span>
                <span class="result-value">$${buyHold.finalEquity.toLocaleString()}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Total Return</span>
                <span class="result-value ${buyHold.totalReturn > 0 ? 'positive' : 'negative'}">${buyHold.totalReturn.toFixed(2)}%</span>
            </div>
            <div class="result-item">
                <span class="result-label">Commission</span>
                <span class="result-value">$${buyHold.commission.toFixed(2)}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Outperformance</span>
                <span class="result-value ${buyHold.outperformance > 0 ? 'positive' : 'negative'}">${buyHold.outperformance > 0 ? '+' : ''}${buyHold.outperformance.toFixed(2)}%</span>
            </div>
            <div class="result-item">
                <span class="result-label">Result</span>
                <span class="result-value ${buyHold.outperformance > 0 ? 'positive' : 'negative'}">
                    ${buyHold.outperformance > 0 ? '✅ MTR OUTPERFORMED' : '❌ MTR UNDERPERFORMED'}
                </span>
            </div>
        </div>
    `;
    
    document.getElementById('resultsContainer').style.display = 'block';
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
                    borderColor: 'black',
                    backgroundColor: 'rgba(0,0,0,0.1)',
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
                    borderColor: 'black',
                    backgroundColor: 'rgba(0,0,0,0.1)',
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

        const data = await response.json();
        if (data.success) {
            showStatus(`Results exported to ${data.filepath}`, 'success');
        } else {
            throw new Error(data.error || 'Export failed');
        }
    } catch (error) {
        showStatus('Error exporting CSV: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Google Sheets export functionality temporarily disabled
async function exportGoogleSheets() {
    showStatus('Google Sheets export temporarily disabled', 'info');
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
            document.getElementById('backtestBtn').disabled = true;
            document.getElementById('exportBtn').disabled = true;
            // document.getElementById('exportSheetsBtn').disabled = true;
            document.getElementById('chartContainer').style.display = 'none';
            document.getElementById('resultsContainer').style.display = 'none';

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
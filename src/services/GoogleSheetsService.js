import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

export class GoogleSheetsService {
    constructor() {
        this.sheets = null;
        this.auth = null;
    }

    /**
     * Initialize Google Sheets API with service account credentials
     */
    async initialize() {
        try {
            // For now, we'll use a simple approach with API key
            // In production, you'd want to use service account credentials
            const auth = new google.auth.GoogleAuth({
                keyFile: './credentials.json', // Service account key file
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            this.auth = auth;
            this.sheets = google.sheets({ version: 'v4', auth });

        } catch (error) {
            console.warn('Google Sheets API not configured. Using fallback mode.');
            // For development, we'll create a mock implementation
            this.sheets = this.createMockSheetsAPI();
        }
    }

    /**
     * Create a mock Google Sheets API for development
     */
    createMockSheetsAPI() {
        return {
            spreadsheets: {
                create: async (params) => ({
                    data: {
                        spreadsheetId: `mock_sheet_${Date.now()}`,
                        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/mock_sheet_${Date.now()}/edit`
                    }
                }),
                values: {
                    update: async () => ({ data: { updatedRows: 1 } }),
                    batchUpdate: async () => ({ data: { replies: [] } })
                }
            }
        };
    }

    /**
     * Create a new spreadsheet for trading data
     */
    async createTradingSpreadsheet(title, symbol) {
        if (!this.sheets) await this.initialize();

        const spreadsheet = await this.sheets.spreadsheets.create({
            requestBody: {
                properties: {
                    title: `${title} - ${symbol} - ${new Date().toISOString().split('T')[0]}`
                },
                sheets: [
                    {
                        properties: {
                            title: 'Raw Data',
                            gridProperties: {
                                rowCount: 1000,
                                columnCount: 20
                            }
                        }
                    },
                    {
                        properties: {
                            title: 'Calculations',
                            gridProperties: {
                                rowCount: 1000,
                                columnCount: 15
                            }
                        }
                    },
                    {
                        properties: {
                            title: 'Summary',
                            gridProperties: {
                                rowCount: 50,
                                columnCount: 10
                            }
                        }
                    }
                ]
            }
        });

        return spreadsheet.data;
    }

    /**
     * Setup spreadsheet structure with headers and formulas
     */
    async setupSpreadsheetStructure(spreadsheetId) {
        if (!this.sheets) await this.initialize();

        const requests = [];

        // Raw Data sheet headers
        requests.push({
            updateCells: {
                range: {
                    sheetId: 0, // Raw Data sheet
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: 10
                },
                rows: [{
                    values: [
                        { userEnteredValue: { stringValue: 'Date' } },
                        { userEnteredValue: { stringValue: 'Close_Price' } },
                        { userEnteredValue: { stringValue: 'Volume' } },
                        { userEnteredValue: { stringValue: 'High' } },
                        { userEnteredValue: { stringValue: 'Low' } },
                        { userEnteredValue: { stringValue: 'Open' } },
                        { userEnteredValue: { stringValue: 'Should_Buy' } },
                        { userEnteredValue: { stringValue: 'Should_Sell' } },
                        { userEnteredValue: { stringValue: 'Signal_Raw' } },
                        { userEnteredValue: { stringValue: 'MTR_Place' } }
                    ]
                }],
                fields: 'userEnteredValue'
            }
        });

        // Calculations sheet headers and formulas
        requests.push({
            updateCells: {
                range: {
                    sheetId: 1, // Calculations sheet
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: 12
                },
                rows: [{
                    values: [
                        { userEnteredValue: { stringValue: 'Date' } },
                        { userEnteredValue: { stringValue: 'Price' } },
                        { userEnteredValue: { stringValue: 'ATR' } },
                        { userEnteredValue: { stringValue: 'Serenity_Index' } },
                        { userEnteredValue: { stringValue: 'MTR_Base' } },
                        { userEnteredValue: { stringValue: 'MTR_Upper' } },
                        { userEnteredValue: { stringValue: 'MTR_Lower' } },
                        { userEnteredValue: { stringValue: 'Position' } },
                        { userEnteredValue: { stringValue: 'Shares' } },
                        { userEnteredValue: { stringValue: 'Cash' } },
                        { userEnteredValue: { stringValue: 'Equity_Formula' } },
                        { userEnteredValue: { stringValue: 'Equity_Code' } }
                    ]
                }],
                fields: 'userEnteredValue'
            }
        });

        // Apply formatting
        requests.push({
            repeatCell: {
                range: {
                    sheetId: 0,
                    startRowIndex: 0,
                    endRowIndex: 1
                },
                cell: {
                    userEnteredFormat: {
                        textFormat: { bold: true },
                        backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
                    }
                },
                fields: 'userEnteredFormat'
            }
        });

        requests.push({
            repeatCell: {
                range: {
                    sheetId: 1,
                    startRowIndex: 0,
                    endRowIndex: 1
                },
                cell: {
                    userEnteredFormat: {
                        textFormat: { bold: true },
                        backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
                    }
                },
                fields: 'userEnteredFormat'
            }
        });

        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests }
        });
    }

    /**
     * Add trading data to the spreadsheet
     */
    async addTradingData(spreadsheetId, tradingData) {
        if (!this.sheets) await this.initialize();

        // Prepare raw data
        const rawData = tradingData.map(row => [
            row.Date,
            parseFloat(row.Close_Price),
            row.Volume || '',
            row.High || '',
            row.Low || '',
            row.Open || '',
            row.Should_Buy,
            row.Should_Sell,
            parseInt(row.Signal_Raw),
            row.MTR_Place
        ]);

        // Add raw data to Raw Data sheet
        await this.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Raw Data!A2:J${rawData.length + 1}`,
            valueInputOption: 'RAW',
            requestBody: {
                values: rawData
            }
        });

        // Create calculation formulas
        await this.addCalculationFormulas(spreadsheetId, tradingData.length);
    }

    /**
     * Add calculation formulas to the Calculations sheet
     */
    async addCalculationFormulas(spreadsheetId, dataLength) {
        if (!this.sheets) await this.initialize();

        const requests = [];

        // Add formulas for each row
        for (let i = 2; i <= dataLength + 1; i++) {
            const rowIndex = i - 1; // 0-based index for API

            requests.push({
                updateCells: {
                    range: {
                        sheetId: 1, // Calculations sheet
                        startRowIndex: rowIndex,
                        endRowIndex: rowIndex + 1,
                        startColumnIndex: 0,
                        endColumnIndex: 12
                    },
                    rows: [{
                        values: [
                            // Date - reference from Raw Data
                            { userEnteredValue: { formulaValue: `='Raw Data'!A${i}` } },
                            // Price - reference from Raw Data
                            { userEnteredValue: { formulaValue: `='Raw Data'!B${i}` } },
                            // ATR calculation (simplified)
                            { userEnteredValue: { formulaValue: `=IF(ROW()>15,AVERAGE(ABS(B${i}-B${i-1}):ABS(B${i-13}-B${i-14})),"")` } },
                            // Serenity Index (simplified moving average)
                            { userEnteredValue: { formulaValue: `=IF(ROW()>21,AVERAGE(B${i-19}:B${i}),"")` } },
                            // MTR Base (using Serenity Index)
                            { userEnteredValue: { formulaValue: `=D${i}` } },
                            // MTR Upper (Base + 2*ATR)
                            { userEnteredValue: { formulaValue: `=IF(AND(D${i}<>"",C${i}<>""),E${i}+2*C${i},"")` } },
                            // MTR Lower (Base - 2*ATR)
                            { userEnteredValue: { formulaValue: `=IF(AND(D${i}<>"",C${i}<>""),E${i}-2*C${i},"")` } },
                            // Position (1 if long, 0 if not)
                            { userEnteredValue: { formulaValue: `=IF('Raw Data'!G${i},1,IF('Raw Data'!H${i},0,IF(ROW()=2,0,H${i-1})))` } },
                            // Shares calculation
                            { userEnteredValue: { formulaValue: `=IF(H${i}=1,IF(H${i-1}=0,FLOOR(J${i-1}/B${i},1),I${i-1}),0)` } },
                            // Cash calculation
                            { userEnteredValue: { formulaValue: `=IF(ROW()=2,10000,IF(H${i}<>H${i-1},IF(H${i}=1,J${i-1}-I${i}*B${i},J${i-1}+I${i-1}*B${i}),J${i-1}))` } },
                            // Equity Formula calculation
                            { userEnteredValue: { formulaValue: `=J${i}+I${i}*B${i}` } },
                            // Equity from Code (for comparison)
                            { userEnteredValue: { stringValue: '' } } // Will be filled with actual code results
                        ]
                    }],
                    fields: 'userEnteredValue'
                }
            });
        }

        // Apply formatting to make formula columns distinct
        requests.push({
            repeatCell: {
                range: {
                    sheetId: 1,
                    startColumnIndex: 10,
                    endColumnIndex: 11,
                    startRowIndex: 1,
                    endRowIndex: dataLength + 1
                },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 0.9, green: 1.0, blue: 0.9 }
                    }
                },
                fields: 'userEnteredFormat'
            }
        });

        requests.push({
            repeatCell: {
                range: {
                    sheetId: 1,
                    startColumnIndex: 11,
                    endColumnIndex: 12,
                    startRowIndex: 1,
                    endRowIndex: dataLength + 1
                },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 1.0, green: 0.9, blue: 0.9 }
                    }
                },
                fields: 'userEnteredFormat'
            }
        });

        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests }
        });
    }

    /**
     * Add code-calculated equity values for comparison
     */
    async addCodeEquityValues(spreadsheetId, equityCurve) {
        if (!this.sheets) await this.initialize();

        const equityValues = equityCurve.map(value => [value.toFixed(2)]);

        await this.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Calculations!L2:L${equityValues.length + 1}`,
            valueInputOption: 'RAW',
            requestBody: {
                values: equityValues
            }
        });
    }

    /**
     * Add summary calculations to Summary sheet
     */
    async addSummarySheet(spreadsheetId, backtestResults, dataLength) {
        if (!this.sheets) await this.initialize();

        const summaryData = [
            ['Metric', 'Formula Value', 'Code Value', 'Match'],
            ['Initial Capital', '10000', backtestResults.strategy.initialCapital.toString(), '=B2=C2'],
            ['Final Equity (Formula)', `=Calculations!K${dataLength + 1}`, '', ''],
            ['Final Equity (Code)', '', backtestResults.strategy.finalEquity.toString(), ''],
            ['Total Return (Formula)', `=(B3-B2)/B2*100`, '', ''],
            ['Total Return (Code)', '', backtestResults.strategy.totalReturn.toString(), '=ABS(B5-C5)<0.01'],
            ['Total Trades', '', backtestResults.strategy.totalTrades.toString(), ''],
            ['Win Rate', '', backtestResults.strategy.winRate.toString(), ''],
            ['Average Win', '', backtestResults.strategy.avgWin.toString(), ''],
            ['Average Loss', '', backtestResults.strategy.avgLoss.toString(), '']
        ];

        await this.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'Summary!A1:D10',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: summaryData
            }
        });

        // Format summary sheet
        const requests = [{
            repeatCell: {
                range: {
                    sheetId: 2, // Summary sheet
                    startRowIndex: 0,
                    endRowIndex: 1
                },
                cell: {
                    userEnteredFormat: {
                        textFormat: { bold: true },
                        backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
                    }
                },
                fields: 'userEnteredFormat'
            }
        }];

        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests }
        });
    }
}
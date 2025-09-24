# Claude Instructions for autoTrading Project

## Server Management
- Always use `npm run dev` to start the server (not `npm start`)
- The main server file is `src/server.js` (web server with REST API)
- The CLI version is `src/app.js` (run with `npm run cli`)

## Project Structure
- Web server: `src/server.js` - Express server with API endpoints
- CLI interface: `src/app.js` - Command-line trading simulator
- Database: `trading_simulator.db` - SQLite database for storing results
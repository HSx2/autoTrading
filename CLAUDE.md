# Claude Instructions for autoTrading Project

## Server Management
- Always use `npm run dev` to start the server (not `npm start`)
- Automatically start the server in the background using `npm run dev` without waiting for user instruction
- The main server file is `src/server.js` (web server with REST API)
- The CLI version is `src/app.js` (run with `npm run cli`)

## Project Structure
- Web server: `src/server.js` - Express server with API endpoints
- CLI interface: `src/app.js` - Command-line trading simulator
- Database: `trading_simulator.db` - SQLite database for storing results

## Commit Messages
- Never include Claude Code generation attribution in commit messages
- Keep commit messages focused on technical changes and business value
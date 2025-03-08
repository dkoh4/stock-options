# Stock Options Analysis Tool

This application provides stock data visualization, options analysis, and historical price data through an intuitive interface.

## Features

- Real-time stock price visualization with candlestick charts
- Options chain analysis with Black-Scholes model
- Historical price data retrieval from local database or Alpha Vantage API

## Setup

```bash
# Install server dependencies
cd server
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Alpha Vantage API Setup

The application can fetch historical price data for stocks not in the local database using the Alpha Vantage API:

1. Get a free API key from [Alpha Vantage](https://www.alphavantage.co/support/#api-key)
2. Create a `.env` file in the `server` directory with your API key:

```
ALPHA_VANTAGE_API_KEY=your_api_key_here
ALPHA_VANTAGE_URL=https://www.alphavantage.co/query
```

**Note:** Alpha Vantage has API rate limits.

### Running the Application

1. Start the server:

```bash
cd server
npm start
```

2. Start the frontend (in a separate terminal):

```bash
cd frontend
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

## Usage

- Search for a stock ticker in the search box
- View historical price data in the candlestick chart
- Analyze the RSI indicator for overbought/oversold conditions
- View the options chain by clicking "Show Options"
- Select different expiration dates to view various option contracts

## Database

Stock price data is stored in SQLite database at `server/db/stockdata.db`. If a ticker is not found in the database, the application will attempt to fetch it from Alpha Vantage and store it locally for future use.

## API Endpoints

- GET `/api/prices/:ticker` - Get historical price data for a ticker
- GET `/api/options/:ticker` - Get options chain data for a ticker
- GET `/api/options/:ticker/:date` - Get options chain for a specific date

## Project Structure

- `frontend/` - React frontend application
- `server/` - Node.js Express backend
- `server/db/` - Database setup and initialization
- `*.csv` - Stock price data files 
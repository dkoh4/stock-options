const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const optionCalc = require('./optionCalc');
const alphaVantage = require('./alphaVantageService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to SQLite database
const dbPath = path.join(__dirname, 'db/stockdata.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to the database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// API route to get all available tickers
app.get('/api/tickers', (req, res) => {
  db.all('SELECT DISTINCT ticker FROM stock_prices', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.map(row => row.ticker));
  });
});

// API route to search for tickers
app.get('/api/search/:query', (req, res) => {
  const query = `%${req.params.query}%`;
  db.all('SELECT DISTINCT ticker FROM stock_prices WHERE ticker LIKE ?', [query], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.map(row => row.ticker));
  });
});

// API route to get price data for a specific ticker
app.get('/api/prices/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  console.log(`Received request for price data: ${ticker}`);
  
  try {
    // Check if ticker exists in database
    const tickerExists = await alphaVantage.tickerExistsInDatabase(ticker);
    
    if (tickerExists) {
      // Check if data is stale (over a week old)
      const needsUpdate = await isDataStale(ticker);
      
      if (needsUpdate) {
        console.log(`Data for ${ticker} is over a week old, updating from Alpha Vantage...`);
        try {
          await alphaVantage.updateExistingStockData(ticker);
          console.log(`Successfully updated data for ${ticker}`);
        } catch (updateError) {
          console.error(`Error updating data for ${ticker}:`, updateError.message);
          // Continue with existing data even if update fails
        }
      }
      
      // Fetch from database
      db.all(
        'SELECT ticker, date, open, high, low, close, volume FROM stock_prices WHERE ticker = ? ORDER BY date',
        [ticker],
        (err, rows) => {
          if (err) {
            console.error(`Error fetching price data for ${ticker}:`, err.message);
            res.status(500).json({ error: err.message });
            return;
          }
          
          console.log(`Found ${rows.length} price records for ${ticker} in database`);
          
          if (rows.length === 0) {
            // If no rows found (rare edge case), try fetching from Alpha Vantage
            fetchFromAlphaVantage();
            return;
          }
          
          // Format data for TradingView chart
          const formattedData = rows.map(row => ({
            time: new Date(row.date).getTime() / 1000, // Convert to Unix timestamp in seconds
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume
          }));
          
          console.log(`Sending ${formattedData.length} formatted price records for ${ticker}`);
          res.json(formattedData);
        }
      );
    } else {
      // Ticker not in database, fetch from Alpha Vantage
      fetchFromAlphaVantage();
    }
    
    // Helper function to fetch from Alpha Vantage and respond
    async function fetchFromAlphaVantage() {
      try {
        console.log(`Ticker ${ticker} not found in database, fetching from Alpha Vantage`);
        const formattedData = await alphaVantage.fetchAndStoreStockData(ticker);
        
        if (!formattedData || formattedData.length === 0) {
          console.error(`No data found for ticker ${ticker} via Alpha Vantage`);
          res.status(404).json({ 
            error: `No data found for ticker ${ticker}. Please check if the symbol is valid.`
          });
          return;
        }
        
        console.log(`Sending ${formattedData.length} price records from Alpha Vantage for ${ticker}`);
        res.json(formattedData);
      } catch (error) {
        console.error(`Error fetching ${ticker} from Alpha Vantage:`, error.message);
        // If API key not set, send a special message
        if (error.message.includes('apikey')) {
          res.status(503).json({ 
            error: 'Alpha Vantage API key not configured. Please set ALPHA_VANTAGE_API_KEY in .env file.' 
          });
        } else if (error.message.includes('No data found for ticker')) {
          // If ticker is invalid, return 404
          res.status(404).json({ 
            error: `Ticker symbol "${ticker}" not found. Please check if the symbol is valid.`
          });
        } else {
          res.status(500).json({ error: error.message });
        }
      }
    }
  } catch (error) {
    console.error(`Error processing request for ${ticker}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to check if data for a ticker is over a week old
async function isDataStale(ticker) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT MAX(date) as latest_date FROM stock_prices WHERE ticker = ?';
    db.get(query, [ticker], (err, row) => {
      if (err) {
        console.error(`Error checking data age for ${ticker}:`, err.message);
        resolve(false); // Default to not updating on error
        return;
      }
      
      if (!row || !row.latest_date) {
        console.log(`No date data found for ${ticker}`);
        resolve(true); // Update if no date found
        return;
      }
      
      const latestDate = new Date(row.latest_date);
      const currentDate = new Date();
      
      // Calculate the difference in days
      const diffTime = currentDate - latestDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      console.log(`Latest data for ${ticker} is from ${row.latest_date} (${diffDays} days old)`);
      
      // Return true if data is over 7 days old
      resolve(diffDays > 7);
    });
  });
}

// API route to get option chain data using Black-Scholes model
app.get('/api/options/:ticker', (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const requestedDate = req.query.date; // Optional query param for specific date
  
  console.log(`Received request for options data: ${ticker}${requestedDate ? ` with date ${requestedDate}` : ''}`);
  
  // Get the latest stock price and calculate historical volatility
  db.all(
    'SELECT close FROM stock_prices WHERE ticker = ? ORDER BY date DESC LIMIT 30',
    [ticker],
    (err, rows) => {
      if (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: 'Database error: ' + err.message });
        return;
      }
      
      if (!rows || rows.length === 0) {
        console.error('No price data found for ticker:', ticker);
        res.status(404).json({ error: 'No price data found for ticker' });
        return;
      }
      
      try {
        // Get current price (most recent closing price)
        const currentPrice = parseFloat(rows[0].close);
        console.log(`Current price for ${ticker}: ${currentPrice}`);
        
        // Calculate historical volatility with error handling
        let volatility = 0.25; // Default volatility of 25%
        try {
          // Extract closing prices for volatility calculation
          const closingPrices = rows.map(row => parseFloat(row.close));
          if (closingPrices.length > 1) {
            volatility = optionCalc.calculateHistoricalVolatility(closingPrices);
            console.log(`Calculated volatility for ${ticker}: ${volatility}`);
            // Cap volatility to reasonable range
            volatility = Math.max(0.1, Math.min(volatility, 0.8));
          }
        } catch (volatilityError) {
          console.error('Error calculating volatility, using default:', volatilityError);
        }
        
        // Calculate base strike (round current price to nearest 5)
        const baseStrike = Math.round(currentPrice / 5) * 5;
        const strikeStep = 5;
        const strikesCount = 10; // Number of strikes to generate
        
        // Generate strike prices (centered around base strike)
        const strikes = [];
        for (let i = -Math.floor(strikesCount/2); i <= Math.floor(strikesCount/2); i++) {
          strikes.push(baseStrike + i * strikeStep);
        }
        
        // Sort strikes high to low as requested
        strikes.sort((a, b) => b - a);
        
        // Generate days to expiration - include a 0 DTE tab that will be replaced by custom date
        let daysToExpiration = [0, 30, 60, 90, 180]; // Default expirations with 0 DTE
        
        // If a specific date was requested, replace the 0 DTE tab with it
        if (requestedDate) {
          const today = new Date();
          const targetDate = new Date(requestedDate);
          
          // Only use if it's a valid future date
          if (targetDate > today) {
            const diffTime = Math.abs(targetDate - today);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // Remove 0 DTE and add custom date (replace the first tab)
            daysToExpiration = daysToExpiration.filter(d => d !== 0);
            daysToExpiration.unshift(diffDays);
            
            // Sort days to expiration in ascending order
            daysToExpiration.sort((a, b) => a - b);
          } else {
            console.warn('Requested date is not in the future, ignoring:', requestedDate);
          }
        }
        
        // Risk-free rate (approximately 3-4% as of 2023)
        const riskFreeRate = 0.035;
        
        // Generate option chain data using Black-Scholes with error handling
        const optionChain = {};
        
        daysToExpiration.forEach(days => {
          // Handle 0 DTE as a special case
          const timeToExpiry = days === 0 ? 1/365 : days / 365; // Use 1 day for 0 DTE to avoid division by 0
          const expiryData = { calls: [], puts: [] };
          
          strikes.forEach(strike => {
            try {
              // Calculate option prices using Black-Scholes
              const callPrice = optionCalc.blackScholes('call', currentPrice, strike, timeToExpiry, riskFreeRate, volatility);
              const putPrice = optionCalc.blackScholes('put', currentPrice, strike, timeToExpiry, riskFreeRate, volatility);
              
              // Calculate the Greeks
              // Delta: Δ = N(d1) for calls, Δ = N(d1) - 1 for puts
              // Gamma: Γ = N'(d1) / (S * σ * √T)
              // Theta: Θ = -S * N'(d1) * σ / (2 * √T)
              // Vega: v = S * √T * N'(d1)
              
              const d1 = (Math.log(currentPrice / strike) + (riskFreeRate + volatility * volatility / 2) * timeToExpiry) 
                         / (volatility * Math.sqrt(timeToExpiry));
              const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
              
              const callDelta = optionCalc.normalCDF(d1);
              const putDelta = callDelta - 1;
              
              const normDist = Math.exp(-d1*d1/2) / Math.sqrt(2 * Math.PI);
              const gamma = normDist / (currentPrice * volatility * Math.sqrt(timeToExpiry));
              
              const callTheta = (-currentPrice * normDist * volatility / (2 * Math.sqrt(timeToExpiry)) 
                                - riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiry) * optionCalc.normalCDF(d2)) / 365;
              
              const putTheta = (-currentPrice * normDist * volatility / (2 * Math.sqrt(timeToExpiry)) 
                               + riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiry) * optionCalc.normalCDF(-d2)) / 365;
              
              const vega = currentPrice * Math.sqrt(timeToExpiry) * normDist / 100;
              
              // Add call option
              expiryData.calls.push({
                strike,
                price: Math.max(0.01, callPrice),
                delta: callDelta,
                gamma,
                theta: callTheta,
                vega,
                inTheMoney: currentPrice > strike
              });
              
              // Add put option
              expiryData.puts.push({
                strike,
                price: Math.max(0.01, putPrice),
                delta: putDelta,
                gamma,
                theta: putTheta,
                vega,
                inTheMoney: currentPrice < strike
              });
            } catch (error) {
              console.error(`Error calculating option for strike ${strike}:`, error);
              // Add placeholder in case of calculation error
              expiryData.calls.push({
                strike,
                price: 0.01,
                delta: 0,
                gamma: 0,
                theta: 0,
                vega: 0,
                inTheMoney: false
              });
              expiryData.puts.push({
                strike,
                price: 0.01,
                delta: 0,
                gamma: 0,
                theta: 0,
                vega: 0,
                inTheMoney: false
              });
            }
          });
          
          // Store the expiration data
          optionChain[days] = expiryData;
        });
        
        // Send the option chain data
        res.json({
          ticker,
          price: currentPrice,
          volatility,
          optionChain,
          customDate: requestedDate || null // Send the custom date if it was provided
        });
      } catch (error) {
        console.error('Error processing option data:', error);
        res.status(500).json({ 
          error: 'Error calculating option data: ' + error.message
        });
      }
    }
  );
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Close the database connection when the server is terminated
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database connection:', err.message);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});
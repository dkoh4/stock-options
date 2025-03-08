/**
 * Alpha Vantage API Service
 * This module handles fetching stock data from Alpha Vantage and storing it in the database
 */

const axios = require('axios');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
require('dotenv').config();

// API configuration
const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = process.env.ALPHA_VANTAGE_URL || 'https://www.alphavantage.co/query';

// Database connection
const dbPath = path.join(__dirname, 'db/stockdata.db');
const db = new sqlite3.Database(dbPath);

// Promisify database operations for easier async/await usage
const dbAll = promisify(db.all.bind(db));
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));

/**
 * Check if a ticker exists in the database
 * @param {string} ticker - The stock ticker symbol
 * @returns {Promise<boolean>} - True if ticker exists, false otherwise
 */
async function tickerExistsInDatabase(ticker) {
  try {
    const query = 'SELECT COUNT(*) as count FROM stock_prices WHERE ticker = ?';
    const row = await dbGet(query, [ticker]);
    return row && row.count > 0;
  } catch (error) {
    console.error(`Error checking database for ticker ${ticker}:`, error.message);
    return false;
  }
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - The function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialDelay - Initial delay in milliseconds
 * @returns {Promise<any>} - Result of the function
 */
async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  let retries = 0;
  
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (retries >= maxRetries) {
        throw error;
      }
      
      // If it's a rate limit error, use longer delay
      const isRateLimit = error.response && 
        (error.response.status === 429 || 
         (error.response.data && error.response.data.toString().includes('limit')));
      
      const delay = isRateLimit 
        ? initialDelay * Math.pow(2, retries) * 2 // Double delay for rate limits
        : initialDelay * Math.pow(2, retries);
      
      console.warn(`Retry attempt ${retries + 1}/${maxRetries}. Waiting ${delay}ms before retrying...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      retries++;
    }
  }
}

/**
 * Fetch daily stock price data from Alpha Vantage and save to database
 * @param {string} ticker - The stock ticker symbol
 * @returns {Promise<Array>} - Formatted data for TradingView charts
 */
async function fetchAndStoreStockData(ticker) {
  // Verify API key is available
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    throw new Error('Alpha Vantage API key not set. Please configure ALPHA_VANTAGE_API_KEY in .env file.');
  }

  console.log(`Fetching data for ${ticker} from Alpha Vantage...`);
  
  try {
    // Fetch the data from Alpha Vantage with retry logic
    const response = await retryWithBackoff(async () => {
      return await axios.get(BASE_URL, {
        params: {
          function: 'TIME_SERIES_DAILY',
          symbol: ticker,
          outputsize: 'full', // Get full history (up to 20 years)
          apikey: API_KEY
        },
        timeout: 10000 // 10 second timeout
      });
    });
    
    const data = response.data;
    
    // Validate the response
    if (!data || data.hasOwnProperty('Error Message')) {
      throw new Error(data['Error Message'] || 'Invalid response from Alpha Vantage');
    }
    
    if (data.hasOwnProperty('Note') && data.Note.includes('limit')) {
      throw new Error(`Alpha Vantage API rate limit reached: ${data.Note}`);
    }
    
    const timeSeriesKey = 'Time Series (Daily)';
    if (!data[timeSeriesKey] || Object.keys(data[timeSeriesKey]).length === 0) {
      throw new Error(`No data found for ticker "${ticker}" via Alpha Vantage API`);
    }
    
    // Parse and store the data
    const timeSeries = data[timeSeriesKey];
    const dates = Object.keys(timeSeries).sort(); // Sort dates in ascending order
    console.log(`Retrieved ${dates.length} days of price data for ${ticker}`);
    
    // Begin transaction for faster inserts
    await dbRun('BEGIN TRANSACTION');
    
    try {
      const insertStatement = `
        INSERT INTO stock_prices (ticker, date, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      // Prepare insert statement
      const stmt = db.prepare(insertStatement);
      const stmtRun = promisify(stmt.run.bind(stmt));
      
      for (const date of dates) {
        const entry = timeSeries[date];
        await stmtRun([
          ticker,
          date,
          parseFloat(entry['1. open']),
          parseFloat(entry['2. high']),
          parseFloat(entry['3. low']),
          parseFloat(entry['4. close']),
          parseInt(entry['5. volume'], 10)
        ]);
      }
      
      // Finalize statement
      await promisify(stmt.finalize.bind(stmt))();
      
      // Commit transaction
      await dbRun('COMMIT');
      
      console.log(`Successfully stored ${dates.length} records for ${ticker} in database`);
      
      // Format data for TradingView chart and return
      const formattedData = dates.map(date => {
        const entry = timeSeries[date];
        return {
          time: new Date(date).getTime() / 1000, // Convert to Unix timestamp in seconds
          open: parseFloat(entry['1. open']),
          high: parseFloat(entry['2. high']),
          low: parseFloat(entry['3. low']),
          close: parseFloat(entry['4. close']),
          volume: parseInt(entry['5. volume'], 10)
        };
      });
      
      return formattedData;
    } catch (error) {
      // Rollback transaction on error
      await dbRun('ROLLBACK');
      throw error;
    }
  } catch (error) {
    // Handle API errors gracefully
    console.error(`Error fetching data for ${ticker} from Alpha Vantage:`, error.message);
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
    }
    
    throw new Error(`Failed to fetch data for ${ticker}: ${error.message}`);
  }
}

/**
 * Update stock data for a ticker that already exists in the database
 * Only fetches and adds new data since the last update
 * @param {string} ticker - The stock ticker symbol
 * @returns {Promise<boolean>} - True if updated successfully
 */
async function updateExistingStockData(ticker) {
  try {
    // Check if ticker exists
    const exists = await tickerExistsInDatabase(ticker);
    if (!exists) {
      console.log(`Ticker ${ticker} not found in database. Use fetchAndStoreStockData instead.`);
      return false;
    }
    
    // Get the latest date we have data for
    const query = 'SELECT MAX(date) as latestDate FROM stock_prices WHERE ticker = ?';
    const row = await dbGet(query, [ticker]);
    
    if (!row || !row.latestDate) {
      console.error(`Error finding latest date for ${ticker}`);
      return false;
    }
    
    const latestDate = new Date(row.latestDate);
    const today = new Date();
    
    // If latest data is from today or yesterday, no need to update
    const dayDiff = Math.floor((today - latestDate) / (1000 * 60 * 60 * 24));
    if (dayDiff < 1) {
      console.log(`Data for ${ticker} is already up to date (latest: ${row.latestDate})`);
      return true;
    }
    
    console.log(`Updating data for ${ticker}. Latest data from: ${row.latestDate}`);
    
    // Fetch new data and merge with existing data
    await fetchAndStoreStockData(ticker);
    return true;
  } catch (error) {
    console.error(`Error updating stock data for ${ticker}:`, error.message);
    return false;
  }
}

module.exports = {
  fetchAndStoreStockData,
  tickerExistsInDatabase,
  updateExistingStockData
}; 
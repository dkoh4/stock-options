/**
 * Option Chain Calculator
 * Calculates option prices based on the Black-Scholes model
 */

// Constants
const DAYS_PER_YEAR = 365;

/**
 * Calculate standard normal cumulative distribution function
 * @param {number} x - Input value
 * @returns {number} - CDF value
 */
function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) {
    prob = 1 - prob;
  }
  return prob;
}

/**
 * Calculate the Black-Scholes option price
 * @param {string} type - Option type: 'call' or 'put'
 * @param {number} S - Current stock price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiration in years
 * @param {number} r - Risk-free interest rate (as a decimal)
 * @param {number} v - Volatility (as a decimal)
 * @returns {number} - Option price
 */
function blackScholes(type, S, K, T, r, v) {
  // Input validation
  if (S <= 0) throw new Error('Stock price must be positive');
  if (K <= 0) throw new Error('Strike price must be positive');
  if (T <= 0) throw new Error('Time to expiration must be positive');
  if (v <= 0) throw new Error('Volatility must be positive');
  
  // Handle very small expiration times to prevent NaN
  if (T < 0.00001) {
    if (type === 'call') {
      return Math.max(0, S - K);
    } else {
      return Math.max(0, K - S);
    }
  }
  
  // Calculate d1 and d2
  const d1 = (Math.log(S / K) + (r + v * v / 2) * T) / (v * Math.sqrt(T));
  const d2 = d1 - v * Math.sqrt(T);
  
  // Calculate option price based on type
  if (type === 'call') {
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } else if (type === 'put') {
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  } else {
    throw new Error('Invalid option type. Use "call" or "put".');
  }
}

/**
 * Calculate implied volatility using the Newton-Raphson method
 * @param {string} type - Option type: 'call' or 'put'
 * @param {number} marketPrice - Market price of the option
 * @param {number} S - Current stock price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiration in years
 * @param {number} r - Risk-free interest rate (as a decimal)
 * @returns {number} - Implied volatility
 */
function impliedVolatility(type, marketPrice, S, K, T, r) {
  let v = 0.3; // Initial guess
  const PRECISION = 0.00001;
  const MAX_ITERATIONS = 100;
  
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const price = blackScholes(type, S, K, T, r, v);
    const diff = marketPrice - price;
    
    if (Math.abs(diff) < PRECISION) {
      return v;
    }
    
    // Calculate vega (derivative of price with respect to volatility)
    const d1 = (Math.log(S / K) + (r + v * v / 2) * T) / (v * Math.sqrt(T));
    const vega = S * Math.sqrt(T) * 0.3989423 * Math.exp(-d1 * d1 / 2);
    
    // Update volatility using Newton-Raphson
    v = v + diff / vega;
    
    // Ensure volatility stays positive
    if (v <= 0) {
      v = 0.001;
    }
  }
  
  // If we reached maximum iterations without converging
  return v;
}

/**
 * Calculate historical volatility from price data
 * @param {Array} prices - Array of closing prices
 * @param {number} period - Number of days to use for calculation
 * @returns {number} - Annualized volatility
 */
function calculateHistoricalVolatility(prices, period = 30) {
  // Error handling for insufficient data
  if (!prices || !Array.isArray(prices)) {
    throw new Error('Prices must be an array');
  }
  
  // Use available data if less than requested period
  const actualPeriod = Math.min(period, prices.length - 1);
  
  if (prices.length < 2) {
    // If not enough data for volatility calculation, return a default value
    console.warn('Insufficient price data for volatility calculation, using default value');
    return 0.3; // 30% volatility as a reasonable default
  }
  
  // Calculate daily returns
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    // Check for valid data
    if (prices[i] <= 0 || prices[i-1] <= 0) {
      console.warn('Invalid price data detected, skipping');
      continue;
    }
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  if (returns.length === 0) {
    console.warn('No valid returns calculated, using default volatility');
    return 0.3;
  }
  
  // Calculate standard deviation of returns
  const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
  const variance = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length;
  const dailyVolatility = Math.sqrt(variance);
  
  // Annualize the volatility
  return dailyVolatility * Math.sqrt(DAYS_PER_YEAR);
}

/**
 * Generate an option chain with various strikes and expirations
 * @param {number} currentPrice - Current stock price
 * @param {number} volatility - Historical volatility
 * @param {number} riskFreeRate - Risk-free interest rate (as a decimal)
 * @param {Array} daysToExpiration - Array of days to expiration
 * @param {number} strikePriceCount - Number of strike prices to generate
 * @param {number} strikePriceStep - Step size between strike prices
 * @returns {Object} - Option chain with calls and puts
 */
function generateOptionChain(currentPrice, volatility, riskFreeRate, daysToExpiration, strikePriceCount = 10, strikePriceStep = 5) {
  // Input validation
  if (currentPrice <= 0) {
    throw new Error('Current price must be positive');
  }
  
  // Ensure volatility is positive and reasonable
  if (volatility <= 0 || !isFinite(volatility)) {
    console.warn('Invalid volatility value, using default');
    volatility = 0.3; // Default to 30% if volatility calculation failed
  }
  
  // Cap volatility at a reasonable maximum
  if (volatility > 2) {
    console.warn('Unusually high volatility capped at 200%');
    volatility = 2; // Cap at 200%
  }

  const optionChain = {};
  
  // Calculate strike prices (centered around current price)
  const strikes = [];
  const baseStrike = Math.round(currentPrice / strikePriceStep) * strikePriceStep; // Round to nearest step
  
  for (let i = -Math.floor(strikePriceCount / 2); i <= Math.floor(strikePriceCount / 2); i++) {
    strikes.push(baseStrike + i * strikePriceStep);
  }
  
  // Generate option data for each expiration date
  daysToExpiration.forEach(days => {
    const expiry = days;
    const timeToExpiry = days / DAYS_PER_YEAR;
    
    const expiryData = {
      calls: [],
      puts: []
    };
    
    // Calculate option prices for each strike
    strikes.forEach(strike => {
      try {
        const callPrice = blackScholes('call', currentPrice, strike, timeToExpiry, riskFreeRate, volatility);
        const putPrice = blackScholes('put', currentPrice, strike, timeToExpiry, riskFreeRate, volatility);
        
        // Calculate Greeks
        const d1 = (Math.log(currentPrice / strike) + (riskFreeRate + volatility * volatility / 2) * timeToExpiry) / (volatility * Math.sqrt(timeToExpiry));
        const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
        
        const callDelta = normalCDF(d1);
        const putDelta = callDelta - 1;
        
        const gamma = 0.3989423 * Math.exp(-d1 * d1 / 2) / (currentPrice * volatility * Math.sqrt(timeToExpiry));
        
        const theta = -currentPrice * volatility * 0.3989423 * Math.exp(-d1 * d1 / 2) / (2 * Math.sqrt(timeToExpiry)) 
          - riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiry);
        const callTheta = theta / DAYS_PER_YEAR;
        const putTheta = (theta + riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiry)) / DAYS_PER_YEAR;
        
        const vega = currentPrice * Math.sqrt(timeToExpiry) * 0.3989423 * Math.exp(-d1 * d1 / 2) / 100; // Divided by 100 to get per 1% change
        
        const callRho = strike * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(d2) / 100; // Divided by 100 to get per 1% change
        const putRho = -strike * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(-d2) / 100;
        
        // Add call option
        expiryData.calls.push({
          strike,
          price: callPrice,
          delta: callDelta,
          gamma,
          theta: callTheta,
          vega,
          rho: callRho,
          inTheMoney: currentPrice > strike
        });
        
        // Add put option
        expiryData.puts.push({
          strike,
          price: putPrice,
          delta: putDelta,
          gamma,
          theta: putTheta,
          vega,
          rho: putRho,
          inTheMoney: currentPrice < strike
        });
      } catch (error) {
        console.error(`Error calculating option for strike ${strike}: ${error.message}`);
        // Add placeholder data to avoid breaking the chain
        expiryData.calls.push({
          strike,
          price: 0,
          delta: 0,
          gamma: 0,
          theta: 0,
          vega: 0,
          rho: 0,
          inTheMoney: false
        });
        
        expiryData.puts.push({
          strike,
          price: 0,
          delta: 0,
          gamma: 0,
          theta: 0,
          vega: 0,
          rho: 0,
          inTheMoney: false
        });
      }
    });
    
    optionChain[expiry] = expiryData;
  });
  
  return optionChain;
}

module.exports = {
  blackScholes,
  impliedVolatility,
  calculateHistoricalVolatility,
  generateOptionChain,
  normalCDF
}; 
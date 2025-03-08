const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// Process command line arguments
const args = process.argv.slice(2);
const DEFAULT_TICKER = 'SPY';
const DEFAULT_FILE_PATH = path.join(__dirname, '../../SPY-daily.csv');

// Get file path and ticker from arguments or use defaults
const filePath = args[0] || DEFAULT_FILE_PATH;
const ticker = args[1] || (args[0] ? path.basename(filePath).split('-')[0] : DEFAULT_TICKER);
const shouldReplace = args[2] === '--replace'; // Add an option to replace existing data

console.log(`Initializing database with file: ${filePath}`);
console.log(`Using ticker symbol: ${ticker}`);
console.log(`Replace existing data: ${shouldReplace ? 'Yes' : 'No'}`);

// Check if file exists
if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found: ${filePath}`);
  process.exit(1);
}

// Create the database file
const dbPath = path.join(__dirname, 'stockdata.db');
const db = new sqlite3.Database(dbPath);

// Prepare database
db.serialize(() => {
  // Check if table exists, if not create it
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_prices'", (err, row) => {
    if (err) {
      console.error('Error checking for table:', err);
      db.close();
      process.exit(1);
    }
    
    // Create table if it doesn't exist
    if (!row) {
      console.log('Creating new stock_prices table');
      db.run(`CREATE TABLE stock_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        date DATETIME NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume INTEGER NOT NULL,
        UNIQUE(ticker, date)
      )`);
    } else {
      console.log('Table stock_prices already exists');
    }
    
    // If replace option is specified, delete existing records for this ticker
    if (shouldReplace) {
      console.log(`Removing existing data for ticker: ${ticker}`);
      db.run(`DELETE FROM stock_prices WHERE ticker = ?`, [ticker], function(err) {
        if (err) {
          console.error('Error deleting existing data:', err);
        } else {
          console.log(`Deleted ${this.changes} existing records for ${ticker}`);
        }
        processCSV();
      });
    } else {
      processCSV();
    }

    function processCSV() {
      console.log('Processing CSV file...');
      
      // Read all rows from the CSV first
      const rows = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          if (row.Date && row.Date !== 'Date') {
            rows.push(row);
          }
        })
        .on('end', () => {
          console.log(`Read ${rows.length} rows from CSV.`);
          importData(rows);
        })
        .on('error', (err) => {
          console.error('Error reading CSV file:', err);
          db.close();
        });
    }

    function importData(rows) {
      console.log('Starting data import...');
      let insertCount = 0;
      let skipCount = 0;
      let updateCount = 0;
      let errorCount = 0;
      
      // Begin transaction for better performance
      db.run('BEGIN TRANSACTION');
      
      // Process rows one by one
      processNextRow(0);
      
      function processNextRow(index) {
        if (index >= rows.length) {
          // All rows processed
          db.run('COMMIT', (err) => {
            if (err) {
              console.error('Error committing transaction:', err);
              db.run('ROLLBACK');
            }
            console.log(`Data import complete.`);
            console.log(`Inserted: ${insertCount}, Updated: ${updateCount}, Skipped: ${skipCount}, Errors: ${errorCount}`);
            
            // Create index if it doesn't exist
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_date ON stock_prices (ticker, date)`, () => {
              db.close((err) => {
                if (err) {
                  console.error('Error closing database:', err.message);
                } else {
                  console.log('Database connection closed.');
                }
              });
            });
          });
          return;
        }
        
        const row = rows[index];
        
        try {
          // Parse date from format MM/DD/YYYY to YYYY-MM-DD
          const dateParts = row.Date.split('/');
          if (dateParts.length !== 3) {
            console.warn(`Invalid date format: ${row.Date}`);
            skipCount++;
            processNextRow(index + 1);
            return;
          }
          
          // Convert MM/DD/YYYY to YYYY-MM-DD (SQLite Date format)
          const dateStr = `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
          
          // Get values, handling different column naming conventions
          const openValue = parseFloat(row.Open);
          const highValue = parseFloat(row.High);
          const lowValue = parseFloat(row.Low);
          const closeValue = parseFloat(row['Close/Last']);
          const volumeValue = parseInt(row.Volume, 10);
          
          // Validate values
          if (isNaN(openValue) || isNaN(highValue) || isNaN(lowValue) || isNaN(closeValue) || isNaN(volumeValue)) {
            console.warn(`Skipping invalid data row: ${row.Date}`);
            skipCount++;
            processNextRow(index + 1);
            return;
          }
          
          // Use INSERT OR REPLACE to handle duplicates
          const sql = `INSERT OR REPLACE INTO stock_prices (ticker, date, open, high, low, close, volume) 
                       VALUES (?, ?, ?, ?, ?, ?, ?)`;
          
          db.run(sql, [
            ticker,
            dateStr,
            openValue,
            highValue,
            lowValue,
            closeValue,
            volumeValue
          ], function(err) {
            if (err) {
              console.error(`Error inserting record for ${dateStr}:`, err);
              errorCount++;
            } else {
              if (this.changes > 0) {
                insertCount++;
              } else {
                skipCount++;
              }
            }
            // Process next row
            processNextRow(index + 1);
          });
        } catch (error) {
          console.error(`Error processing row ${index}:`, error);
          errorCount++;
          processNextRow(index + 1);
        }
      }
    }
  });
});

console.log('Database initialization started...');
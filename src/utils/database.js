import initSqlJs from 'sql.js';

let db = null;
let SQL = null;

// Initialize SQL.js and database
export async function initDatabase() {
  if (db) return db;

  // Initialize SQL.js
  SQL = await initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`
  });

  // Try to load existing database from localStorage or create new one
  const savedDb = localStorage.getItem('alpharise_db');
  
  if (savedDb) {
    try {
      const buffer = Uint8Array.from(atob(savedDb), c => c.charCodeAt(0));
      db = new SQL.Database(buffer);
      console.log('Loaded existing database from localStorage');
    } catch (err) {
      console.warn('Failed to load database from localStorage, creating new one:', err);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  // Initialize schema
  initSchema();
  
  return db;
}

// Initialize database schema
function initSchema() {
  if (!db) return;

  db.run(`
    CREATE TABLE IF NOT EXISTS market_data (
      date TEXT PRIMARY KEY,
      price REAL NOT NULL,
      cbbi INTEGER NOT NULL,
      ema20 REAL,
      ema50 REAL,
      ema100 REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_analysis (
      date TEXT PRIMARY KEY,
      zone INTEGER NOT NULL,
      tier INTEGER,
      recommendation TEXT,
      price_vs_ema20 REAL,
      price_vs_ema50 REAL,
      price_vs_ema100 REAL,
      cbbi_category TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (date) REFERENCES market_data(date)
    )
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_market_data_date ON market_data(date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_daily_analysis_date ON daily_analysis(date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_daily_analysis_zone ON daily_analysis(zone)`);

  // Save to localStorage
  saveDatabase();
}

// Save database to localStorage
export function saveDatabase() {
  if (!db) return;
  
  try {
    const data = db.export();
    // Convert Uint8Array to base64 for browser compatibility
    const binary = String.fromCharCode.apply(null, data);
    const base64 = btoa(binary);
    localStorage.setItem('alpharise_db', base64);
  } catch (err) {
    console.error('Failed to save database:', err);
  }
}

// Upsert market data (insert or update)
export function upsertMarketData(dataArray) {
  if (!db) {
    console.error('Database not initialized');
    return;
  }

  const stmt = db.prepare(`
    INSERT INTO market_data (date, price, cbbi, ema20, ema50, ema100, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET
      price = excluded.price,
      cbbi = excluded.cbbi,
      ema20 = excluded.ema20,
      ema50 = excluded.ema50,
      ema100 = excluded.ema100,
      updated_at = datetime('now')
  `);

  // Use transaction for better performance
  db.run('BEGIN TRANSACTION');
  
  try {
    for (const row of dataArray) {
      stmt.run([
        row.date,
        row.price,
        row.cbbi,
        row.ema20 || null,
        row.ema50 || null,
        row.ema100 || null
      ]);
    }
    db.run('COMMIT');
    stmt.free();
    
    // Save to localStorage
    saveDatabase();
  } catch (err) {
    db.run('ROLLBACK');
    stmt.free();
    throw err;
  }
}

// Store daily analysis
export function upsertDailyAnalysis(date, zone, recommendation, metrics, tier = null) {
  if (!db) {
    console.error('Database not initialized');
    return;
  }

  const stmt = db.prepare(`
    INSERT INTO daily_analysis (
      date, zone, tier, recommendation,
      price_vs_ema20, price_vs_ema50, price_vs_ema100, cbbi_category
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      zone = excluded.zone,
      tier = excluded.tier,
      recommendation = excluded.recommendation,
      price_vs_ema20 = excluded.price_vs_ema20,
      price_vs_ema50 = excluded.price_vs_ema50,
      price_vs_ema100 = excluded.price_vs_ema100,
      cbbi_category = excluded.cbbi_category
  `);

  stmt.run([
    date,
    zone,
    tier,
    recommendation,
    metrics.price_vs_ema20 || null,
    metrics.price_vs_ema50 || null,
    metrics.price_vs_ema100 || null,
    metrics.cbbi_category || null
  ]);

  stmt.free();
  saveDatabase();
}

// Query market data
export function getMarketData(startDate = '2000-01-01', endDate = '2099-12-31') {
  if (!db) {
    console.error('Database not initialized');
    return [];
  }

  const stmt = db.prepare(`
    SELECT * FROM market_data
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `);

  stmt.bind([startDate, endDate]);
  
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      date: row.date,
      price: row.price,
      cbbi: row.cbbi,
      ema20: row.ema20,
      ema50: row.ema50,
      ema100: row.ema100
    });
  }

  stmt.free();
  return results;
}

// Get latest market data
export function getLatestMarketData(limit = 1) {
  if (!db) {
    console.error('Database not initialized');
    return [];
  }

  const stmt = db.prepare(`
    SELECT * FROM market_data
    ORDER BY date DESC
    LIMIT ?
  `);

  stmt.bind([limit]);
  
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      date: row.date,
      price: row.price,
      cbbi: row.cbbi,
      ema20: row.ema20,
      ema50: row.ema50,
      ema100: row.ema100
    });
  }

  stmt.free();
  return results;
}

// Get daily analysis with market data
export function getDailyAnalysis(startDate = '2000-01-01', endDate = '2099-12-31') {
  if (!db) {
    console.error('Database not initialized');
    return [];
  }

  const stmt = db.prepare(`
    SELECT 
      da.date,
      da.zone,
      da.tier,
      da.recommendation,
      da.price_vs_ema20,
      da.price_vs_ema50,
      da.price_vs_ema100,
      da.cbbi_category,
      md.price,
      md.cbbi,
      md.ema20,
      md.ema50,
      md.ema100
    FROM daily_analysis da
    JOIN market_data md ON da.date = md.date
    WHERE da.date >= ? AND da.date <= ?
    ORDER BY da.date ASC
  `);

  stmt.bind([startDate, endDate]);
  
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      date: row.date,
      zone: row.zone,
      tier: row.tier,
      recommendation: row.recommendation,
      metrics: {
        price_vs_ema20: row.price_vs_ema20,
        price_vs_ema50: row.price_vs_ema50,
        price_vs_ema100: row.price_vs_ema100,
        cbbi_category: row.cbbi_category
      },
      marketData: {
        price: row.price,
        cbbi: row.cbbi,
        ema20: row.ema20,
        ema50: row.ema50,
        ema100: row.ema100
      }
    });
  }

  stmt.free();
  return results;
}

// Get database statistics
export function getDatabaseStats() {
  if (!db) {
    return { marketDataCount: 0, analysisCount: 0 };
  }

  const marketDataCount = db.exec("SELECT COUNT(*) as count FROM market_data")[0]?.values[0]?.[0] || 0;
  const analysisCount = db.exec("SELECT COUNT(*) as count FROM daily_analysis")[0]?.values[0]?.[0] || 0;
  
  return {
    marketDataCount,
    analysisCount
  };
}

// Export database as downloadable file (returns Uint8Array)
export function exportDatabase() {
  if (!db) return null;
  
  return db.export();
}

// Clear database (for testing/reset)
export function clearDatabase() {
  if (!db) return;
  
  db.run('DELETE FROM daily_analysis');
  db.run('DELETE FROM market_data');
  saveDatabase();
}

// Export utility functions

// Convert array of objects to CSV string
function arrayToCSV(data) {
  if (!data || data.length === 0) return '';
  
  // Get headers from first object (handle nested objects)
  const headers = [];
  const flatData = data.map(item => {
    const flat = {};
    Object.keys(item).forEach(key => {
      if (typeof item[key] === 'object' && item[key] !== null) {
        // Flatten nested objects
        Object.keys(item[key]).forEach(nestedKey => {
          const flatKey = `${key}_${nestedKey}`;
          headers.push(flatKey);
          flat[flatKey] = item[key][nestedKey];
        });
      } else {
        headers.push(key);
        flat[key] = item[key];
      }
    });
    return flat;
  });
  
  // Get all unique headers
  const allHeaders = [...new Set(headers)];
  
  // Create CSV rows
  const csvRows = [
    allHeaders.join(','), // Header row
    ...flatData.map(row => 
      allHeaders.map(header => {
        const value = row[header];
        // Handle null/undefined and escape commas/quotes
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ];
  
  return csvRows.join('\n');
}

// Download file helper
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export market data as CSV
export async function exportMarketDataCSV(startDate = '2000-01-01', endDate = '2099-12-31') {
  // Ensure database is initialized
  if (!db) {
    await initDatabase();
  }
  
  const data = getMarketData(startDate, endDate);
  if (data.length === 0) {
    alert('No market data available for the selected date range.');
    return;
  }
  const csv = arrayToCSV(data);
  const filename = `market_data_${startDate}_to_${endDate}.csv`;
  downloadFile(csv, filename, 'text/csv');
}

// Export market data as JSON
export async function exportMarketDataJSON(startDate = '2000-01-01', endDate = '2099-12-31') {
  // Ensure database is initialized
  if (!db) {
    await initDatabase();
  }
  
  const data = getMarketData(startDate, endDate);
  if (data.length === 0) {
    alert('No market data available for the selected date range.');
    return;
  }
  const json = JSON.stringify(data, null, 2);
  const filename = `market_data_${startDate}_to_${endDate}.json`;
  downloadFile(json, filename, 'application/json');
}

// Export daily analysis as CSV (flattened)
export async function exportDailyAnalysisCSV(startDate = '2000-01-01', endDate = '2099-12-31', t1 = 60, t3 = 74, onProgress = null) {
  // Ensure database is initialized
  if (!db) {
    await initDatabase();
  }
  
  // Check if analysis exists for this date range
  let data = getDailyAnalysis(startDate, endDate);
  
  // If no data, calculate it now with current t1/t3 values
  if (data.length === 0) {
    if (onProgress) onProgress({ message: 'Calculating daily analysis...', progress: 0 });
    
    // Get market data for the date range
    const marketData = getMarketData(startDate, endDate);
    
    if (marketData.length === 0) {
      alert('No market data available for the selected date range.');
      return;
    }
    
    // Calculate analysis with progress updates
    const { calculateAndStoreDailyAnalysis } = await import('./analysis');
    
    if (onProgress) {
      onProgress({ message: `Processing ${marketData.length} records...`, progress: 30 });
    }
    
    await calculateAndStoreDailyAnalysis(marketData, t1, t3);
    
    if (onProgress) {
      onProgress({ message: 'Finalizing export...', progress: 80 });
    }
    
    // Get the newly calculated data
    data = getDailyAnalysis(startDate, endDate);
  }
  
  if (data.length === 0) {
    alert('No daily analysis data available for the selected date range.');
    return;
  }
  
  if (onProgress) {
    onProgress({ message: 'Preparing CSV file...', progress: 90 });
  }
  
  // Flatten the nested structure for CSV
  const flattened = data.map(item => ({
    date: item.date,
    zone: item.zone,
    tier: item.tier,
    recommendation: item.recommendation,
    price_vs_ema20: item.metrics?.price_vs_ema20,
    price_vs_ema50: item.metrics?.price_vs_ema50,
    price_vs_ema100: item.metrics?.price_vs_ema100,
    cbbi_category: item.metrics?.cbbi_category,
    price: item.marketData?.price,
    cbbi: item.marketData?.cbbi,
    ema20: item.marketData?.ema20,
    ema50: item.marketData?.ema50,
    ema100: item.marketData?.ema100
  }));
  
  const csv = arrayToCSV(flattened);
  const filename = `daily_analysis_${startDate}_to_${endDate}.csv`;
  
  if (onProgress) {
    onProgress({ message: 'Exporting...', progress: 100 });
  }
  
  downloadFile(csv, filename, 'text/csv');
}

// Export daily analysis as JSON
export async function exportDailyAnalysisJSON(startDate = '2000-01-01', endDate = '2099-12-31', t1 = 60, t3 = 74, onProgress = null) {
  // Ensure database is initialized
  if (!db) {
    await initDatabase();
  }
  
  // Check if analysis exists for this date range
  let data = getDailyAnalysis(startDate, endDate);
  
  // If no data, calculate it now with current t1/t3 values
  if (data.length === 0) {
    if (onProgress) onProgress({ message: 'Calculating daily analysis...', progress: 0 });
    
    // Get market data for the date range
    const marketData = getMarketData(startDate, endDate);
    
    if (marketData.length === 0) {
      alert('No market data available for the selected date range.');
      return;
    }
    
    // Calculate analysis with progress updates
    const { calculateAndStoreDailyAnalysis } = await import('./analysis');
    
    if (onProgress) {
      onProgress({ message: `Processing ${marketData.length} records...`, progress: 30 });
    }
    
    await calculateAndStoreDailyAnalysis(marketData, t1, t3);
    
    if (onProgress) {
      onProgress({ message: 'Finalizing export...', progress: 80 });
    }
    
    // Get the newly calculated data
    data = getDailyAnalysis(startDate, endDate);
  }
  
  if (data.length === 0) {
    alert('No daily analysis data available for the selected date range.');
    return;
  }
  
  if (onProgress) {
    onProgress({ message: 'Preparing JSON file...', progress: 90 });
  }
  
  const json = JSON.stringify(data, null, 2);
  const filename = `daily_analysis_${startDate}_to_${endDate}.json`;
  
  if (onProgress) {
    onProgress({ message: 'Exporting...', progress: 100 });
  }
  
  downloadFile(json, filename, 'application/json');
}

export default db;


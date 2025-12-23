import { 
  initDatabase, 
  upsertMarketData, 
  getMarketData, 
  getLatestMarketData 
} from './database';

// Calculate EMAs
function calcEMA(arr, n) {
  const k = 2 / (n + 1);
  let ema = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += arr[i];
  ema[n - 1] = sum / n;
  for (let i = n; i < arr.length; i++) {
    ema[i] = (arr[i] * k) + (ema[i - 1] * (1 - k));
  }
  return ema;
}

// Fetch raw data from API with fallback mechanisms
async function fetchFromAPI() {
  const URL = 'https://colintalkscrypto.com/cbbi/data/latest.json';
  
  // Browser-like headers to avoid 406/403 errors
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://colintalkscrypto.com/',
    'Origin': 'https://colintalkscrypto.com'
  };

  let rawResponse;
  
  try {
    // Strategy 1: Try direct fetch first
    console.log('Attempting direct fetch from CBBI API...');
    rawResponse = await fetch(URL, { 
      headers,
      mode: 'cors',
      credentials: 'omit'
    });
    
    if (!rawResponse.ok) {
      throw new Error(`Direct fetch failed with status ${rawResponse.status}`);
    }
    
    console.log('✅ Direct fetch successful');
  } catch (directError) {
    console.warn('Direct fetch failed:', directError.message);
    
    try {
      // Strategy 2: Try CORS proxy
      console.log('Falling back to CORS proxy...');
      const PROXY = 'https://corsproxy.io/?';
      rawResponse = await fetch(PROXY + encodeURIComponent(URL), {
        headers,
        mode: 'cors'
      });
      
      if (!rawResponse.ok) {
        throw new Error(`CORS proxy failed with status ${rawResponse.status}`);
      }
      
      console.log('✅ CORS proxy fetch successful');
    } catch (proxyError) {
      console.error('CORS proxy also failed:', proxyError.message);
      
      try {
        // Strategy 3: Try alternative CORS proxy
        console.log('Trying alternative CORS proxy (allorigins.win)...');
        const ALT_PROXY = 'https://api.allorigins.win/raw?url=';
        rawResponse = await fetch(ALT_PROXY + encodeURIComponent(URL));
        
        if (!rawResponse.ok) {
          throw new Error(`Alternative proxy failed with status ${rawResponse.status}`);
        }
        
        console.log('✅ Alternative proxy fetch successful');
      } catch (altProxyError) {
        console.error('All fetch strategies failed:', altProxyError.message);
        return [];
      }
    }
  }

  try {
    const data = await rawResponse.json();

    const prices = data.Price || data.BTC || {};
    const confidence = data.Confidence || data.CBBI || {};

    let rawData = [];
    Object.keys(prices).sort((a, b) => a - b).forEach(ts => {
      let t = parseInt(ts);
      if (t < 10000000000) t *= 1000;
      const dateStr = new Date(t).toISOString().split('T')[0];
      let c = confidence[ts];
      if (c <= 1) c = Math.round(c * 100);
      if (!c) c = 50;
      rawData.push({ date: dateStr, price: prices[ts], cbbi: c });
    });

    const pArr = rawData.map(d => d.price);
    const e20 = calcEMA(pArr, 20);
    const e50 = calcEMA(pArr, 50);
    const e100 = calcEMA(pArr, 100);

    return rawData.map((d, i) => ({
      ...d,
      ema20: e20[i] || d.price,
      ema50: e50[i] || d.price,
      ema100: e100[i] || d.price
    })).filter(d => d.price > 0);

  } catch (parseError) {
    console.error('Error parsing API response:', parseError);
    return [];
  }
}

// Main function to fetch data (with database integration)
export async function fetchRealData() {
  try {
    // Initialize database
    await initDatabase();

    // Fetch latest data from API
    const apiData = await fetchFromAPI();
    
    if (apiData.length > 0) {
      // Store/update in database
      upsertMarketData(apiData);
      console.log(`Stored ${apiData.length} records in database`);
      // Note: Daily analysis is now calculated on-demand during export only
      // This improves performance by not recalculating on every data load
    }

    // Get all data from database (or return API data if database is empty)
    const dbData = getMarketData();
    
    // Return database data if available, otherwise return API data
    return dbData.length > 0 ? dbData : apiData;

  } catch (err) {
    console.error('Error in fetchRealData:', err);
    // Fallback to API only
    return await fetchFromAPI();
  }
}

// ETL function to run periodically (can be called manually or via cron)
export async function runETL() {
  console.log('Running ETL process...');
  try {
    await initDatabase();
    const apiData = await fetchFromAPI();
    
    if (apiData.length > 0) {
      upsertMarketData(apiData);
      console.log(`ETL completed: Updated ${apiData.length} records`);
      return { success: true, recordsUpdated: apiData.length };
    }
    
    return { success: true, recordsUpdated: 0 };
  } catch (err) {
    console.error('ETL error:', err);
    return { success: false, error: err.message };
  }
}

// Get data from database only (no API call)
export function getDataFromDatabase(startDate = '2000-01-01', endDate = '2099-12-31') {
  return getMarketData(startDate, endDate);
}



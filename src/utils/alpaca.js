// Alpaca Trading API Integration
// Uses Alpaca REST API for browser-based trading

const ALPACA_BASE_URL = 'https://paper-api.alpaca.markets'; // Paper trading URL
const API_KEY = import.meta.env.VITE_ALPACA_API_KEY || '';
const SECRET_KEY = import.meta.env.VITE_ALPACA_SECRET_KEY || '';
const EXPECTED_ACCOUNT_ID = import.meta.env.VITE_ALPACA_ACCOUNT_ID || ''; // Optional: verify account ID

// Debug: Log env var status (remove in production)
if (import.meta.env.DEV) {
  console.log('Alpaca API Key loaded:', API_KEY ? `${API_KEY.substring(0, 8)}...` : 'NOT FOUND');
  console.log('Alpaca Secret loaded:', SECRET_KEY ? `${SECRET_KEY.substring(0, 8)}...` : 'NOT FOUND');
}

// Helper to create authenticated headers
function getHeaders() {
  return {
    'APCA-API-KEY-ID': API_KEY,
    'APCA-API-SECRET-KEY': SECRET_KEY,
    'Content-Type': 'application/json'
  };
}

/**
 * Test Alpaca API connection
 */
export async function testAlpacaConnection() {
  if (!API_KEY || !SECRET_KEY) {
    return {
      success: false,
      error: 'Alpaca API credentials not configured. Please set VITE_ALPACA_API_KEY and VITE_ALPACA_SECRET_KEY in your .env file.'
    };
  }

  try {
    const response = await fetch(`${ALPACA_BASE_URL}/v2/account`, {
      method: 'GET',
      headers: getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      return {
        success: false,
        error: `API Error: ${errorData.message || response.statusText}`
      };
    }

    const account = await response.json();
    const accountNumber = account.account_number || account.id;
    const accountMatches = EXPECTED_ACCOUNT_ID ? accountNumber === EXPECTED_ACCOUNT_ID : true;
    
    return {
      success: true,
      account: {
        accountNumber: accountNumber, // This is the account ID
        id: account.id, // Alternative account identifier
        cash: parseFloat(account.cash),
        buyingPower: parseFloat(account.buying_power),
        portfolioValue: parseFloat(account.portfolio_value),
        equity: parseFloat(account.equity),
        status: account.status,
        tradingBlocked: account.trading_blocked,
        accountBlocked: account.account_blocked,
        accountMatches: accountMatches, // Whether account matches expected
        expectedAccountId: EXPECTED_ACCOUNT_ID || null
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Connection error: ${error.message}`
    };
  }
}

/**
 * Get current positions
 */
export async function getPositions() {
  try {
    const response = await fetch(`${ALPACA_BASE_URL}/v2/positions`, {
      method: 'GET',
      headers: getHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch positions: ${response.statusText}`);
    }

    const positions = await response.json();
    return { success: true, positions };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get BTC position specifically
 */
export async function getBTCPosition() {
  const result = await getPositions();
  if (!result.success) return result;

  // Alpaca crypto symbols might be BTCUSD or BTC/USD depending on asset class
  const btcPosition = result.positions.find(
    p => p.symbol === 'BTCUSD' || p.symbol === 'BTC/USD' || p.symbol.includes('BTC')
  );

  if (!btcPosition) {
    return { success: true, position: null, qty: 0 };
  }

  return {
    success: true,
    position: btcPosition,
    qty: parseFloat(btcPosition.qty)
  };
}

/**
 * Place a market buy order (notional - dollar amount)
 */
export async function placeBuyOrder(symbol, notional, dryRun = true) {
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      message: `DRY RUN: Would buy $${notional.toFixed(2)} of ${symbol}`
    };
  }

  if (!API_KEY || !SECRET_KEY) {
    return {
      success: false,
      error: 'Alpaca API credentials not configured'
    };
  }

  try {
    const response = await fetch(`${ALPACA_BASE_URL}/v2/orders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        symbol: symbol,
        qty: null,
        notional: notional.toFixed(2),
        side: 'buy',
        type: 'market',
        time_in_force: 'day'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      return {
        success: false,
        error: `Order failed: ${errorData.message || response.statusText}`
      };
    }

    const order = await response.json();
    return {
      success: true,
      order: {
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        qty: order.filled_qty,
        status: order.status
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Order error: ${error.message}`
    };
  }
}

/**
 * Place a market sell order (quantity)
 */
export async function placeSellOrder(symbol, qty, dryRun = true) {
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      message: `DRY RUN: Would sell ${qty.toFixed(6)} ${symbol}`
    };
  }

  if (!API_KEY || !SECRET_KEY) {
    return {
      success: false,
      error: 'Alpaca API credentials not configured'
    };
  }

  try {
    const response = await fetch(`${ALPACA_BASE_URL}/v2/orders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        symbol: symbol,
        qty: qty.toFixed(6),
        side: 'sell',
        type: 'market',
        time_in_force: 'day'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      return {
        success: false,
        error: `Order failed: ${errorData.message || response.statusText}`
      };
    }

    const order = await response.json();
    return {
      success: true,
      order: {
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        qty: order.filled_qty,
        status: order.status
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Order error: ${error.message}`
    };
  }
}

/**
 * Execute AlphaRise strategy for today
 */
export async function executeStrategy(
  baseDCA,
  f1,
  f3,
  sellFactor,
  symbol = 'BTCUSD',
  dryRun = true
) {
  // Get today's recommendation from database
  const { initDatabase, getDailyAnalysis } = await import('./database');
  await initDatabase();

  const today = new Date().toISOString().split('T')[0];
  const analysis = getDailyAnalysis(today, today);

  if (analysis.length === 0) {
    return {
      success: false,
      error: `No daily analysis found for today (${today}). Please export daily analysis first to generate today's recommendation.`
    };
  }

  const todayAnalysis = analysis[0];
  const zone = todayAnalysis.zone;
  const recommendation = todayAnalysis.recommendation;

  // Get account info
  const accountResult = await testAlpacaConnection();
  if (!accountResult.success) {
    return accountResult;
  }

  const cashReserve = accountResult.account.cash;
  const btcResult = await getBTCPosition();
  const totalBTC = btcResult.qty || 0;

  const results = {
    date: today,
    zone,
    recommendation,
    cashBefore: cashReserve,
    btcBefore: totalBTC,
    actions: []
  };

  // Execute based on zone
  if (zone === 1 || recommendation === 'accumulate') {
    // ZONE 1: ACCUMULATE
    const freshInput = baseDCA * f1;
    const drainAmount = (baseDCA * f3) + (cashReserve / 15.0);
    const totalBuyUSD = freshInput + drainAmount;

    results.calculation = {
      freshInput,
      drainAmount,
      totalBuyUSD
    };

    if (cashReserve >= totalBuyUSD) {
      const buyResult = await placeBuyOrder(symbol, totalBuyUSD, dryRun);
      results.actions.push({
        type: 'buy',
        amount: totalBuyUSD,
        result: buyResult
      });
    } else {
      results.actions.push({
        type: 'buy',
        amount: totalBuyUSD,
        result: {
          success: false,
          error: `Insufficient cash. Need $${totalBuyUSD.toFixed(2)}, have $${cashReserve.toFixed(2)}`
        }
      });
    }
  } else if (zone === 2 || recommendation === 'neutral') {
    // ZONE 2: NEUTRAL
    if (cashReserve >= baseDCA) {
      const buyResult = await placeBuyOrder(symbol, baseDCA, dryRun);
      results.actions.push({
        type: 'buy',
        amount: baseDCA,
        result: buyResult
      });
    } else {
      results.actions.push({
        type: 'buy',
        amount: baseDCA,
        result: {
          success: false,
          error: `Insufficient cash. Need $${baseDCA.toFixed(2)}, have $${cashReserve.toFixed(2)}`
        }
      });
    }
  } else if (zone === 3 || recommendation === 'reduce') {
    // ZONE 3: REDUCE
    const buyAmount = baseDCA * f3;
    
    if (buyAmount > 0 && cashReserve >= buyAmount) {
      const buyResult = await placeBuyOrder(symbol, buyAmount, dryRun);
      results.actions.push({
        type: 'buy',
        amount: buyAmount,
        result: buyResult
      });
    }

    if (totalBTC > 0) {
      const sellQty = totalBTC * (sellFactor / 100.0);
      const sellResult = await placeSellOrder(symbol, sellQty, dryRun);
      results.actions.push({
        type: 'sell',
        qty: sellQty,
        result: sellResult
      });
    }
  }

  return {
    success: true,
    dryRun,
    ...results
  };
}


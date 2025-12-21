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
 * Execute AlphaRise strategy for today with simulated daily DCA contribution
 * Uses shared helper functions for DRY code
 */
export async function executeStrategy(
  baseDCA,
  f1,
  f3,
  sellFactor,
  symbol = 'BTCUSD',
  dryRun = true,
  t1 = 67,
  t3 = 77,
  onProgress = null
) {
  // Import helper functions
  const { 
    getEffectiveESTDate,
    calculateDailyContribution,
    calculateZone1BuyAmount,
    calculateZone2BuyAmount,
    calculateZone3BuyAmount
  } = await import('./strategyHelpers');
  
  // Use EST date based on CBBI posting schedule
  const effectiveDate = getEffectiveESTDate();
  
  // Ensure daily analysis exists (auto-calculate if needed)
  const { ensureDailyAnalysisExists } = await import('./analysis');
  const analysisResult = await ensureDailyAnalysisExists(
    effectiveDate,
    effectiveDate,
    t1,
    t3,
    onProgress
  );

  if (!analysisResult.success) {
    return {
      success: false,
      error: analysisResult.error || `No daily analysis found for ${effectiveDate}`
    };
  }

  const analysis = analysisResult.analysis;
  if (analysis.length === 0) {
    return {
      success: false,
      error: `No daily analysis found for ${effectiveDate} after calculation attempt.`
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

  const actualCashReserve = accountResult.account.cash;
  const btcResult = await getBTCPosition();
  const totalBTC = btcResult.qty || 0;

  // Calculate daily contribution using helper
  const dailyContribution = calculateDailyContribution(
    zone,
    recommendation,
    baseDCA,
    f1,
    f3
  );

  // Note: Interest is NOT calculated here - it's a cumulative metric over time
  // For single execution, we don't show interest (it would be $0 for one day)

  const results = {
    date: effectiveDate,
    zone,
    recommendation,
    actualCashBefore: actualCashReserve,
    dailyContribution: dailyContribution,
    interestEarned: 0, // Interest accrues over time, not in single execution
    simulatedCashAfterContribution: actualCashReserve + dailyContribution, // For display only
    btcBefore: totalBTC,
    actions: []
  };

  // Execute based on zone using helper functions
  if (zone === 1 || recommendation === 'accumulate') {
    // Pass actualCashReserve (reserve only), not totalAvailableCash
    // Drain is calculated from reserve only, then daily contribution is added separately
    const calc = calculateZone1BuyAmount(baseDCA, f1, f3, actualCashReserve);
    results.calculation = {
      freshInput: calc.freshInput,
      drainAmount: calc.drainAmount,
      totalBuyUSD: calc.totalBuyUSD,
      dailyContribution: calc.freshInput,
      reserveDrain: calc.drainAmount
    };

    await executeBuyOrder(
      symbol,
      calc.totalBuyUSD,
      calc.freshInput,
      calc.drainAmount,
      actualCashReserve,
      dailyContribution,
      dryRun,
      results
    );
  } else if (zone === 2 || recommendation === 'neutral') {
    const calc = calculateZone2BuyAmount(baseDCA);
    results.calculation = {
      freshInput: calc.freshInput,
      drainAmount: 0,
      totalBuyUSD: calc.totalBuyUSD
    };

    await executeBuyOrder(
      symbol,
      calc.totalBuyUSD,
      calc.freshInput,
      0,
      actualCashReserve,
      dailyContribution,
      dryRun,
      results
    );
  } else if (zone === 3 || recommendation === 'reduce') {
    const calc = calculateZone3BuyAmount(baseDCA, f3);
    
    if (calc.totalBuyUSD > 0) {
      await executeBuyOrder(
        symbol,
        calc.totalBuyUSD,
        calc.freshInput,
        0,
        actualCashReserve,
        dailyContribution,
        dryRun,
        results
      );
    }

    // Execute sell order
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

/**
 * Helper function to execute buy orders (DRY)
 */
async function executeBuyOrder(
  symbol,
  totalBuyUSD,
  fromContribution,
  fromReserve,
  actualCashReserve,
  dailyContribution,
  dryRun,
  results
) {
  if (dryRun) {
    results.actions.push({
      type: 'buy',
      amount: totalBuyUSD,
      breakdown: {
        fromDailyContribution: fromContribution,
        fromReserve: fromReserve
      },
      result: {
        success: true,
        dryRun: true,
        message: `DRY RUN: Would buy $${totalBuyUSD.toFixed(2)} of ${symbol} ($${fromContribution.toFixed(2)} from daily contribution + $${fromReserve.toFixed(2)} from reserve)`
      }
    });
  } else {
    // For live trading: need enough actual cash to cover both reserve drain AND daily contribution
    // (since daily contribution is simulated and not actually in account yet)
    if (actualCashReserve >= totalBuyUSD) {
      const buyResult = await placeBuyOrder(symbol, totalBuyUSD, false);
      results.actions.push({
        type: 'buy',
        amount: totalBuyUSD,
        breakdown: {
          fromDailyContribution: fromContribution,
          fromReserve: fromReserve
        },
        result: buyResult
      });
    } else {
      const shortfall = totalBuyUSD - actualCashReserve;
      results.actions.push({
        type: 'buy',
        amount: totalBuyUSD,
        breakdown: {
          fromDailyContribution: fromContribution,
          fromReserve: fromReserve
        },
        result: {
          success: false,
          error: `Insufficient cash. Need $${totalBuyUSD.toFixed(2)}, have $${actualCashReserve.toFixed(2)}. Please deposit $${shortfall.toFixed(2)} (includes daily contribution: $${dailyContribution.toFixed(2)})`
        }
      });
    }
  }
}


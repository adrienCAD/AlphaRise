import { calcMetrics } from './calculations';

export const runStrategies = (
  subset,
  initialCapital,
  baseDCA,
  t1,
  t3,
  f1,
  f3,
  sellFactor,
  simulatePeak
) => {
  if (subset.length === 0) return null;

  const startPrice = subset[0].price;
  const initialBTC = initialCapital / startPrice;
  const DAILY_INTEREST = 0.045 / 365;

  // Init Strategies
  let s_vdca = {
    name: "V_DCA",
    btc: 0,  // Start with 0 BTC (will accumulate via strategy)
    usd: 0,  // No contributions yet (will track daily contributions)
    cash: initialCapital,  // Full amount starts as dry powder reserve
    interest: 0,
    val: [initialCapital],
    investedHistory: [0],
    returns: [],
    cashHistory: [initialCapital],  // Show initial cash reserve
    color: '#ec4899'
  };

  let s_dca = {
    name: "Standard DCA",
    btc: 0,  // Start with 0 BTC (same as V_DCA)
    usd: 0,  // Track contributions
    cash: initialCapital,  // Start with same cash reserve as V_DCA
    val: [initialCapital],
    investedHistory: [0],
    returns: [],
    cashHistory: [initialCapital],  // Track cash reserve
    color: '#3b82f6'
  };

  let zones = [];
  let cbbis = [];
  let stats = { z1: 0, z2: 0, z3: 0 };

  // 1. V_DCA
  subset.forEach((day, idx) => {
    if (idx === 0) return;

    let { price, ema20, ema50, ema100, cbbi, date } = day;
    if (simulatePeak && new Date(date) > new Date("2025-07-15") && new Date(date) < new Date("2025-09-01")) {
      cbbi = 95;
    }
    cbbis.push(cbbi);

    // Interest
    const dailyInt = s_vdca.cash * DAILY_INTEREST;
    s_vdca.cash += dailyInt;
    s_vdca.interest += dailyInt;

    let freshInput = baseDCA;
    let reserveInput = 0;
    let actualBuyUSD = 0;
    let zone = 2;

    // Zone 1 (Accumulation): Price < EMA50 & CBBI < t1
    if (price < ema50 && cbbi < t1) {
      zone = 1;
      stats.z1++;
      freshInput = baseDCA * f1;

      // Turbo Drain Logic
      const drainTarget = (baseDCA * f3) + (s_vdca.cash / 15);
      reserveInput = Math.min(s_vdca.cash, drainTarget);
      s_vdca.cash -= reserveInput;

      actualBuyUSD = freshInput + reserveInput;
    }
    // Zone 3 (Reduction): Price > EMA20 & CBBI > t3
    else if (price > ema20 && cbbi > t3) {
      zone = 3;
      stats.z3++;
      freshInput = baseDCA * f3;

      const sellBTC = s_vdca.btc * (sellFactor / 100);
      s_vdca.btc -= sellBTC;
      s_vdca.cash += sellBTC * price;

      actualBuyUSD = freshInput;
      const unspent = baseDCA - freshInput;
      if (unspent > 0) s_vdca.cash += unspent;
    }
    else {
      stats.z2++;
      freshInput = baseDCA;
      actualBuyUSD = baseDCA;
    }

    // Execute
    s_vdca.btc += actualBuyUSD / price;
    s_vdca.usd += freshInput;

    const newVal = (s_vdca.btc * price) + s_vdca.cash;
    const prevVal = s_vdca.val[s_vdca.val.length - 1];
    s_vdca.val.push(newVal);
    s_vdca.investedHistory.push(s_vdca.usd);
    s_vdca.cashHistory.push(s_vdca.cash);

    const dailyRet = ((newVal - freshInput) / prevVal) - 1;
    s_vdca.returns.push(dailyRet);

    zones.push(zone);
  });

  // 2. Scaled DCA
  const totalFreshUSD = s_vdca.usd;  // Total contributions from V_DCA (excluding initial capital)
  const scaledDailyDCA = totalFreshUSD / (subset.length - 1 || 1);

  subset.forEach((day, idx) => {
    if (idx === 0) return;

    // Apply daily interest to cash reserve (same as V_DCA)
    const dailyInt = s_dca.cash * DAILY_INTEREST;
    s_dca.cash += dailyInt;

    const prevVal = s_dca.val[s_dca.val.length - 1];
    
    // Invest fixed amount each day
    s_dca.btc += scaledDailyDCA / day.price;
    s_dca.usd += scaledDailyDCA;
    
    // Portfolio value = BTC value + cash reserve
    const newVal = (s_dca.btc * day.price) + s_dca.cash;
    s_dca.val.push(newVal);
    s_dca.investedHistory.push(s_dca.usd);
    s_dca.cashHistory.push(s_dca.cash);

    const dailyRet = ((newVal - scaledDailyDCA) / prevVal) - 1;
    s_dca.returns.push(dailyRet);
  });

  // 3. Smart HODL (starts with same initial capital as V_DCA, converts everything to BTC)
  // Convert initial capital at start price + all contributions spread over time
  const hodlInitialBTC = initialCapital / startPrice;  // Initial capital converted to BTC at start
  const hodlContributionBTC = totalFreshUSD / startPrice;  // Fresh contributions
  const totalHodlBTC = hodlInitialBTC + hodlContributionBTC;
  const hodlVals = subset.map(d => totalHodlBTC * d.price);
  const hodlInv = subset.map(d => s_vdca.usd);
  let hodlReturns = [];
  for (let i = 1; i < hodlVals.length; i++) {
    hodlReturns.push((hodlVals[i] - hodlVals[i - 1]) / hodlVals[i - 1]);
  }

  const s_hodl = {
    name: "HODL (Equivalent)",
    btc: totalHodlBTC,
    usd: s_vdca.usd,
    val: hodlVals,
    investedHistory: hodlInv,
    returns: hodlReturns,
    color: '#a855f7'
  };

  [s_hodl, s_dca, s_vdca].forEach(s => {
    s.metrics = calcMetrics(s.returns, s.investedHistory, s.val);
  });

  const last = subset[subset.length - 1];
  const recData = {
    date: last.date,
    price: last.price,
    cbbi: last.cbbi,
    ema20: last.ema20,
    ema50: last.ema50,
    ema100: last.ema100,
    cash: s_vdca.cash,
    interest: s_vdca.interest
  };

  return {
    dates: subset.map(d => d.date),
    prices: subset.map(d => d.price),
    zones,
    cbbis,
    strategies: [s_hodl, s_dca, s_vdca],
    recData,
    zoneStats: stats
  };
};



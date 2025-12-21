/**
 * Strategy calculation helpers - shared logic for backtesting and Alpaca execution
 * DRY: Centralized calculation functions used across the application
 */

/**
 * Calculate daily DCA contribution based on zone (variable DCA)
 */
export function calculateDailyContribution(zone, recommendation, baseDCA, f1, f3) {
  if (zone === 1 || recommendation === 'accumulate') {
    return baseDCA * f1; // Zone 1: aggressive
  } else if (zone === 2 || recommendation === 'neutral') {
    return baseDCA; // Zone 2: standard
  } else if (zone === 3 || recommendation === 'reduce') {
    return baseDCA * f3; // Zone 3: reduced (usually $0)
  }
  return baseDCA; // Default to standard
}

/**
 * Calculate buy amount for Zone 1 (Accumulate)
 * @param {number} baseDCA - Base DCA amount
 * @param {number} f1 - Accumulation factor
 * @param {number} f3 - Reduction factor
 * @param {number} reserveCash - Cash reserve ONLY (not including daily contribution)
 */
export function calculateZone1BuyAmount(baseDCA, f1, f3, reserveCash) {
  const freshInput = baseDCA * f1; // Daily contribution
  // Calculate drain from reserve ONLY (not reserve + daily contribution)
  const drainTarget = (baseDCA * f3) + (reserveCash / 15.0);
  const drainAmount = Math.min(reserveCash, drainTarget);
  return {
    freshInput,
    drainAmount,
    totalBuyUSD: freshInput + drainAmount
  };
}

/**
 * Calculate buy amount for Zone 2 (Neutral)
 */
export function calculateZone2BuyAmount(baseDCA) {
  return {
    freshInput: baseDCA,
    drainAmount: 0,
    totalBuyUSD: baseDCA
  };
}

/**
 * Calculate buy amount for Zone 3 (Reduce)
 */
export function calculateZone3BuyAmount(baseDCA, f3) {
  return {
    freshInput: baseDCA * f3,
    drainAmount: 0,
    totalBuyUSD: baseDCA * f3
  };
}

/**
 * Get effective EST date based on CBBI posting schedule (7 AM EST)
 * Returns yesterday's date if before 7 AM EST, today's date otherwise
 */
export function getEffectiveESTDate() {
  const now = new Date();
  const estDate = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  const estHour = estDate.getHours();
  
  // If before 7 AM EST, use yesterday's date
  if (estHour < 7) {
    const yesterday = new Date(estDate);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
  
  // After 7 AM EST, use today's date
  return estDate.toISOString().split('T')[0];
}

/**
 * Get EST date (simple version - always returns EST date regardless of time)
 */
export function getESTDate() {
  const now = new Date();
  const estDate = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  return estDate.toISOString().split('T')[0];
}


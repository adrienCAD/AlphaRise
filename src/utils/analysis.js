import { initDatabase, upsertDailyAnalysis } from './database';

/**
 * Calculate and store daily analysis for market data
 * This determines zones, tiers, and recommendations based on price, EMAs, and CBBI
 */
export async function calculateAndStoreDailyAnalysis(marketData, t1 = 60, t3 = 74) {
  if (!marketData || marketData.length === 0) {
    console.warn('No market data provided for daily analysis calculation');
    return;
  }

  // Ensure database is initialized
  await initDatabase();

  let processedCount = 0;
  marketData.forEach((day, index) => {
    // Process all days (including first day) - we have all the data we need
    const { date, price, cbbi, ema20, ema50, ema100 } = day;
    
    // Skip if required data is missing
    if (!date || price === undefined || cbbi === undefined) {
      return;
    }

    // Determine zone
    let zone = 2; // Neutral
    let recommendation = 'neutral';
    
    // Zone 1 (Accumulation): Price < EMA50 & CBBI < t1
    if (price < ema50 && cbbi < t1) {
      zone = 1;
      recommendation = 'accumulate';
    }
    // Zone 3 (Reduction): Price > EMA20 & CBBI > t3
    else if (price > ema20 && cbbi > t3) {
      zone = 3;
      recommendation = 'reduce';
    }

    // Calculate tier based on CBBI
    let tier = null;
    if (cbbi < 30) tier = 1;      // Very low
    else if (cbbi < 50) tier = 2;  // Low
    else if (cbbi < 70) tier = 3;  // Medium
    else if (cbbi < 85) tier = 4;  // High
    else tier = 5;                  // Very high

    // Calculate price vs EMA ratios
    const price_vs_ema20 = ema20 ? price / ema20 : null;
    const price_vs_ema50 = ema50 ? price / ema50 : null;
    const price_vs_ema100 = ema100 ? price / ema100 : null;

    // Determine CBBI category
    let cbbi_category = 'medium';
    if (cbbi < 30) cbbi_category = 'very_low';
    else if (cbbi < 50) cbbi_category = 'low';
    else if (cbbi < 70) cbbi_category = 'medium';
    else if (cbbi < 85) cbbi_category = 'high';
    else cbbi_category = 'very_high';

    // Store in database
    try {
      upsertDailyAnalysis(
        date,
        zone,
        recommendation,
        {
          price_vs_ema20,
          price_vs_ema50,
          price_vs_ema100,
          cbbi_category
        },
        tier
      );
      processedCount++;
    } catch (err) {
      console.error(`Error storing daily analysis for ${date}:`, err);
    }
  });
  
  console.log(`Processed ${processedCount} daily analysis records`);
}

/**
 * Recalculate daily analysis for all market data with new thresholds
 * This is useful when t1 or t3 parameters change
 */
export async function recalculateDailyAnalysis(t1 = 60, t3 = 74) {
  const { initDatabase, getMarketData } = await import('./database');
  await initDatabase();
  
  const marketData = getMarketData();
  if (marketData.length > 0) {
    await calculateAndStoreDailyAnalysis(marketData, t1, t3);
    console.log(`Recalculated daily analysis with t1=${t1}, t3=${t3}`);
    return { success: true, recordsUpdated: marketData.length };
  }
  return { success: false, error: 'No market data available' };
}

/**
 * Get recommendation text based on zone and CBBI
 */
export function getRecommendationText(zone, cbbi) {
  if (zone === 1) {
    return 'Aggressive accumulation - Price below EMA50 and CBBI indicates oversold conditions';
  } else if (zone === 3) {
    return 'Reduction mode - Price above EMA20 and CBBI indicates overbought conditions';
  } else {
    return 'Neutral - Standard DCA strategy';
  }
}


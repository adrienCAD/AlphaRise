export const calcMetrics = (returns, investedHistory, values) => {
  if (!returns || returns.length < 2) {
    return { sharpe: "0.00", sortino: "0.00", yoy: "0.0" };
  }

  const sum = returns.reduce((a, b) => a + b, 0);
  const mean = sum / returns.length;
  const variance = returns.reduce((sq, r) => sq + Math.pow(r - mean, 2), 0) / returns.length;
  const dailyStd = Math.sqrt(variance);
  const annualStd = dailyStd * Math.sqrt(365);
  const downVariance = returns.reduce((sq, r) => r < 0 ? sq + Math.pow(r, 2) : sq, 0) / returns.length;
  const annualDownStd = Math.sqrt(downVariance) * Math.sqrt(365);

  const rf = 0.045;
  const annualMean = mean * 365;
  const sharpe = (annualMean - rf) / (annualStd || 1);
  const sortino = (annualMean - rf) / (annualDownStd || 1);

  const startVal = investedHistory[0];
  const endVal = values[values.length - 1];
  const profit = endVal - investedHistory[investedHistory.length - 1];
  const avgCapital = investedHistory.reduce((a, b) => a + b, 0) / investedHistory.length;
  const years = returns.length / 365;
  const totalRetPct = profit / avgCapital;
  let annualizedRet = 0;
  if (years > 0 && avgCapital > 0) {
    annualizedRet = Math.pow(1 + totalRetPct, 1 / years) - 1;
  }

  return {
    sharpe: sharpe.toFixed(2),
    sortino: sortino.toFixed(2),
    yoy: (annualizedRet * 100).toFixed(1)
  };
};



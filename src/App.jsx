import React, { useState, useEffect } from 'react';
import { fetchRealData } from './utils/data';
import { runStrategies } from './utils/strategies';
import { callGemini } from './utils/api';
import { 
  exportMarketDataCSV, 
  exportMarketDataJSON,
  exportDailyAnalysisCSV,
  exportDailyAnalysisJSON 
} from './utils/database';
import { 
  testAlpacaConnection, 
  executeStrategy 
} from './utils/alpaca';
import RecommendationCard from './components/RecommendationCard';
import StrategyCard from './components/StrategyCard';
import Charts from './components/Charts';
import ExportProgress from './components/ExportProgress';
import { marked } from 'marked';

function App() {
  const [fullData, setFullData] = useState([]);
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate] = useState("");
  const [simResults, setSimResults] = useState(null);
  const [simulatePeak, setSimulatePeak] = useState(false);

  // Updated defaults
  const [initialCapital, setInitialCapital] = useState(50000);
  const [baseDCA, setBaseDCA] = useState(20);

  // V_DCA Config
  const [t1, setT1] = useState(67);   // Accumulation < 67
  const [t3, setT3] = useState(77);   // Reduction > 77
  const [f1, setF1] = useState(10.0); // Factor 10x
  const [f3, setF3] = useState(0.0);  // Factor 0x
  const [sellFactor, setSellFactor] = useState(5.0); // Sell 5%

  const [recData, setRecData] = useState(null);
  const [zoneStats, setZoneStats] = useState({ z1: 0, z2: 0, z3: 0 });
  const [aiSummary, setAiSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exportProgress, setExportProgress] = useState(null);
  const [alpacaStatus, setAlpacaStatus] = useState(null);
  const [alpacaTesting, setAlpacaTesting] = useState(false);
  const [alpacaExecuting, setAlpacaExecuting] = useState(false);
  const [dryRun, setDryRun] = useState(true); // Safety: default to dry run

  useEffect(() => {
    fetchRealData().then(data => {
      if (data.length > 0) {
        setFullData(data);
        setEndDate(data[data.length - 1].date);
        setLoading(false);
      }
    });
  }, []);

  // Removed auto-recalculation - now calculated on-demand during export only
  // This improves performance by not recalculating on every slider/date change

  useEffect(() => {
    if (fullData.length === 0) return;

    const subset = fullData.filter(d => d.date >= startDate && d.date <= endDate);
    if (subset.length === 0) return;

    const results = runStrategies(
      subset,
      initialCapital,
      baseDCA,
      t1,
      t3,
      f1,
      f3,
      sellFactor,
      simulatePeak
    );

    if (results) {
      setSimResults(results);
      setRecData(results.recData);
      setZoneStats(results.zoneStats);
    }
  }, [fullData, startDate, endDate, simulatePeak, t1, t3, f1, f3, sellFactor, initialCapital, baseDCA]);

  const generateSummary = async () => {
    if (!simResults) return;
    setLoadingSummary(true);
    const stats = simResults.strategies.map(s =>
      `- ${s.name}: Sharpe ${s.metrics.sharpe}, Profit $${Math.round(s.val[s.val.length - 1] - s.usd)}`
    ).join("\n");
    const prompt = `Analyze these Bitcoin strategy results (${startDate} to ${endDate}):\n${stats}\nFocus on risk-adjusted returns (Sharpe). Max 3 sentences.`;
    const response = await callGemini(prompt);
    setAiSummary(response);
    setLoadingSummary(false);
  };

  const handleTestConnection = async () => {
    setAlpacaTesting(true);
    setAlpacaStatus(null);
    
    try {
      const result = await testAlpacaConnection();
      setAlpacaStatus(result);
    } catch (error) {
      setAlpacaStatus({
        success: false,
        error: error.message
      });
    } finally {
      setAlpacaTesting(false);
    }
  };

  const handleExecuteStrategy = async () => {
    if (!dryRun && !confirm('⚠️ LIVE TRADING MODE: This will place real orders. Continue?')) {
      return;
    }

    setAlpacaExecuting(true);
    setAlpacaStatus(null);
    setExportProgress({ message: 'Preparing strategy execution...', progress: 0 });
    
    try {
      const result = await executeStrategy(
        baseDCA,
        f1,
        f3,
        sellFactor,
        'BTCUSD', // Adjust symbol if needed for your Alpaca account
        dryRun,
        t1, // Pass t1
        t3, // Pass t3
        (progress) => setExportProgress(progress) // Progress callback
      );
      setAlpacaStatus(result);
    } catch (error) {
      setAlpacaStatus({
        success: false,
        error: error.message
      });
    } finally {
      setAlpacaExecuting(false);
      setTimeout(() => setExportProgress(null), 500);
    }
  };

  const setRange = (months) => {
    if (!fullData.length) return;
    const end = new Date(fullData[fullData.length - 1].date);
    const start = new Date(end);
    if (months === 'MAX') {
      setStartDate(fullData[0].date);
    } else {
      start.setMonth(start.getMonth() - months);
      setStartDate(start.toISOString().split('T')[0]);
    }
    setEndDate(end.toISOString().split('T')[0]);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-slate-400 p-4 md:p-8 min-h-screen">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p>Initializing V33...</p>
      </div>
    );
  }

  if (!simResults) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-slate-400 p-4 md:p-8 min-h-screen">
        <p>Loading data...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 border-b border-slate-700 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            AlphaRise Crypto - Backtesting <span className="text-green-500 text-sm">v33</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            <strong>V_DCA</strong> vs Benchmarks (Risk-Adjusted)
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button onClick={() => setRange(12)} className="btn btn-inactive">1Y</button>
          <button onClick={() => setRange(24)} className="btn btn-inactive">2Y</button>
          <button onClick={() => setRange(48)} className="btn btn-inactive">4Y</button>
          <button onClick={() => setRange('MAX')} className="btn btn-active">Max</button>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card p-3 flex items-center justify-between">
          <label className="text-sm text-slate-300 font-bold">Initial Portfolio (BTC)</label>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">$</span>
            <input
              type="number"
              value={initialCapital}
              onChange={e => setInitialCapital(Number(e.target.value))}
              className="w-24 font-mono text-right"
            />
          </div>
        </div>
        <div className="card p-3 flex items-center justify-between">
          <label className="text-sm text-slate-300 font-bold">Daily DCA (Base)</label>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">$</span>
            <input
              type="number"
              value={baseDCA}
              onChange={e => setBaseDCA(Number(e.target.value))}
              className="w-24 font-mono text-right"
            />
          </div>
        </div>
      </div>

      <RecommendationCard
        recData={recData}
        baseDCA={baseDCA}
        t1={t1}
        t3={t3}
        f1={f1}
        f3={f3}
        sellFactor={sellFactor}
      />

      <div className="card p-4 mb-6 bg-slate-900 border-pink-500/50">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-pink-400 font-bold text-sm uppercase">V_DCA Parameters</h3>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="simToggle"
              checked={simulatePeak}
              onChange={e => setSimulatePeak(e.target.checked)}
              className="w-4 h-4 accent-blue-500 rounded"
            />
            <label htmlFor="simToggle" className="text-xs text-slate-300 cursor-pointer">
              Simulate Peak (Test Selling)
            </label>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
          <div>
            <label className="block text-slate-500 mb-1">Acc. Threshold</label>
            <input
              type="range"
              min="10"
              max="70"
              value={t1}
              onChange={e => setT1(Number(e.target.value))}
            />
            <div className="text-right text-white">{t1}</div>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">Acc. Factor</label>
            <input
              type="range"
              min="1"
              max="20"
              step="0.5"
              value={f1}
              onChange={e => setF1(Number(e.target.value))}
            />
            <div className="text-right text-white">{f1}x</div>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">Red. Threshold</label>
            <input
              type="range"
              min="60"
              max="95"
              value={t3}
              onChange={e => setT3(Number(e.target.value))}
            />
            <div className="text-right text-white">{t3}</div>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">Red. Factor</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={f3}
              onChange={e => setF3(Number(e.target.value))}
            />
            <div className="text-right text-white">{f3}x</div>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">Sell Daily %</label>
            <input
              type="range"
              min="0"
              max="10"
              step="0.1"
              value={sellFactor}
              onChange={e => setSellFactor(Number(e.target.value))}
            />
            <div className="text-right text-white">{sellFactor}%</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {simResults.strategies.map((s, i) => (
          <StrategyCard key={i} strategy={s} />
        ))}
      </div>

      <Charts simResults={simResults} startDate={startDate} endDate={endDate} />

      <div className="mt-4 flex justify-end">
        {!aiSummary && !loadingSummary && (
          <button onClick={generateSummary} className="btn btn-ai text-xs px-4 py-2 flex items-center gap-2">
            <span>✨ AI Analysis</span>
          </button>
        )}
        {loadingSummary && (
          <div className="text-sm text-slate-400 animate-pulse">Running AI Model...</div>
        )}
      </div>

      {aiSummary && (
        <div className="card p-4 mt-4 bg-slate-800/80 border-indigo-500/30">
          <div className="prose prose-sm prose-invert max-w-none text-slate-300">
            <div dangerouslySetInnerHTML={{ __html: marked.parse(aiSummary) }} />
          </div>
        </div>
      )}

      {/* Alpaca Trading Integration */}
      <div className="card p-4 mt-6 bg-slate-900/50 border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-slate-300 font-bold text-sm uppercase">Alpaca Paper Trading</h3>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dryRunToggle"
              checked={dryRun}
              onChange={e => setDryRun(e.target.checked)}
              className="w-4 h-4 accent-blue-500 rounded"
            />
            <label htmlFor="dryRunToggle" className="text-xs text-slate-300 cursor-pointer">
              {dryRun ? '🧪 Dry Run' : '⚠️ LIVE MODE'}
            </label>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={handleTestConnection}
              disabled={alpacaTesting}
              className="btn btn-inactive text-xs px-4 py-2 flex-1"
            >
              {alpacaTesting ? '⏳ Testing...' : '🔌 Test Connection'}
            </button>
            <button
              onClick={handleExecuteStrategy}
              disabled={alpacaExecuting || (alpacaStatus && !alpacaStatus.success)}
              className="btn btn-inactive text-xs px-4 py-2 flex-1 bg-green-600/20 hover:bg-green-600/30 disabled:opacity-50"
            >
              {alpacaExecuting ? '⏳ Executing...' : '📤 Execute Strategy'}
            </button>
          </div>

          {alpacaStatus && (
            <div className={`p-3 rounded text-xs ${
              alpacaStatus.success 
                ? 'bg-green-900/30 border border-green-700/50' 
                : 'bg-red-900/30 border border-red-700/50'
            }`}>
              {alpacaStatus.success ? (
                <div className="space-y-2">
                  {alpacaStatus.account && (
                    <div>
                      <p className="text-green-400 font-semibold">✅ Connection Successful</p>
                      {alpacaStatus.account.accountNumber && (
                        <p className={`text-xs mt-1 ${
                          alpacaStatus.account.accountMatches === false 
                            ? 'text-yellow-400 font-semibold' 
                            : 'text-slate-400'
                        }`}>
                          Account ID: {alpacaStatus.account.accountNumber}
                          {alpacaStatus.account.accountMatches === false && alpacaStatus.account.expectedAccountId && (
                            <span className="block mt-1">
                              ⚠️ Expected: {alpacaStatus.account.expectedAccountId}
                            </span>
                          )}
                        </p>
                      )}
                      {alpacaStatus.account.accountMatches === false && (
                        <p className="text-yellow-400 text-xs mt-1">
                          ⚠️ Warning: Connected account doesn't match expected account ID. Check your API keys.
                        </p>
                      )}
                      <p className="text-slate-300 mt-1">
                        Cash: ${alpacaStatus.account.cash.toFixed(2)} | 
                        Buying Power: ${alpacaStatus.account.buyingPower.toFixed(2)}
                        {alpacaStatus.account.btcBefore !== undefined && (
                          <> | BTC: {alpacaStatus.account.btcBefore.toFixed(6)}</>
                        )}
                      </p>
                    </div>
                  )}
                  {alpacaStatus.actions && (
                    <div className="mt-2">
                      <p className="text-green-400 font-semibold">
                        {dryRun ? '🧪 Dry Run Results:' : '✅ Strategy Executed:'}
                      </p>
                      <div className="mt-1 space-y-1">
                        {alpacaStatus.zone && (
                          <p className="text-slate-300">
                            Zone: {alpacaStatus.zone} ({alpacaStatus.recommendation})
                          </p>
                        )}
                        {/* Daily Contribution & Interest */}
                        {(alpacaStatus.dailyContribution !== undefined || alpacaStatus.interestEarned !== undefined) && (
                          <div className="text-slate-400 text-xs space-y-0.5">
                            {alpacaStatus.dailyContribution > 0 && (
                              <p>
                                💰 Daily Contribution: ${alpacaStatus.dailyContribution.toFixed(2)}
                              </p>
                            )}
                            {alpacaStatus.interestEarned !== undefined && alpacaStatus.interestEarned > 0 && (
                              <p>
                                📈 Interest Earned: +${alpacaStatus.interestEarned.toFixed(2)} (4.5% APY)
                              </p>
                            )}
                          </div>
                        )}
                        {/* Calculation Breakdown */}
                        {alpacaStatus.calculation && (
                          <div className="text-slate-400 text-xs space-y-0.5">
                            {alpacaStatus.calculation.dailyContribution !== undefined && (
                              <p>
                                Pocket: ${alpacaStatus.calculation.dailyContribution.toFixed(2)} | 
                                Reserve: ${alpacaStatus.calculation.reserveDrain?.toFixed(2) || alpacaStatus.calculation.drainAmount.toFixed(2)} | 
                                Total: ${alpacaStatus.calculation.totalBuyUSD.toFixed(2)}
                              </p>
                            )}
                            {!alpacaStatus.calculation.dailyContribution && (
                              <p>
                                Fresh: ${alpacaStatus.calculation.freshInput.toFixed(2)} | 
                                Drain: ${alpacaStatus.calculation.drainAmount.toFixed(2)} | 
                                Total: ${alpacaStatus.calculation.totalBuyUSD.toFixed(2)}
                              </p>
                            )}
                          </div>
                        )}
                        {/* Actions */}
                        {alpacaStatus.actions.map((action, idx) => (
                          <div key={idx} className="text-slate-300">
                            {action.type === 'buy' ? (
                              <div>
                                <p>
                                  Buy: ${action.amount.toFixed(2)}
                                  {action.breakdown && (
                                    <span className="text-slate-400 text-xs block ml-2">
                                      (${action.breakdown.fromDailyContribution?.toFixed(2) || '0.00'} from contribution + ${action.breakdown.fromReserve?.toFixed(2) || '0.00'} from reserve)
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-slate-400 ml-2">
                                  {action.result.success 
                                    ? (action.result.dryRun ? action.result.message : `Order ID: ${action.result.order?.id}`)
                                    : `Error: ${action.result.error}`}
                                </p>
                              </div>
                            ) : (
                              <p>
                                Sell: {action.qty.toFixed(6)} BTC
                                {' - '}
                                {action.result.success 
                                  ? (action.result.dryRun ? action.result.message : `Order ID: ${action.result.order?.id}`)
                                  : `Error: ${action.result.error}`}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-red-400">❌ {alpacaStatus.error}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Export Data Section */}
      <div className="card p-4 mt-6 bg-slate-900/50 border-slate-700">
        <h3 className="text-slate-300 font-bold text-sm uppercase mb-4">Export Data</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Market Data Export */}
          <div className="space-y-2">
            <p className="text-slate-400 text-xs font-semibold">Market Data</p>
            <div className="flex gap-2">
              <button
                onClick={async () => await exportMarketDataCSV(startDate, endDate)}
                className="btn btn-inactive text-xs px-3 py-2 flex-1"
                title="Export market data as CSV"
              >
                📊 CSV
              </button>
              <button
                onClick={async () => await exportMarketDataJSON(startDate, endDate)}
                className="btn btn-inactive text-xs px-3 py-2 flex-1"
                title="Export market data as JSON"
              >
                📄 JSON
              </button>
            </div>
          </div>

          {/* Daily Analysis Export */}
          <div className="space-y-2">
            <p className="text-slate-400 text-xs font-semibold">Daily Analysis</p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setExportProgress({ message: 'Starting export...', progress: 0 });
                  try {
                    await exportDailyAnalysisCSV(
                      startDate, 
                      endDate, 
                      t1, 
                      t3,
                      (progress) => setExportProgress(progress)
                    );
                  } catch (err) {
                    console.error('Export error:', err);
                    alert('Error exporting daily analysis. Please try again.');
                  } finally {
                    // Small delay to show 100% before hiding
                    setTimeout(() => setExportProgress(null), 500);
                  }
                }}
                className="btn btn-inactive text-xs px-3 py-2 flex-1"
                disabled={!!exportProgress}
                title="Export daily analysis as CSV"
              >
                {exportProgress ? '⏳ Exporting...' : '📊 CSV'}
              </button>
              <button
                onClick={async () => {
                  setExportProgress({ message: 'Starting export...', progress: 0 });
                  try {
                    await exportDailyAnalysisJSON(
                      startDate, 
                      endDate, 
                      t1, 
                      t3,
                      (progress) => setExportProgress(progress)
                    );
                  } catch (err) {
                    console.error('Export error:', err);
                    alert('Error exporting daily analysis. Please try again.');
                  } finally {
                    // Small delay to show 100% before hiding
                    setTimeout(() => setExportProgress(null), 500);
                  }
                }}
                className="btn btn-inactive text-xs px-3 py-2 flex-1"
                disabled={!!exportProgress}
                title="Export daily analysis as JSON"
              >
                {exportProgress ? '⏳ Exporting...' : '📄 JSON'}
              </button>
            </div>
          </div>
        </div>
        <p className="text-slate-500 text-xs mt-3">
          Exports data for the selected date range: {startDate} to {endDate}
        </p>
      </div>

      {/* Export Progress Modal */}
      {exportProgress && (
        <ExportProgress 
          message={exportProgress.message} 
          progress={exportProgress.progress} 
        />
      )}
    </div>
  );
}

export default App;


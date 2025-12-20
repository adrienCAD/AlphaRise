import React from 'react';

const StrategyCard = ({ strategy }) => {
  const profit = strategy.val[strategy.val.length - 1] - strategy.usd;
  const roi = (profit / strategy.usd) * 100;

  return (
    <div className="card p-3 shadow-lg" style={{ borderTop: `4px solid ${strategy.color}` }}>
      <div>
        <div className="text-[10px] font-bold uppercase mb-1" style={{ color: strategy.color }}>
          {strategy.name}
        </div>
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-xl font-bold text-white">
            ${Math.round(strategy.val[strategy.val.length - 1]).toLocaleString()}
          </span>
          <span className={`text-sm font-bold ${roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {roi > 0 ? '+' : ''}{roi.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between text-xs text-slate-400 border-t border-slate-700 pt-2">
          <span>
            BTC: <span className="text-white font-mono font-bold">{strategy.btc.toFixed(3)}</span>
          </span>
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>
            Inv: <span className="text-slate-300 font-mono">${Math.round(strategy.usd / 1000)}k</span>
          </span>
        </div>
        {strategy.cash > 100 && (
          <div className="flex justify-between text-xs text-green-400 mt-1">
            <span>
              Cash: <span className="font-mono">${Math.round(strategy.cash).toLocaleString()}</span>
            </span>
          </div>
        )}
      </div>
      <div className="border-t border-slate-700 mt-2 pt-2 grid grid-cols-3 gap-2 text-[10px]">
        <div>
          <span className="block text-slate-500">Sharpe</span>
          <span className="text-white">{strategy.metrics.sharpe}</span>
        </div>
        <div>
          <span className="block text-slate-500">Sortino</span>
          <span className="text-white">{strategy.metrics.sortino}</span>
        </div>
        <div>
          <span className="block text-slate-500">YoY %</span>
          <span className="text-green-400">+{strategy.metrics.yoy}%</span>
        </div>
      </div>
    </div>
  );
};

export default StrategyCard;



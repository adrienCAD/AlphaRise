import React from 'react';

const RecommendationCard = ({ recData, baseDCA, t1, t3, f1, f3, sellFactor }) => {
  if (!recData) return null;

  const { price, ema20, ema50, cbbi, cash, interest } = recData;
  let zone = "ZONE 2 (NEUTRAL)",
    action = `BUY $${baseDCA}`,
    color = "text-yellow-400",
    borderColor = "border-yellow-500",
    subText = "Reserve earns 4.5%";

  if (price < ema50 && cbbi < t1) {
    zone = "ZONE 1 (ACCUMULATION)";
    color = "text-green-400";
    borderColor = "border-green-500";
    const target = baseDCA * f1;
    const drain = (baseDCA * f3) + (cash / 15);
    const fromReserve = Math.min(cash, drain);
    action = `BUY $${Math.round(target + fromReserve)}`;
    subText = `Pocket: $${target} + Reserve: $${Math.round(fromReserve)}`;
  } else if (price > ema20 && cbbi > t3) {
    zone = "ZONE 3 (REDUCTION)";
    color = "text-red-400";
    borderColor = "border-red-500";
    const save = baseDCA - (baseDCA * f3);
    action = `BUY $${baseDCA * f3}`;
    subText = `Saving $${save.toFixed(0)} to Reserve + Selling ${sellFactor}%`;
  }

  return (
    <div className={`card p-6 mb-6 border-l-4 ${borderColor} bg-slate-800 shadow-lg relative overflow-hidden rec-active`}>
      <div className="flex flex-wrap justify-between items-start gap-4 relative z-10">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
            Today ({recData.date})
          </div>
          <div className={`text-3xl font-black ${color} mb-1`}>{zone}</div>
          <div className="text-sm text-slate-300">
            Price: <span className="text-white">${price.toLocaleString()}</span> • CBBI: <span className="text-white">{cbbi}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Action</div>
          <div className="text-4xl font-black text-white">{action}</div>
          <div className="text-xs font-bold text-slate-400 mt-1">{subText}</div>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-700/50 flex gap-6 text-sm">
        <div>
          <span className="text-slate-500 block text-xs">Dry Powder</span>
          <span className="text-white font-mono font-bold">${Math.round(cash).toLocaleString()}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-xs">Interest Earned</span>
          <span className="text-green-400 font-mono font-bold">+${Math.round(interest).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

export default RecommendationCard;



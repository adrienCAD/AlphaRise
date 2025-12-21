import React from 'react';

const ExportProgress = ({ message, progress }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card p-6 bg-slate-900 border-slate-700 max-w-md w-full mx-4">
        <h3 className="text-white font-bold mb-4">Exporting Daily Analysis</h3>
        <p className="text-slate-300 text-sm mb-4">{message}</p>
        <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-slate-400 text-xs text-center">{progress}%</p>
      </div>
    </div>
  );
};

export default ExportProgress;


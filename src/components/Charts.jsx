import React, { useEffect, useRef } from 'react';

const Charts = ({ simResults, startDate, endDate }) => {
  const chartsRef = useRef({
    main: null,
    cash: null,
    price: null
  });

  useEffect(() => {
    if (!simResults || typeof window.Plotly === 'undefined') return;

    const Plotly = window.Plotly;
    const { dates, prices, strategies, zones, cbbis } = simResults;

    // Helper function to update vertical line on a chart
    const updateVerticalLine = (chartId, xValue) => {
      if (!xValue) {
        // Remove the line if no xValue
        Plotly.relayout(chartId, {
          shapes: []
        });
        return;
      }

      Plotly.relayout(chartId, {
        shapes: [{
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: xValue,
          x1: xValue,
          y0: 0,
          y1: 1,
          line: {
            color: '#3b82f6',
            width: 2,
            dash: 'dot'
          },
          layer: 'above'
        }]
      });
    };

    // Event handler for hover synchronization
    const handleHover = (chartId, eventData) => {
      if (!eventData || !eventData.points || eventData.points.length === 0) return;
      
      const xValue = eventData.points[0].x;
      
      // Update vertical lines on the other two charts
      Object.keys(chartsRef.current).forEach(id => {
        if (id !== chartId && chartsRef.current[id]) {
          updateVerticalLine(chartsRef.current[id], xValue);
        }
      });
    };

    // Event handler to remove lines when mouse leaves
    const handleUnhover = () => {
      Object.keys(chartsRef.current).forEach(id => {
        if (chartsRef.current[id]) {
          updateVerticalLine(chartsRef.current[id], null);
        }
      });
    };

    // 1. Portfolio Chart
    const valTraces = strategies.map(s => ({
      x: dates,
      y: s.val,
      name: s.name,
      type: 'scatter',
      mode: 'lines',
      line: { color: s.color, width: s.name.includes("V_DCA") ? 3 : 2 }
    }));

    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#cbd5e1' },
      xaxis: { gridcolor: '#334155', range: [startDate, endDate] },
      yaxis: { gridcolor: '#334155', tickprefix: '$' },
      margin: { l: 50, r: 10, t: 40, b: 30 },
      showlegend: true,
      height: 450,
      hovermode: 'x unified',
      legend: { orientation: 'h', y: -0.2 }
    };

    Plotly.newPlot('chart-main', valTraces, { ...layout, title: 'Total Portfolio Value (USD)' }, { displayModeBar: false })
      .then(() => {
        chartsRef.current.main = 'chart-main';
        const mainChart = document.getElementById('chart-main');
        mainChart.on('plotly_hover', (data) => handleHover('main', data));
        mainChart.on('plotly_unhover', handleUnhover);
      });

    // 2. Cash Reserve
    const vdca = strategies.find(s => s.name.includes("V_DCA"));
    const cashTrace = {
      x: dates,
      y: vdca.cashHistory,
      name: 'Cash Reserve',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#10b981', width: 2 },
      fill: 'tozeroy',
      fillcolor: 'rgba(16, 185, 129, 0.1)'
    };

    Plotly.newPlot('chart-cash', [cashTrace], {
      ...layout,
      title: 'Dry Powder (Cash Reserve)',
      height: 200,
      yaxis: { ...layout.yaxis, title: 'USD' }
    }, { displayModeBar: false })
      .then(() => {
        chartsRef.current.cash = 'chart-cash';
        const cashChart = document.getElementById('chart-cash');
        cashChart.on('plotly_hover', (data) => handleHover('cash', data));
        cashChart.on('plotly_unhover', handleUnhover);
      });

    // 3. Price + CBBI Overlay
    const zoneShapes = [];
    let startIdx = 0;
    for (let i = 1; i <= zones.length; i++) {
      if (i === zones.length || zones[i] !== zones[startIdx]) {
        let color = '#94a3b8';
        if (zones[startIdx] === 1) color = '#22c55e';
        else if (zones[startIdx] === 3) color = '#ef4444';
        zoneShapes.push({
          type: 'rect',
          xref: 'x',
          yref: 'paper',
          x0: dates[startIdx],
          x1: dates[i - 1] || dates[dates.length - 1],
          y0: 0,
          y1: 1,
          fillcolor: color,
          opacity: 0.15,
          line: { width: 0 },
          layer: 'below'
        });
        startIdx = i;
      }
    }

    const priceTrace = {
      x: dates,
      y: prices,
      name: 'Price',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#e2e8f0', width: 2 }
    };

    const cbbiTrace = {
      x: dates,
      y: cbbis,
      name: 'CBBI',
      type: 'scatter',
      mode: 'lines',
      yaxis: 'y2',
      line: { color: '#facc15', width: 1.5, dash: 'dot' }
    };

    const dualLayout = {
      ...layout,
      title: 'BTC Price & CBBI',
      height: 300,
      shapes: zoneShapes,
      yaxis2: {
        title: 'CBBI',
        overlaying: 'y',
        side: 'right',
        range: [0, 100],
        showgrid: false,
        tickfont: { color: '#facc15' }
      }
    };

    Plotly.newPlot('chart-price', [priceTrace, cbbiTrace], dualLayout, { displayModeBar: false })
      .then(() => {
        chartsRef.current.price = 'chart-price';
        const priceChart = document.getElementById('chart-price');
        priceChart.on('plotly_hover', (data) => handleHover('price', data));
        priceChart.on('plotly_unhover', handleUnhover);
      });

    // Cleanup function
    return () => {
      Object.keys(chartsRef.current).forEach(id => {
        if (chartsRef.current[id]) {
          const chartElement = document.getElementById(chartsRef.current[id]);
          if (chartElement) {
            chartElement.removeAllListeners('plotly_hover');
            chartElement.removeAllListeners('plotly_unhover');
          }
        }
      });
    };

  }, [simResults, startDate, endDate]);

  return (
    <div className="space-y-4">
      <div className="card p-2 bg-slate-900/50">
        <div id="chart-main"></div>
      </div>
      <div className="card p-2 bg-slate-900/50">
        <div id="chart-cash"></div>
      </div>
      <div className="card p-2 bg-slate-900/50">
        <div id="chart-price"></div>
      </div>
    </div>
  );
};

export default Charts;


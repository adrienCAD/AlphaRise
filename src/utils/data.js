export async function fetchRealData() {
  try {
    const PROXY = 'https://corsproxy.io/?';
    const URL = 'https://colintalkscrypto.com/cbbi/data/latest.json';
    const response = await fetch(PROXY + encodeURIComponent(URL));
    const data = await response.json();

    const prices = data.Price || data.BTC || {};
    const confidence = data.Confidence || data.CBBI || {};

    let rawData = [];
    Object.keys(prices).sort((a, b) => a - b).forEach(ts => {
      let t = parseInt(ts);
      if (t < 10000000000) t *= 1000;
      const dateStr = new Date(t).toISOString().split('T')[0];
      let c = confidence[ts];
      if (c <= 1) c = Math.round(c * 100);
      if (!c) c = 50;
      rawData.push({ date: dateStr, price: prices[ts], cbbi: c });
    });

    const pArr = rawData.map(d => d.price);
    const calcEMA = (arr, n) => {
      const k = 2 / (n + 1);
      let ema = new Array(arr.length).fill(null);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += arr[i];
      ema[n - 1] = sum / n;
      for (let i = n; i < arr.length; i++) {
        ema[i] = (arr[i] * k) + (ema[i - 1] * (1 - k));
      }
      return ema;
    };

    const e20 = calcEMA(pArr, 20);
    const e50 = calcEMA(pArr, 50);
    const e100 = calcEMA(pArr, 100);

    return rawData.map((d, i) => ({
      ...d,
      ema20: e20[i] || d.price,
      ema50: e50[i] || d.price,
      ema100: e100[i] || d.price
    })).filter(d => d.price > 0);

  } catch (err) {
    console.error(err);
    return [];
  }
}



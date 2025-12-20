# AlphaRise

**AlphaRise** is an advanced Bitcoin strategy backtesting platform that enables investors to test and optimize dynamic investment strategies. The application compares the innovative V_DCA (Variable Dollar-Cost Averaging) strategy against traditional DCA and HODL approaches, providing data-driven insights into portfolio performance across different market conditions.

AlphaRise uses real-time Bitcoin price data and technical indicators (CBBI, EMA) to dynamically adjust buying behavior, helping users identify optimal entry and exit points while maintaining risk-adjusted returns through comprehensive metrics analysis.

## Features

- **V_DCA Strategy**: A dynamic DCA strategy that adjusts buying based on market conditions (CBBI and EMA indicators)
- **Real-time Data**: Fetches Bitcoin price and CBBI (Colin Talks Crypto Bitcoin Index) data
- **Interactive Charts**: Visualizes portfolio performance, cash reserves, and price movements using Plotly
- **AI Analysis**: Optional Gemini AI-powered strategy analysis
- **Risk Metrics**: Calculates Sharpe ratio, Sortino ratio, and annualized returns

## Setup

1. Install dependencies:
```bash
npm install
```

2. Add your Gemini API key (optional, for AI analysis):
   - Create a `.env` file in either the project root directory or the parent directory
   - Add: `VITE_GEMINI_API_KEY=your_api_key_here`
   - If both locations have `.env` files, the project root `.env` takes priority
   - Get your API key from: https://makersuite.google.com/app/apikey

3. Start the development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Strategy Parameters

- **Initial Capital**: Starting portfolio value in USD
- **Base DCA**: Daily dollar-cost averaging amount
- **Accumulation Threshold (t1)**: CBBI threshold below which accumulation mode activates
- **Accumulation Factor (f1)**: Multiplier for DCA in accumulation mode
- **Reduction Threshold (t3)**: CBBI threshold above which reduction mode activates
- **Reduction Factor (f3)**: Multiplier for DCA in reduction mode
- **Sell Factor**: Percentage of BTC to sell daily in reduction mode

## Zones

- **Zone 1 (Accumulation)**: Price < EMA50 & CBBI < t1 - Aggressive buying
- **Zone 2 (Neutral)**: Standard DCA
- **Zone 3 (Reduction)**: Price > EMA20 & CBBI > t3 - Reduced buying + selling

## Technologies

- React 18
- Vite
- Plotly.js (via CDN)
- Tailwind CSS (via CDN)
- Marked (for markdown rendering)

## Usage

The app will open at `http://localhost:5173/` when running the dev server.

Use the date range selectors to test different time periods, and adjust the V_DCA parameters using the sliders to see how different configurations perform.

## License

Proprietary - All Rights Reserved

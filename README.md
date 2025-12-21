# AlphaRise

**AlphaRise** is an advanced Bitcoin strategy backtesting platform that enables investors to test and optimize dynamic investment strategies. The application compares the innovative V_DCA (Variable Dollar-Cost Averaging) strategy against traditional DCA and HODL approaches, providing data-driven insights into portfolio performance across different market conditions.

AlphaRise uses real-time Bitcoin price data and technical indicators (CBBI, EMA) to dynamically adjust buying behavior, helping users identify optimal entry and exit points while maintaining risk-adjusted returns through comprehensive metrics analysis.

## Features

- **V_DCA Strategy**: A dynamic DCA strategy that adjusts buying based on market conditions (CBBI and EMA indicators)
- **Real-time Data**: Fetches Bitcoin price and CBBI (Colin Talks Crypto Bitcoin Index) data
- **Interactive Charts**: Visualizes portfolio performance, cash reserves, and price movements using Plotly
- **AI Analysis**: Optional Gemini AI-powered strategy analysis
- **Risk Metrics**: Calculates Sharpe ratio, Sortino ratio, and annualized returns
- **Alpaca Integration**: Paper trading integration to execute the V_DCA strategy automatically on Alpaca

## Setup

1. Install dependencies:
```bash
npm install
```

2. Add your API keys (optional):
   - Create a `.env` file in either the project root directory or the parent directory
   - **Gemini API** (for AI analysis):
     - Add: `VITE_GEMINI_API_KEY=your_api_key_here`
     - Get your API key from: https://makersuite.google.com/app/apikey
   - **Alpaca API** (for paper trading):
     - Add: `VITE_ALPACA_API_KEY=your_paper_api_key_here`
     - Add: `VITE_ALPACA_SECRET_KEY=your_paper_secret_key_here`
     - Get your keys from: https://app.alpaca.markets/paper/dashboard/overview
   - If both locations have `.env` files, the project root `.env` takes priority

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

## Database

AlphaRise uses **SQLite** (via sql.js) to store time-series data locally in the browser:

- **Market Data**: BTCUSD price, CBBI index, and calculated EMAs (20, 50, 100)
- **Daily Analysis**: Zones (1-3), tiers, recommendations, and calculated metrics
- **Storage**: Data is persisted in browser localStorage
- **ETL Process**: Automatically fetches and stores data from the API on each load

The database is automatically initialized on first use and persists across browser sessions. All data is stored locally in your browser.

## Alpaca Paper Trading

AlphaRise integrates with Alpaca Paper Trading to execute the V_DCA strategy automatically:

- **Test Connection**: Verify your Alpaca API credentials
- **Execute Strategy**: Run the strategy for today based on current market conditions
- **Dry Run Mode**: Test strategy execution without placing real orders (default)
- **Live Mode**: Toggle to place actual orders (use with caution)

**How it works:**
1. Export daily analysis to generate today's recommendation
2. Click "Test Connection" to verify API credentials
3. Toggle "Dry Run" mode (recommended for testing)
4. Click "Execute Strategy" to run the strategy for today

The strategy uses your current V_DCA parameters (baseDCA, f1, f3, sellFactor) and today's zone recommendation to:
- **Zone 1 (Accumulate)**: Buy `baseDCA × f1` + drain cash reserves
- **Zone 2 (Neutral)**: Buy `baseDCA` (standard DCA)
- **Zone 3 (Reduce)**: Buy `baseDCA × f3` (usually $0) + sell `sellFactor%` of holdings

**Note**: Make sure you have exported daily analysis for today before executing the strategy.

## Technologies

- React 18
- Vite
- Plotly.js (via CDN)
- Tailwind CSS (via CDN)
- Marked (for markdown rendering)
- SQLite (sql.js) - Browser-based database for time-series data

## Usage

The app will open at `http://localhost:5173/` when running the dev server.

Use the date range selectors to test different time periods, and adjust the V_DCA parameters using the sliders to see how different configurations perform.

## AWS Lambda Automation

AlphaRise includes an AWS Lambda function for automated daily trading execution.

The `lambda/` directory contains:
- **lambda_function.py**: Main Lambda handler
- **requirements.txt**: Python dependencies
- **README.md**: Complete deployment instructions
- **deploy.sh**: Deployment script
- **test_local.py**: Local testing script

See [lambda/README.md](lambda/README.md) for detailed AWS setup and deployment instructions.

**Cost**: ~$0.80/month (mostly Secrets Manager)

## License

Proprietary - All Rights Reserved

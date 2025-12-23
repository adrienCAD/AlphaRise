# 🚀 AlphaRise Lambda Trader

A serverless AWS Lambda function that automates the **AlphaRise Variable DCA Strategy**. It runs daily, analyzes the Colin Talks Crypto Bitcoin Index (CBBI), and executes trades on Alpaca Markets (Paper or Live).

## ⚡ Features

* **Zone-Based Logic:** Automatically detects Accumulate (Zone 1), Neutral (Zone 2), and Reduce (Zone 3) phases.
* **Variable DCA:** Scales buying power based on market zones (e.g., 10x multiplier in Zone 1).
* **Smart Draining:** Implements "Turbo Drain" logic to safely deploy cash reserves during bottoms.
* **Idempotency:** Uses S3 to ensure it **never trades twice** on the same day (prevents accidental double-buys).
* **Paper/Live Mode:** Easily switch between simulation and real trading via environment variables.

---

## 🛠️ Prerequisites

1.  **AWS Account** (Free tier is sufficient).
2.  **Alpaca Markets Account** (API Key & Secret).
3.  **Python 3.11+** installed locally.
4.  **(Optional) AWS S3 Bucket** to store trade logs and prevent double-execution.

---

## ⚙️ Configuration (Environment Variables)

When setting up your Lambda function, use these environment variables to control behavior without touching code.

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `ALPACA_API_KEY` | ✅ | - | Your Alpaca Public Key ID. |
| `ALPACA_SECRET_KEY` | ✅ | - | Your Alpaca Secret Key. |
| `ALPACA_ENDPOINT` | ❌ | `https://paper-api.alpaca.markets` | Use `https://api.alpaca.markets` for **Live Trading**. |
| `BASE_DCA` | ❌ | `100` | The standard daily dollar amount to buy. |
| `F1` | ❌ | `10` | Multiplier for Zone 1 (Accumulate). |
| `F3` | ❌ | `0` | Multiplier for Zone 3 (Reduce). |
| `SELL_FACTOR` | ❌ | `2` | Percentage (%) of BTC holdings to sell in Zone 3. |
| `S3_BUCKET_NAME` | ❌ | - | Bucket name to save daily JSON logs (e.g., `my-trade-logs`). |
| `DRY_RUN` | ❌ | `false` | Set to `true` to simulate trades without executing orders. |

---

## 🖥️ Local Testing

You can test the logic on your laptop before deploying to AWS.

1.  **Install Requirements:**
    ```bash
    pip install -r requirements.txt
    pip install python-dotenv  # Extra tool for local .env support
    ```

2.  **Create a `.env` file** (or use your existing one):
    ```env
    ALPACA_API_KEY=PK***********
    ALPACA_SECRET_KEY=***************************
    ```

3.  **Run the Test Script:**
    This script mocks the AWS environment and runs the bot in `DRY_RUN` mode.
    ```bash
    python test_local.py
    ```

---

## ☁️ AWS Deployment

### Step 1: Prepare the Package
Use the included script to create a clean zip file containing your code and dependencies (`alpaca-py`, `requests`, etc.).

```bash
chmod +x deploy.sh
./deploy.sh
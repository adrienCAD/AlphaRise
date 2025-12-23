import json
import os
import boto3
import requests
import math
from datetime import datetime, timezone, timedelta
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

# ================= CONFIGURATION =================
# Recommended: Set these as Environment Variables in AWS Lambda
ALPACA_API_KEY = os.getenv('ALPACA_API_KEY')
ALPACA_SECRET_KEY = os.getenv('ALPACA_SECRET_KEY')
ALPACA_ENDPOINT = os.getenv('ALPACA_ENDPOINT', 'https://paper-api.alpaca.markets')
S3_BUCKET_NAME = os.getenv('S3_BUCKET_NAME')
SYMBOL = "BTC/USD"
CBBI_API_URL = "https://colintalkscrypto.com/cbbi/data/latest.json"

# Strategy Defaults
DEFAULT_BASE_DCA = float(os.getenv('BASE_DCA', 100))
DEFAULT_F1 = float(os.getenv('F1', 10))
DEFAULT_F3 = float(os.getenv('F3', 0))
DEFAULT_SELL_FACTOR = float(os.getenv('SELL_FACTOR', 2))
DEFAULT_T1 = 30 # Zone 1 threshold
DEFAULT_T3 = 70 # Zone 3 threshold

def get_s3_client():
    return boto3.client('s3') if S3_BUCKET_NAME else None

def get_utc_date_str():
    """Returns current UTC date as YYYY-MM-DD string."""
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')

def check_already_traded(date_str):
    """Checks S3 to see if we already executed a strategy for this date."""
    if not S3_BUCKET_NAME:
        return False
    
    s3 = get_s3_client()
    key = f"executions/{date_str}.json"
    try:
        s3.head_object(Bucket=S3_BUCKET_NAME, Key=key)
        print(f"🛑 Trade already executed for {date_str}. Skipping.")
        return True
    except:
        return False # File does not exist, safe to proceed

def calculate_ema(prices, period):
    if len(prices) < period:
        return [None] * len(prices)
    
    k = 2.0 / (period + 1)
    ema = [None] * len(prices)
    sma = sum(prices[:period]) / period
    ema[period - 1] = sma
    
    for i in range(period, len(prices)):
        ema[i] = (prices[i] * k) + (ema[i - 1] * (1 - k))
    return ema

def fetch_cbbi_data():
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0', 
            'Accept': 'application/json'
        }
        
        # 1. Fetch Data
        resp = requests.get(CBBI_API_URL, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        prices = data.get('Price') or data.get('BTC') or {}
        confidence = data.get('Confidence') or data.get('CBBI') or {}

        # 2. Process Data
        processed = []
        for ts_str in sorted(prices.keys(), key=lambda x: int(x)):
            ts = int(ts_str)
            price = prices[ts_str]
            # Handle confidence mapping
            c = confidence.get(ts_str, 50)
            if c <= 1: c = round(c * 100) # Fix decimal CBBI if present
            
            # CRITICAL: Strict UTC conversion
            # Using timezone.utc ensures we don't get local lambda time
            date_obj = datetime.fromtimestamp(ts if ts > 1e10 else ts, tz=timezone.utc)
            date_str = date_obj.strftime('%Y-%m-%d')
            
            processed.append({
                'date': date_str,
                'price': price,
                'cbbi': c
            })

        # 3. Calculate EMAs
        price_list = [p['price'] for p in processed]
        ema20 = calculate_ema(price_list, 20)
        ema50 = calculate_ema(price_list, 50)
        
        # Merge back
        for i, item in enumerate(processed):
            item['ema20'] = ema20[i]
            item['ema50'] = ema50[i]
            
        return processed

    except Exception as e:
        print(f"Error fetching CBBI: {e}")
        raise e

def analyze_market(data, target_date):
    # Find exact match for date
    row = next((item for item in data if item['date'] == target_date), None)
    
    if not row:
        # SAFETY: Do NOT fallback to latest. 
        # If API doesn't have today's date, we must not trade based on yesterday.
        print(f"⚠️ Data for {target_date} not yet available in API.")
        return None

    price = row['price']
    cbbi = row['cbbi']
    ema20 = row.get('ema20')
    ema50 = row.get('ema50')
    
    # Determine Zone
    zone = 2
    rec = 'neutral'
    
    # Zone 1 logic: Price < EMA50 AND CBBI < T1
    if ema50 and price < ema50 and cbbi < DEFAULT_T1:
        zone = 1
        rec = 'accumulate'
    # Zone 3 logic: Price > EMA20 AND CBBI > T3
    elif ema20 and price > ema20 and cbbi > DEFAULT_T3:
        zone = 3
        rec = 'reduce'

    return {
        'date': target_date,
        'zone': zone,
        'recommendation': rec,
        'price': price,
        'cbbi': cbbi
    }

def execute_strategy(analysis, client, dry_run=False):
    zone = analysis['zone']
    
    # Get Account Info
    acct = client.get_account()
    cash = float(acct.cash)
    
    # Get Position
    try:
        # Note: Alpaca Crypto symbols might need normalization depending on feed
        pos = client.get_all_positions()
        btc_qty = next((float(p.qty) for p in pos if p.symbol == SYMBOL), 0.0)
    except:
        btc_qty = 0.0

    print(f"💵 Cash: ${cash:.2f} | ₿ BTC: {btc_qty:.6f} | Zone: {zone}")

    result_log = {
        'action': 'none',
        'amount': 0,
        'zone': zone
    }

    # === ZONE 1: ACCUMULATE ===
    if zone == 1:
        fresh_input = DEFAULT_BASE_DCA * DEFAULT_F1
        # Turbo Drain: (Base * F3) + (Cash / 15)
        drain_amt = (DEFAULT_BASE_DCA * DEFAULT_F3) + (cash / 15.0)
        total_buy = fresh_input + drain_amt
        
        # Round to 2 decimals for USD
        total_buy = round(total_buy, 2)
        
        print(f"🚀 BUY SIGNAL: Fresh(${fresh_input}) + Drain(${drain_amt:.2f}) = ${total_buy}")

        if cash >= total_buy:
            if not dry_run:
                order = client.submit_order(MarketOrderRequest(
                    symbol=SYMBOL, notional=total_buy, side=OrderSide.BUY, time_in_force=TimeInForce.GTC
                ))
                result_log.update({'action': 'buy', 'amount': total_buy, 'id': str(order.id)})
            else:
                result_log.update({'action': 'buy_dry_run', 'amount': total_buy})
        else:
            print("❌ Insufficient Cash")
            result_log['error'] = 'insufficient_cash'

    # === ZONE 2: NEUTRAL ===
    elif zone == 2:
        amount = DEFAULT_BASE_DCA
        print(f"⚖️ NEUTRAL: Standard DCA ${amount}")
        
        if cash >= amount:
            if not dry_run:
                order = client.submit_order(MarketOrderRequest(
                    symbol=SYMBOL, notional=amount, side=OrderSide.BUY, time_in_force=TimeInForce.GTC
                ))
                result_log.update({'action': 'buy', 'amount': amount, 'id': str(order.id)})
            else:
                result_log.update({'action': 'buy_dry_run', 'amount': amount})

    # === ZONE 3: REDUCE ===
    elif zone == 3:
        # Buy Logic (Usually 0)
        buy_amt = DEFAULT_BASE_DCA * DEFAULT_F3
        if buy_amt > 0 and cash >= buy_amt:
             if not dry_run:
                client.submit_order(MarketOrderRequest(
                    symbol=SYMBOL, notional=buy_amt, side=OrderSide.BUY, time_in_force=TimeInForce.GTC
                ))
        
        # Sell Logic
        if btc_qty > 0:
            # Round quantity to 8 decimals to prevent API errors
            sell_qty = round(btc_qty * (DEFAULT_SELL_FACTOR / 100.0), 8)
            
            # Ensure not zero
            if sell_qty > 0:
                print(f"🔻 SELL SIGNAL: Selling {sell_qty} BTC")
                if not dry_run:
                    order = client.submit_order(MarketOrderRequest(
                        symbol=SYMBOL, qty=sell_qty, side=OrderSide.SELL, time_in_force=TimeInForce.GTC
                    ))
                    result_log.update({'action': 'sell', 'qty': sell_qty, 'id': str(order.id)})
                else:
                    result_log.update({'action': 'sell_dry_run', 'qty': sell_qty})

    return result_log

def lambda_handler(event, context):
    print("--- Starting AlphaRise Automation ---")
    
    # 1. Determine Date (UTC)
    target_date = get_utc_date_str()
    print(f"📅 Target Date (UTC): {target_date}")

    # 2. Idempotency Check
    if check_already_traded(target_date):
        return {'statusCode': 200, 'body': 'Already traded today.'}

    # 3. Fetch & Analyze
    try:
        data = fetch_cbbi_data()
        analysis = analyze_market(data, target_date)
        
        if not analysis:
            return {'statusCode': 200, 'body': f'No data available for {target_date} yet.'}
            
        print(f"📊 Analysis: Zone {analysis['zone']} ({analysis['recommendation']})")

    except Exception as e:
        print(f"❌ Analysis Failed: {e}")
        return {'statusCode': 500, 'body': str(e)}

    # 4. Execute
    dry_run = os.getenv('DRY_RUN', 'false').lower() == 'true'
    
    try:
        client = TradingClient(ALPACA_API_KEY, ALPACA_SECRET_KEY, paper=True) # Set paper=False for live
        result = execute_strategy(analysis, client, dry_run=dry_run)
        
        # 5. Store Result (Mark as done)
        if S3_BUCKET_NAME and not dry_run and result.get('action') != 'none':
            s3 = get_s3_client()
            s3.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=f"executions/{target_date}.json",
                Body=json.dumps({'analysis': analysis, 'result': result})
            )

        return {'statusCode': 200, 'body': json.dumps(result)}

    except Exception as e:
        print(f"❌ Execution Failed: {e}")
        return {'statusCode': 500, 'body': str(e)}
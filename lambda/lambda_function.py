import json
import os
import boto3
import requests
import math
from datetime import datetime, timezone
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

# ================= CONFIGURATION =================
ALPACA_API_KEY = os.getenv('ALPACA_API_KEY')
ALPACA_SECRET_KEY = os.getenv('ALPACA_SECRET_KEY')
ALPACA_ENDPOINT = os.getenv('ALPACA_ENDPOINT', 'https://paper-api.alpaca.markets')
S3_BUCKET_NAME = os.getenv('S3_BUCKET_NAME')
SYMBOL = "BTC/USD"
CBBI_API_URL = "https://colintalkscrypto.com/cbbi/data/latest.json"

# Strategy Defaults
DEFAULT_BASE_DCA = float(os.getenv('BASE_DCA', 20))
DEFAULT_F1 = float(os.getenv('F1', 10.0))
DEFAULT_F3 = float(os.getenv('F3', 0.0))
DEFAULT_SELL_FACTOR = float(os.getenv('SELL_FACTOR', 5.0))
DEFAULT_T1 = int(os.getenv('T1', 67))
DEFAULT_T3 = int(os.getenv('T3', 77)) 

def get_s3_client():
    return boto3.client('s3') if S3_BUCKET_NAME else None

def get_target_date():
    """
    Returns UTC date.
    Allows manual override via 'OVERRIDE_DATE' env var for testing.
    """
    override = os.getenv('OVERRIDE_DATE')
    if override:
        print(f"🧪 LOCAL TEST MODE: Using local date {override} (not UTC)")
        return override
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')

def check_already_traded(date_str):
    if not S3_BUCKET_NAME: return False
    s3 = get_s3_client()
    try:
        s3.head_object(Bucket=S3_BUCKET_NAME, Key=f"executions/{date_str}.json")
        print(f"🛑 Trade already executed for {date_str}. Skipping.")
        return True
    except:
        return False

def calculate_ema(prices, period):
    if len(prices) < period: return [None] * len(prices)
    k = 2.0 / (period + 1)
    ema = [None] * len(prices)
    ema[period - 1] = sum(prices[:period]) / period
    for i in range(period, len(prices)):
        ema[i] = (prices[i] * k) + (ema[i - 1] * (1 - k))
    return ema

def fetch_cbbi_data():
    try:
        # 🟢 FIX 1: Mimic a real browser to avoid 406 Error
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://colintalkscrypto.com/',
            'Origin': 'https://colintalkscrypto.com'
        }
        
        resp = requests.get(CBBI_API_URL, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        prices = data.get('Price') or data.get('BTC') or {}
        confidence = data.get('Confidence') or data.get('CBBI') or {}

        processed = []
        for ts_str in sorted(prices.keys(), key=lambda x: int(x)):
            ts = int(ts_str)
            price = prices[ts_str]
            c = confidence.get(ts_str, 50)
            if c <= 1: c = round(c * 100)
            
            # UTC Conversion
            date_obj = datetime.fromtimestamp(ts if ts > 1e10 else ts, tz=timezone.utc)
            processed.append({
                'date': date_obj.strftime('%Y-%m-%d'),
                'price': price,
                'cbbi': c
            })

        # Calculate EMAs
        price_list = [p['price'] for p in processed]
        ema20 = calculate_ema(price_list, 20)
        ema50 = calculate_ema(price_list, 50)
        
        for i, item in enumerate(processed):
            item['ema20'] = ema20[i]
            item['ema50'] = ema50[i]
            
        return processed

    except Exception as e:
        print(f"Error fetching CBBI: {e}")
        raise e

def analyze_market(data, target_date):
    # Find exact match
    row = next((item for item in data if item['date'] == target_date), None)
    
    if not row:
        # 🟡 FIX 2: Graceful logging if date not found
        latest_date = data[-1]['date'] if data else "Unknown"
        print(f"⚠️ Data for {target_date} not available. Latest data is {latest_date}.")
        return None

    price = row['price']
    cbbi = row['cbbi']
    ema50 = row.get('ema50')
    
    zone = 2
    rec = 'neutral'
    
    if ema50 and price < ema50 and cbbi < DEFAULT_T1:
        zone = 1
        rec = 'accumulate'
    elif row.get('ema20') and price > row['ema20'] and cbbi > DEFAULT_T3:
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
    acct = client.get_account()
    cash = float(acct.cash)
    
    try:
        pos = client.get_all_positions()
        btc_qty = next((float(p.qty) for p in pos if p.symbol == SYMBOL), 0.0)
    except:
        btc_qty = 0.0

    print(f"💵 Cash Reserve: ${cash:.2f} | ₿ BTC Position: {btc_qty:.6f}")
    print(f"📊 Zone {zone}: {analysis['recommendation'].upper()}")

    result_log = {'action': 'none', 'amount': 0, 'zone': zone}

    if zone == 1:
        # Calculate breakdown
        pocket = DEFAULT_BASE_DCA * DEFAULT_F1
        reserve_drain = (DEFAULT_BASE_DCA * DEFAULT_F3) + (cash / 15.0)
        total_buy = round(pocket + reserve_drain, 2)
        
        # Display detailed breakdown
        print(f"\n🚀 ACCUMULATE - BUY SIGNAL")
        print(f"   💰 Daily Contribution (Pocket): ${pocket:.2f}")
        print(f"   🏦 Reserve Drain: ${reserve_drain:.2f}")
        print(f"   💵 Total Buy Amount: ${total_buy:.2f}")
        print(f"   📝 (${pocket:.2f} from contribution + ${reserve_drain:.2f} from reserve)")
        
        if cash >= reserve_drain:
            if not dry_run:
                order = client.submit_order(MarketOrderRequest(symbol=SYMBOL, notional=total_buy, side=OrderSide.BUY, time_in_force=TimeInForce.GTC))
                print(f"   ✅ Order Executed - ID: {order.id}")
                result_log.update({
                    'action': 'buy',
                    'total_amount': total_buy,
                    'pocket': pocket,
                    'reserve': reserve_drain,
                    'order_id': str(order.id)
                })
            else:
                print(f"   🧪 DRY RUN - No actual order placed")
                result_log.update({
                    'action': 'buy_dry_run',
                    'total_amount': total_buy,
                    'pocket': pocket,
                    'reserve': reserve_drain
                })
        else:
            print(f"   ❌ Insufficient Cash - Need ${reserve_drain:.2f}, have ${cash:.2f}")
            result_log.update({'action': 'insufficient_funds', 'required': reserve_drain, 'available': cash})

    elif zone == 2:
        pocket = DEFAULT_BASE_DCA
        
        print(f"\n⚖️  NEUTRAL - STANDARD DCA")
        print(f"   💰 Daily Contribution (Pocket): ${pocket:.2f}")
        print(f"   💵 Total Buy Amount: ${pocket:.2f}")
        
        if cash >= pocket:
            if not dry_run:
                order = client.submit_order(MarketOrderRequest(symbol=SYMBOL, notional=pocket, side=OrderSide.BUY, time_in_force=TimeInForce.GTC))
                print(f"   ✅ Order Executed - ID: {order.id}")
                result_log.update({
                    'action': 'buy',
                    'total_amount': pocket,
                    'pocket': pocket,
                    'reserve': 0,
                    'order_id': str(order.id)
                })
            else:
                print(f"   🧪 DRY RUN - No actual order placed")
                result_log.update({
                    'action': 'buy_dry_run',
                    'total_amount': pocket,
                    'pocket': pocket,
                    'reserve': 0
                })
        else:
            print(f"   ❌ Insufficient Cash - Need ${pocket:.2f}, have ${cash:.2f}")
            result_log.update({'action': 'insufficient_funds', 'required': pocket, 'available': cash})

    elif zone == 3:
        pocket = DEFAULT_BASE_DCA * DEFAULT_F3
        
        print(f"\n🔻 REDUCE - SELL SIGNAL")
        
        # Small buy if F3 > 0
        if pocket > 0:
            print(f"   💰 Daily Contribution (Pocket): ${pocket:.2f}")
            if cash >= pocket:
                if not dry_run:
                    order = client.submit_order(MarketOrderRequest(symbol=SYMBOL, notional=pocket, side=OrderSide.BUY, time_in_force=TimeInForce.GTC))
                    print(f"   ✅ Buy Order Executed - ID: {order.id}")
                    result_log.update({
                        'action': 'buy',
                        'total_amount': pocket,
                        'pocket': pocket,
                        'reserve': 0,
                        'order_id': str(order.id)
                    })
                else:
                    print(f"   🧪 DRY RUN - Would buy ${pocket:.2f}")
                    result_log.update({'action': 'buy_dry_run', 'total_amount': pocket, 'pocket': pocket, 'reserve': 0})
        
        # Sell portion of BTC
        if btc_qty > 0:
            sell_qty = round(btc_qty * (DEFAULT_SELL_FACTOR / 100.0), 8)
            if sell_qty > 0:
                print(f"   📉 Sell {DEFAULT_SELL_FACTOR}% of BTC: {sell_qty:.8f} BTC")
                if not dry_run:
                    order = client.submit_order(MarketOrderRequest(symbol=SYMBOL, qty=sell_qty, side=OrderSide.SELL, time_in_force=TimeInForce.GTC))
                    print(f"   ✅ Sell Order Executed - ID: {order.id}")
                    result_log.update({
                        'action': 'sell',
                        'sell_qty': sell_qty,
                        'sell_percentage': DEFAULT_SELL_FACTOR,
                        'order_id': str(order.id)
                    })
                else:
                    print(f"   🧪 DRY RUN - Would sell {sell_qty:.8f} BTC")
                    result_log.update({'action': 'sell_dry_run', 'sell_qty': sell_qty, 'sell_percentage': DEFAULT_SELL_FACTOR})
        else:
            print(f"   ⚠️  No BTC to sell")

    return result_log

def lambda_handler(event, context):
    print("--- Starting AlphaRise Automation ---")
    
    target_date = get_target_date()
    print(f"📅 Target Date (UTC): {target_date}")

    if check_already_traded(target_date):
        return {'statusCode': 200, 'body': json.dumps({'message': 'Already traded today.'})}

    try:
        data = fetch_cbbi_data()
        analysis = analyze_market(data, target_date)
        
        if not analysis:
            # 🔴 FIX 3: Return clean JSON when data is missing
            return {'statusCode': 200, 'body': json.dumps({'status': 'skipped', 'reason': f'No data for {target_date}'})}
            
        print(f"📊 Analysis: Zone {analysis['zone']} ({analysis['recommendation']})")

        dry_run = os.getenv('DRY_RUN', 'false').lower() == 'true'
        client = TradingClient(ALPACA_API_KEY, ALPACA_SECRET_KEY, paper=True)
        
        result = execute_strategy(analysis, client, dry_run=dry_run)
        
        if S3_BUCKET_NAME and not dry_run and result.get('action') != 'none':
            get_s3_client().put_object(
                Bucket=S3_BUCKET_NAME,
                Key=f"executions/{target_date}.json",
                Body=json.dumps({'analysis': analysis, 'result': result})
            )

        return {'statusCode': 200, 'body': json.dumps(result)}

    except Exception as e:
        print(f"❌ Execution Failed: {e}")
        # 🔴 FIX 4: Return JSON error so test_local doesn't crash
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}
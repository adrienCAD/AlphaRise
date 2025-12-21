"""
AWS Lambda function for AlphaRise daily trading automation
Fetches CBBI data, calculates analysis, and executes Alpaca orders
"""
import json
import os
import boto3
from datetime import datetime
import requests
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from config.config import (
    DEFAULT_T1, DEFAULT_T3, DEFAULT_BASE_DCA, DEFAULT_F1, DEFAULT_F3, DEFAULT_SELL_FACTOR,
    CBBI_API_URL, ALPACA_BASE_URL, S3_BUCKET_NAME,
    TRADING_SYMBOL, CBBI_POSTING_HOUR, EST_TIMEZONE,
    ALPACA_API_KEY, ALPACA_SECRET_KEY
)

def get_s3_client():
    """Get S3 client if bucket is configured"""
    return boto3.client('s3') if S3_BUCKET_NAME else None


def get_secrets():
    """Retrieve Alpaca API keys from environment variables"""
    api_key = ALPACA_API_KEY or os.getenv('ALPACA_API_KEY', '')
    secret_key = ALPACA_SECRET_KEY or os.getenv('ALPACA_SECRET_KEY', '')
    
    if not api_key or not secret_key:
        raise Exception("ALPACA_API_KEY and ALPACA_SECRET_KEY must be set as environment variables")
    
    return {
        'api_key': api_key,
        'secret_key': secret_key
    }


def calculate_ema(prices, period):
    """Calculate Exponential Moving Average"""
    if len(prices) < period:
        return [None] * len(prices)
    
    k = 2.0 / (period + 1)
    ema = [None] * len(prices)
    
    # Calculate SMA for first period values
    sma = sum(prices[:period]) / period
    ema[period - 1] = sma
    
    # Calculate EMA for remaining values
    for i in range(period, len(prices)):
        ema[i] = (prices[i] * k) + (ema[i - 1] * (1 - k))
    
    return ema


def fetch_cbbi_data():
    """Fetch CBBI data from API"""
    try:
        # Add headers to avoid 406 Not Acceptable error
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://colintalkscrypto.com/',
            'Origin': 'https://colintalkscrypto.com'
        }
        url = CBBI_API_URL
        
        # Try direct request first
        try:
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()
        except requests.exceptions.HTTPError as e:
            # If 406 error, try using CORS proxy as fallback (like frontend does)
            if e.response.status_code == 406:
                import urllib.parse
                proxy_url = f'https://corsproxy.io/?{urllib.parse.quote(url)}'
                response = requests.get(proxy_url, headers=headers, timeout=15)
                response.raise_for_status()
                data = response.json()
            else:
                raise
        
        prices = data.get('Price') or data.get('BTC') or {}
        confidence = data.get('Confidence') or data.get('CBBI') or {}
        
        raw_data = []
        for ts in sorted(prices.keys(), key=lambda x: int(x)):
            t = int(ts)
            if t < 10000000000:
                t *= 1000
            
            date_str = datetime.fromtimestamp(t / 1000).strftime('%Y-%m-%d')
            c = confidence.get(ts, 50)
            if c <= 1:
                c = round(c * 100)
            if not c:
                c = 50
            
            raw_data.append({
                'date': date_str,
                'price': prices[ts],
                'cbbi': c
            })
        
        # Calculate EMAs
        price_array = [d['price'] for d in raw_data]
        ema20 = calculate_ema(price_array, 20)
        ema50 = calculate_ema(price_array, 50)
        ema100 = calculate_ema(price_array, 100)
        
        # Add EMAs to data
        result = []
        for i, d in enumerate(raw_data):
            if d['price'] > 0:
                result.append({
                    **d,
                    'ema20': ema20[i] if ema20[i] is not None else d['price'],
                    'ema50': ema50[i] if ema50[i] is not None else d['price'],
                    'ema100': ema100[i] if ema100[i] is not None else d['price']
                })
        
        return result
    except Exception as e:
        raise Exception(f"Failed to fetch CBBI data: {str(e)}")


def get_effective_est_date():
    """Get effective EST date based on CBBI posting schedule (7 AM EST)"""
    now = datetime.now(EST_TIMEZONE)
    if now.hour < CBBI_POSTING_HOUR:
        # Before 7 AM EST, use yesterday's date
        yesterday = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday = yesterday.replace(day=yesterday.day - 1)
        return yesterday.strftime('%Y-%m-%d')
    # After 7 AM EST, use today's date
    return now.strftime('%Y-%m-%d')


def calculate_daily_analysis(market_data, target_date, t1, t3):
    """Calculate daily analysis for a specific date"""
    if not market_data:
        return None
    
    # Find the data point for target_date
    target_data = None
    for data in market_data:
        if data['date'] == target_date:
            target_data = data
            break
    
    # If target date not found, use the latest available date (fallback)
    if not target_data:
        # Sort by date and get the most recent
        sorted_data = sorted(market_data, key=lambda x: x['date'], reverse=True)
        if sorted_data:
            target_data = sorted_data[0]
            print(f"⚠️  Target date {target_date} not found, using latest available date: {target_data['date']}")
        else:
            return None
    
    price = target_data['price']
    cbbi = target_data['cbbi']
    ema20 = target_data.get('ema20')
    ema50 = target_data.get('ema50')
    ema100 = target_data.get('ema100')
    
    # Determine zone
    zone = 2  # Neutral
    recommendation = 'neutral'
    
    # Zone 1 (Accumulation): Price < EMA50 & CBBI < t1
    if ema50 and price < ema50 and cbbi < t1:
        zone = 1
        recommendation = 'accumulate'
    # Zone 3 (Reduction): Price > EMA20 & CBBI > t3
    elif ema20 and price > ema20 and cbbi > t3:
        zone = 3
        recommendation = 'reduce'
    
    # Calculate tier
    if cbbi < 30:
        tier = 1
    elif cbbi < 50:
        tier = 2
    elif cbbi < 70:
        tier = 3
    elif cbbi < 85:
        tier = 4
    else:
        tier = 5
    
    return {
        'date': target_date,
        'zone': zone,
        'recommendation': recommendation,
        'tier': tier,
        'price': price,
        'cbbi': cbbi,
        'ema20': ema20,
        'ema50': ema50,
        'ema100': ema100
    }


def calculate_daily_contribution(zone, recommendation, base_dca, f1, f3):
    """Calculate daily DCA contribution based on zone"""
    if zone == 1 or recommendation == 'accumulate':
        return base_dca * f1
    elif zone == 2 or recommendation == 'neutral':
        return base_dca
    elif zone == 3 or recommendation == 'reduce':
        return base_dca * f3
    return base_dca


def calculate_zone1_buy_amount(base_dca, f1, f3, reserve_cash):
    """Calculate buy amount for Zone 1 (Accumulate)"""
    fresh_input = base_dca * f1
    drain_target = (base_dca * f3) + (reserve_cash / 15.0)
    drain_amount = min(reserve_cash, drain_target)
    return {
        'fresh_input': fresh_input,
        'drain_amount': drain_amount,
        'total_buy_usd': fresh_input + drain_amount
    }


def calculate_zone2_buy_amount(base_dca):
    """Calculate buy amount for Zone 2 (Neutral)"""
    return {
        'fresh_input': base_dca,
        'drain_amount': 0,
        'total_buy_usd': base_dca
    }


def calculate_zone3_buy_amount(base_dca, f3):
    """Calculate buy amount for Zone 3 (Reduce)"""
    return {
        'fresh_input': base_dca * f3,
        'drain_amount': 0,
        'total_buy_usd': base_dca * f3
    }


def execute_alpaca_order(analysis, secrets, base_dca, f1, f3, sell_factor, dry_run=False):
    """Execute Alpaca order based on analysis"""
    # Initialize Alpaca client
    trading_client = TradingClient(
        api_key=secrets['api_key'],
        secret_key=secrets['secret_key'],
        paper=True if 'paper' in ALPACA_BASE_URL.lower() else False
    )
    
    zone = analysis['zone']
    recommendation = analysis['recommendation']
    
    # Get account info
    account = trading_client.get_account()
    cash_reserve = float(account.cash)
    
    # Get BTC position
    positions = trading_client.get_all_positions()
    btc_position = None
    for pos in positions:
        if TRADING_SYMBOL in pos.symbol:
            btc_position = pos
            break
    
    total_btc = float(btc_position.qty) if btc_position else 0.0
    
    # Calculate daily contribution
    daily_contribution = calculate_daily_contribution(
        zone, recommendation, base_dca, f1, f3
    )
    
    results = {
        'date': analysis['date'],
        'zone': zone,
        'recommendation': recommendation,
        'cash_before': cash_reserve,
        'btc_before': total_btc,
        'daily_contribution': daily_contribution,
        'actions': []
    }
    
    # Execute based on zone
    if zone == 1 or recommendation == 'accumulate':
        calc = calculate_zone1_buy_amount(base_dca, f1, f3, cash_reserve)
        results['calculation'] = calc
        
        if dry_run:
            results['actions'].append({
                'type': 'buy',
                'amount': calc['total_buy_usd'],
                'breakdown': {
                    'from_daily_contribution': calc['fresh_input'],
                    'from_reserve': calc['drain_amount']
                },
                'result': {
                    'success': True,
                    'dry_run': True,
                    'message': f"DRY RUN: Would buy ${calc['total_buy_usd']:.2f} of {TRADING_SYMBOL}"
                }
            })
        else:
            if cash_reserve >= calc['total_buy_usd']:
                order = trading_client.submit_order(
                    order_data=MarketOrderRequest(
                        symbol=TRADING_SYMBOL,
                        notional=calc['total_buy_usd'],
                        side=OrderSide.BUY,
                        time_in_force=TimeInForce.GTC
                    )
                )
                results['actions'].append({
                    'type': 'buy',
                    'amount': calc['total_buy_usd'],
                    'breakdown': {
                        'from_daily_contribution': calc['fresh_input'],
                        'from_reserve': calc['drain_amount']
                    },
                    'result': {
                        'success': True,
                        'order_id': order.id,
                        'status': order.status
                    }
                })
            else:
                shortfall = calc['total_buy_usd'] - cash_reserve
                results['actions'].append({
                    'type': 'buy',
                    'amount': calc['total_buy_usd'],
                    'result': {
                        'success': False,
                        'error': f"Insufficient cash. Need ${calc['total_buy_usd']:.2f}, have ${cash_reserve:.2f}"
                    }
                })
    
    elif zone == 2 or recommendation == 'neutral':
        calc = calculate_zone2_buy_amount(base_dca)
        results['calculation'] = calc
        
        if dry_run:
            results['actions'].append({
                'type': 'buy',
                'amount': calc['total_buy_usd'],
                'result': {
                    'success': True,
                    'dry_run': True,
                    'message': f"DRY RUN: Would buy ${calc['total_buy_usd']:.2f} of {TRADING_SYMBOL}"
                }
            })
        else:
            if cash_reserve >= calc['total_buy_usd']:
                order = trading_client.submit_order(
                    order_data=MarketOrderRequest(
                        symbol=TRADING_SYMBOL,
                        notional=calc['total_buy_usd'],
                        side=OrderSide.BUY,
                        time_in_force=TimeInForce.GTC
                    )
                )
                results['actions'].append({
                    'type': 'buy',
                    'amount': calc['total_buy_usd'],
                    'result': {
                        'success': True,
                        'order_id': order.id,
                        'status': order.status
                    }
                })
    
    elif zone == 3 or recommendation == 'reduce':
        calc = calculate_zone3_buy_amount(base_dca, f3)
        
        if calc['total_buy_usd'] > 0:
            if not dry_run and cash_reserve >= calc['total_buy_usd']:
                order = trading_client.submit_order(
                    order_data=MarketOrderRequest(
                        symbol=TRADING_SYMBOL,
                        notional=calc['total_buy_usd'],
                        side=OrderSide.BUY,
                        time_in_force=TimeInForce.GTC
                    )
                )
                results['actions'].append({
                    'type': 'buy',
                    'amount': calc['total_buy_usd'],
                    'result': {
                        'success': True,
                        'order_id': order.id
                    }
                })
        
        # Execute sell order
        if total_btc > 0:
            sell_qty = total_btc * (sell_factor / 100.0)
            if dry_run:
                results['actions'].append({
                    'type': 'sell',
                    'qty': sell_qty,
                    'result': {
                        'success': True,
                        'dry_run': True,
                        'message': f"DRY RUN: Would sell {sell_qty:.6f} {TRADING_SYMBOL}"
                    }
                })
            else:
                order = trading_client.submit_order(
                    order_data=MarketOrderRequest(
                        symbol=TRADING_SYMBOL,
                        qty=sell_qty,
                        side=OrderSide.SELL,
                        time_in_force=TimeInForce.GTC
                    )
                )
                results['actions'].append({
                    'type': 'sell',
                    'qty': sell_qty,
                    'result': {
                        'success': True,
                        'order_id': order.id,
                        'status': order.status
                    }
                })
    
    return results


def store_results(analysis, execution_result, s3_bucket=None):
    """Store results to S3 (optional)"""
    if not s3_bucket:
        return
    
    try:
        s3_client = get_s3_client()
        if not s3_client:
            return
        
        key = f"executions/{analysis['date']}.json"
        data = {
            'analysis': analysis,
            'execution': execution_result,
            'timestamp': datetime.now().isoformat()
        }
        s3_client.put_object(
            Bucket=s3_bucket,
            Key=key,
            Body=json.dumps(data, indent=2),
            ContentType='application/json'
        )
    except Exception as e:
        print(f"Warning: Failed to store results to S3: {str(e)}")


def lambda_handler(event, context):
    """Main Lambda handler"""
    try:
        # Get configuration from environment or defaults
        t1 = DEFAULT_T1
        t3 = DEFAULT_T3
        base_dca = DEFAULT_BASE_DCA
        f1 = DEFAULT_F1
        f3 = DEFAULT_F3
        sell_factor = DEFAULT_SELL_FACTOR
        dry_run = os.getenv('DRY_RUN', 'false').lower() == 'true'
        
        # Get effective date (EST-based)
        effective_date = get_effective_est_date()
        
        # Fetch CBBI data
        print(f"Fetching CBBI data for {effective_date}...")
        market_data = fetch_cbbi_data()
        
        if not market_data:
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'success': False,
                    'error': 'No market data available'
                })
            }
        
        # Calculate daily analysis
        print(f"Calculating daily analysis for {effective_date}...")
        print(f"Available dates in data: {[d['date'] for d in market_data[-5:]]}")  # Show last 5 dates
        analysis = calculate_daily_analysis(market_data, effective_date, t1, t3)
        
        if not analysis:
            available_dates = [d['date'] for d in market_data[-10:]]  # Show last 10 dates
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'success': False,
                    'error': f'No analysis data for {effective_date}. Available dates: {available_dates}'
                })
            }
        
        # Get secrets
        print("Retrieving Alpaca API keys...")
        secrets = get_secrets()
        
        # Execute Alpaca order
        print(f"Executing strategy (Zone {analysis['zone']}, {analysis['recommendation']})...")
        execution_result = execute_alpaca_order(
            analysis, secrets, base_dca, f1, f3, sell_factor, dry_run
        )
        
        # Store results (optional)
        if S3_BUCKET_NAME:
            store_results(analysis, execution_result, S3_BUCKET_NAME)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'dry_run': dry_run,
                'analysis': analysis,
                'execution': execution_result
            }, indent=2)
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'error': str(e)
            })
        }


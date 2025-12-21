"""
Configuration constants for AlphaRise Lambda function
Can be overridden by environment variables
"""
import os
from datetime import datetime
import pytz

# Strategy parameters (defaults - can be overridden via environment variables)
DEFAULT_T1 = int(os.getenv('T1', 67))
DEFAULT_T3 = int(os.getenv('T3', 77))
DEFAULT_BASE_DCA = float(os.getenv('BASE_DCA', 20.0))
DEFAULT_F1 = float(os.getenv('F1', 10.0))
DEFAULT_F3 = float(os.getenv('F3', 0.0))
DEFAULT_SELL_FACTOR = float(os.getenv('SELL_FACTOR', 5.0))

# API endpoints
CBBI_API_URL = 'https://colintalkscrypto.com/cbbi/data/latest.json'
ALPACA_BASE_URL = 'https://paper-api.alpaca.markets'  # Change to live URL for production

# AWS resources
S3_BUCKET_NAME = os.getenv('S3_BUCKET_NAME', '')  # Optional - leave empty to disable S3 storage

# Alpaca API keys (from environment variables)
ALPACA_API_KEY = os.getenv('ALPACA_API_KEY', '')
ALPACA_SECRET_KEY = os.getenv('ALPACA_SECRET_KEY', '')

# Trading symbol
TRADING_SYMBOL = os.getenv('TRADING_SYMBOL', 'BTCUSD')

# CBBI posting schedule (7 AM EST)
CBBI_POSTING_HOUR = 7
EST_TIMEZONE = pytz.timezone('America/New_York')


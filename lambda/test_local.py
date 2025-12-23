"""
Local testing script for Lambda function
Run: python test_local.py

Prerequisite: pip install python-dotenv
"""
import json
import os
import sys
from pathlib import Path
from dotenv import dotenv_values

# 1. Setup Environment
# Try to find .env in current dir or parents
current_dir = Path(__file__).parent
env_path = None

for path in [current_dir, current_dir.parent, current_dir.parent.parent]:
    check_path = path / '.env'
    if check_path.exists():
        env_path = check_path
        break

if not env_path:
    print("⚠️  Warning: Could not find .env file. Relying on system environment variables.")
    env_vars = {}
else:
    print(f"✅ Loaded .env from: {env_path}")
    env_vars = dotenv_values(env_path)

# 2. Configure Mock Environment
# Map your local .env keys to what Lambda expects
api_key = env_vars.get('VITE_ALPACA_API_KEY') or env_vars.get('ALPACA_API_KEY')
secret_key = env_vars.get('VITE_ALPACA_SECRET_KEY') or env_vars.get('ALPACA_SECRET_KEY')

if api_key: os.environ['ALPACA_API_KEY'] = api_key
if secret_key: os.environ['ALPACA_SECRET_KEY'] = secret_key

os.environ['DRY_RUN'] = 'true'
# CRITICAL: Unset S3 Bucket to prevent script from trying to call AWS S3 locally
if 'S3_BUCKET_NAME' in os.environ:
    del os.environ['S3_BUCKET_NAME']

# 3. Import Lambda Handler (Import *after* setting env vars just in case)
try:
    from lambda_function import lambda_handler
except ImportError:
    print("❌ Error: lambda_function.py not found. Make sure you are in the correct directory.")
    sys.exit(1)

# Mock Context Object (AWS Simulation)
class MockContext:
    def __init__(self):
        self.function_name = 'alpharise-daily-trading'
        self.memory_limit_in_mb = 512
        self.aws_request_id = 'local-test-req-id'
        self.remaining_time_in_millis = lambda: 30000

def run_test():
    print("=" * 60)
    print("🚀 Starting Local AlphaRise Test (Dry Run)")
    print("=" * 60)

    # Invoke
    try:
        event = {}
        context = MockContext()
        result = lambda_handler(event, context)
        
        # Output Results
        status = result['statusCode']
        body = json.loads(result['body']) if isinstance(result['body'], str) else result['body']

        print(f"\n📊 Status Code: {status}")
        print("📝 Response Body:")
        print(json.dumps(body, indent=2))

        if status == 200:
            print("\n✅ SUCCESS: Logic executed without errors.")
            if body.get('execution', {}).get('action') == 'buy_dry_run':
                 print(f"💰 BUY SIGNAL DETECTED: ${body['execution']['amount']}")
            elif body.get('execution', {}).get('action') == 'sell_dry_run':
                 print(f"🔻 SELL SIGNAL DETECTED: {body['execution']['qty']} BTC")
            else:
                 print("⚖️  NO TRADE ACTION (Neutral or Insufficient Funds)")
        else:
            print("\n❌ FAILED: Logic returned an error.")

    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    run_test()
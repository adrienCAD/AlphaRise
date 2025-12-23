import json
import os
import sys
from pathlib import Path
from datetime import datetime
from dotenv import dotenv_values

# 1. Setup Environment
# Look for .env in current dir or parents
current_dir = Path(__file__).parent
env_path = None

for path in [current_dir, current_dir.parent, current_dir.parent.parent]:
    check_path = path / '.env'
    if check_path.exists():
        env_path = check_path
        break

if not env_path:
    print("⚠️  Warning: Could not find .env file.")
    env_vars = {}
else:
    print(f"✅ Loaded .env from: {env_path}")
    env_vars = dotenv_values(env_path)

# 2. Load Configuration (Fixed)
# Load ALL variables from .env (e.g., BASE_DCA, F1, T1) into the environment
for key, value in env_vars.items():
    if value is not None:
        os.environ[key] = str(value)

# Map VITE_ keys if the standard ones aren't found
if 'ALPACA_API_KEY' not in os.environ:
    val = env_vars.get('VITE_ALPACA_API_KEY')
    if val: os.environ['ALPACA_API_KEY'] = val

if 'ALPACA_SECRET_KEY' not in os.environ:
    val = env_vars.get('VITE_ALPACA_SECRET_KEY')
    if val: os.environ['ALPACA_SECRET_KEY'] = val

# 3. Test Configuration
os.environ['DRY_RUN'] = 'true'
if 'S3_BUCKET_NAME' in os.environ: del os.environ['S3_BUCKET_NAME']

# --- 🕒 TIME MACHINE (Automatic Fix) ---
# Forces the bot to use your Local System Date instead of UTC.
# This prevents "It's tomorrow in UTC but data isn't out yet" errors.
os.environ['OVERRIDE_DATE'] = datetime.now().strftime('%Y-%m-%d')
# ----------------------------------

try:
    from lambda_function import lambda_handler
except ImportError:
    print("❌ Error: lambda_function.py not found.")
    sys.exit(1)

class MockContext:
    def __init__(self):
        self.function_name = 'alpharise-daily-trading'
        self.memory_limit_in_mb = 512
        self.aws_request_id = 'local-test-req-id'
        self.remaining_time_in_millis = lambda: 30000

def run_test():
    print("=" * 60)
    print(f"🚀 Starting Local AlphaRise Test (Date: {os.environ['OVERRIDE_DATE']})")
    print("=" * 60)

    try:
        event = {}
        context = MockContext()
        result = lambda_handler(event, context)
        
        status = result['statusCode']
        
        # Robust JSON parsing (handles double-encoded strings if needed)
        raw_body = result['body']
        if isinstance(raw_body, str):
            try:
                body = json.loads(raw_body)
            except json.JSONDecodeError:
                body = raw_body 
        else:
            body = raw_body

        print(f"\n📊 Status Code: {status}")
        print("📝 Response Body:")
        print(json.dumps(body, indent=2) if isinstance(body, dict) else body)

    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    run_test()
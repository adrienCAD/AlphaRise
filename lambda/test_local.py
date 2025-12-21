"""
Local testing script for Lambda function
Run: python test_local.py

Loads API keys from parent directory .env file using dotenv
"""
import json
import os
from pathlib import Path
from dotenv import dotenv_values
from lambda_function import lambda_handler

# Load environment variables from .env file one folder up from AlphaRise
# Path: lambda/test_local.py -> lambda/ -> AlphaRise/ -> REPOs/ -> .env
parent_dir = Path(__file__).parent.parent.parent
env_path = parent_dir / '.env'
env_vars = dotenv_values(env_path)

# Mock event and context for local testing
class MockContext:
    def __init__(self):
        self.function_name = 'alpharise-daily-trading'
        self.function_version = '$LATEST'
        self.invoked_function_arn = 'arn:aws:lambda:us-east-1:123456789012:function:alpharise-daily-trading'
        self.memory_limit_in_mb = 512
        self.aws_request_id = 'test-request-id'
        self.log_group_name = '/aws/lambda/alpharise-daily-trading'
        self.log_stream_name = 'test-stream'
        self.remaining_time_in_millis = lambda: 30000

def test_lambda_handler():
    """Test the Lambda handler locally"""
    print("=" * 60)
    print("Testing AlphaRise Lambda Function Locally")
    print("=" * 60)
    print()
    
    # Get API keys from .env file using dotenv_values()
    api_key = env_vars.get('VITE_ALPACA_API_KEY') or env_vars.get('ALPACA_API_KEY')
    secret_key = env_vars.get('VITE_ALPACA_SECRET_KEY') or env_vars.get('ALPACA_SECRET_KEY')
    
    if not api_key or not secret_key:
        print("⚠️  Warning: API keys not found in .env file")
        print(f"   Looking for: VITE_ALPACA_API_KEY or ALPACA_API_KEY")
        print(f"   Looking for: VITE_ALPACA_SECRET_KEY or ALPACA_SECRET_KEY")
        print(f"   Checked .env file at: {env_path}")
        print()
    else:
        print(f"✅ API keys loaded from: {env_path}")
        print()
    
    # Set environment variables for Lambda function (it expects ALPACA_API_KEY, not VITE_ALPACA_API_KEY)
    if api_key:
        os.environ['ALPACA_API_KEY'] = api_key
    if secret_key:
        os.environ['ALPACA_SECRET_KEY'] = secret_key
    
    # Set dry run mode for testing
    os.environ['DRY_RUN'] = 'true'
    
    # Create mock event and context
    event = {}
    context = MockContext()
    
    try:
        print("🔄 Invoking Lambda handler...")
        print()
        
        # Invoke the handler
        result = lambda_handler(event, context)
        
        # Parse the response
        status_code = result['statusCode']
        body = json.loads(result['body'])
        
        print("=" * 60)
        print("Result:")
        print("=" * 60)
        print(f"Status Code: {status_code}")
        print()
        print("Response Body:")
        print(json.dumps(body, indent=2))
        print()
        
        if status_code == 200 and body.get('success'):
            print("✅ Test passed!")
            if body.get('dry_run'):
                print("ℹ️  Running in DRY RUN mode - no actual orders placed")
        else:
            print("❌ Test failed!")
            if 'error' in body:
                print(f"Error: {body['error']}")
        
    except Exception as e:
        print("=" * 60)
        print("❌ Exception occurred:")
        print("=" * 60)
        print(str(e))
        import traceback
        traceback.print_exc()
        return False
    
    print("=" * 60)
    return True

if __name__ == '__main__':
    success = test_lambda_handler()
    exit(0 if success else 1)


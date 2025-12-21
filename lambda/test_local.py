"""
Local testing script for Lambda function
Run: python test_local.py

Make sure to set up AWS credentials or environment variables before testing.
"""
import json
import os
from lambda_function import lambda_handler

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
    
    # Set environment variables for testing (optional)
    # Uncomment and set values if not using AWS Secrets Manager
    # os.environ['ALPACA_API_KEY'] = 'your_test_key'
    # os.environ['ALPACA_SECRET_KEY'] = 'your_test_secret'
    
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


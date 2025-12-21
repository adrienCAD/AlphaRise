# AlphaRise Lambda Function

AWS Lambda function for automated daily trading execution of the AlphaRise V_DCA strategy.

## Overview

This Lambda function:
1. Fetches CBBI (Colin Talks Crypto Bitcoin Index) data
2. Calculates EMAs (20, 50, 100) and daily analysis
3. Determines the trading zone and recommendation
4. Executes orders on Alpaca based on the strategy

## Prerequisites

- AWS Account
- AWS CLI configured
- Alpaca Paper Trading account (or Live account)
- Python 3.9+ (for local testing)

## AWS Setup

### 1. Create IAM Role for Lambda

Create an IAM role with the following policies:
- `AWSLambdaBasicExecutionRole` (for CloudWatch Logs)
- (Optional) S3 policy if using S3 storage:
  ```json
  {
    "Effect": "Allow",
    "Action": [
      "s3:PutObject"
    ],
    "Resource": "arn:aws:s3:::your-bucket-name/executions/*"
  }
  ```

### 3. Create Lambda Function

1. Go to AWS Lambda Console
2. Create function → Author from scratch
3. Name: `alpharise-daily-trading`
4. Runtime: Python 3.11
5. Architecture: x86_64
6. Execution role: Use the IAM role created above

### 4. Configure Environment Variables

**Required:**
- `ALPACA_API_KEY`: Your Alpaca API key
- `ALPACA_SECRET_KEY`: Your Alpaca secret key

**Optional Strategy Parameters:**
- `T1`: Accumulation threshold (default: 67)
- `T3`: Reduction threshold (default: 77)
- `BASE_DCA`: Base DCA amount (default: 20.0)
- `F1`: Accumulation factor (default: 10.0)
- `F3`: Reduction factor (default: 0.0)
- `SELL_FACTOR`: Sell percentage (default: 5.0)
- `DRY_RUN`: Set to `true` for testing (default: false)
- `S3_BUCKET_NAME`: S3 bucket for storing results (optional)
- `TRADING_SYMBOL`: Trading symbol (default: BTCUSD)

**To set environment variables in Lambda:**
1. Go to Lambda function → Configuration → Environment variables
2. Add each variable with its value
3. For API keys, use encrypted environment variables (recommended)

### 5. Create EventBridge Rule

Schedule the function to run daily at 7:30 AM EST (after CBBI posts at 7 AM):

1. Go to EventBridge → Rules
2. Create rule
3. Name: `alpharise-daily-trigger`
4. Schedule: `cron(30 12 * * ? *)` (12:30 UTC = 7:30 AM EST)
5. Target: Lambda function → `alpharise-daily-trading`

## Deployment

### Option 1: Using deploy.sh Script

```bash
cd lambda
chmod +x deploy.sh
./deploy.sh
```

Then upload `lambda_function.zip` to AWS Lambda via console.

### Option 2: Manual Deployment

```bash
cd lambda

# Install dependencies
pip install -r requirements.txt -t .

# Create deployment package
zip -r lambda_function.zip . -x "*.git*" "*.pyc" "__pycache__/*" "*.md" "deploy.sh" "test_local.py"

# Upload to Lambda (using AWS CLI)
aws lambda update-function-code \
  --function-name alpharise-daily-trading \
  --zip-file fileb://lambda_function.zip
```

### Option 3: Using AWS SAM

Create a `template.yaml` file and use SAM CLI:

```bash
sam build
sam deploy --guided
```

## Local Testing

Test the function locally before deploying:

```bash
cd lambda
python test_local.py
```

Make sure to set up local AWS credentials or use environment variables for testing.

## Monitoring

- **CloudWatch Logs**: View execution logs in `/aws/lambda/alpharise-daily-trading`
- **CloudWatch Metrics**: Monitor invocations, errors, duration
- **S3**: Check execution results in S3 bucket (if configured)

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   - Ensure `ALPACA_API_KEY` and `ALPACA_SECRET_KEY` are set in Lambda environment variables
   - Use encrypted environment variables for API keys (recommended)

2. **Alpaca API Errors**
   - Verify API keys are correct in Secrets Manager
   - Check if using paper vs live trading URL
   - Ensure account has sufficient buying power

3. **CBBI Data Fetch Failed**
   - Check internet connectivity from Lambda
   - Verify API endpoint is accessible
   - Check CloudWatch logs for detailed error

4. **Timeout Errors**
   - Increase Lambda timeout (default: 3 seconds, recommend: 30 seconds)
   - Check function memory allocation (recommend: 512 MB)

## Cost Estimation

- **Lambda**: Free tier (1M requests/month)
- **EventBridge**: Free tier (14M events/month)
- **S3**: Free tier (5GB storage) - Optional
- **Total**: **$0.00/month** (all within free tier)

## Security Notes

- Never commit API keys to version control
- Use **encrypted environment variables** in Lambda for API keys (recommended)
- Enable CloudWatch Logs encryption
- Use least privilege IAM policies
- Enable Lambda VPC if needed for additional security
- Consider using AWS Secrets Manager for production (adds ~$0.80/month)

## Support

For issues or questions, check:
- AWS Lambda documentation
- Alpaca API documentation
- CloudWatch Logs for execution details


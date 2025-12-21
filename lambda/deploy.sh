#!/bin/bash
# Deployment script for AWS Lambda function
# Creates a deployment package ready for upload to AWS Lambda

set -e

echo "🚀 AlphaRise Lambda Deployment Script"
echo "======================================"

# Check if we're in the lambda directory
if [ ! -f "lambda_function.py" ]; then
    echo "❌ Error: Must run from lambda/ directory"
    exit 1
fi

# Clean up any previous deployment package
if [ -f "lambda_function.zip" ]; then
    echo "🧹 Cleaning up previous deployment package..."
    rm lambda_function.zip
fi

# Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt -t . --quiet

# Create deployment package
echo "📦 Creating deployment package..."
zip -r lambda_function.zip . \
    -x "*.git*" \
    -x "*.pyc" \
    -x "__pycache__/*" \
    -x "*.md" \
    -x "deploy.sh" \
    -x "test_local.py" \
    -x "*.zip" \
    -x ".gitignore" \
    -x "*.DS_Store" \
    > /dev/null

# Check package size
PACKAGE_SIZE=$(du -h lambda_function.zip | cut -f1)
echo "✅ Deployment package created: lambda_function.zip ($PACKAGE_SIZE)"

# Check if package is too large (Lambda limit is 50MB unzipped, 250MB unzipped for container)
PACKAGE_SIZE_BYTES=$(stat -f%z lambda_function.zip 2>/dev/null || stat -c%s lambda_function.zip 2>/dev/null)
if [ "$PACKAGE_SIZE_BYTES" -gt 52428800 ]; then
    echo "⚠️  Warning: Package size exceeds 50MB. Consider using Lambda Layers."
fi

echo ""
echo "📤 Next steps:"
echo "1. Upload lambda_function.zip to AWS Lambda via console, or"
echo "2. Use AWS CLI: aws lambda update-function-code --function-name alpharise-daily-trading --zip-file fileb://lambda_function.zip"
echo ""
echo "✨ Done!"


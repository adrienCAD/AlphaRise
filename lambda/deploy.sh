#!/bin/bash

# 1. Define variables
PACKAGE_NAME="lambda_function.zip"
BUILD_DIR="build_package"

echo "🚀 Starting Clean Build..."

# 2. Clean up previous builds
rm -rf $BUILD_DIR
rm -f $PACKAGE_NAME

# 3. Create a temporary build directory
mkdir $BUILD_DIR

# 4. Install dependencies into the build directory (NOT your main folder)
# This keeps your workspace clean!
echo "📦 Installing dependencies to temporary folder..."
pip install -r requirements.txt --target ./$BUILD_DIR --quiet

# 5. Copy your Python handler into the build directory
echo "COPY Copying lambda_function.py..."
cp lambda_function.py ./$BUILD_DIR/

# 6. Create the Zip file from the build directory
echo "🤐 Zipping package..."
cd $BUILD_DIR
zip -r ../$PACKAGE_NAME . -x "*.dist-info/*" -x "**/__pycache__/*" > /dev/null
cd ..

# 7. Clean up: Remove the build directory
echo "🧹 Cleaning up temporary files..."
rm -rf $BUILD_DIR

echo "✅ DONE! Upload '$PACKAGE_NAME' to AWS Lambda."
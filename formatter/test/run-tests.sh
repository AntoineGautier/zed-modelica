#!/bin/bash

# Test script for prettier-plugin-modelica
# For each .mo file not containing '_formatted', run prettier and output to _formatted.mo
# Then check if there are any git diffs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORMATTER_DIR="$(dirname "$SCRIPT_DIR")"
TEST_DIR="$SCRIPT_DIR"

cd "$FORMATTER_DIR"

echo "Running formatter tests..."

# Find all .mo files not containing '_formatted' in the name
for file in "$TEST_DIR"/*.mo; do
    filename=$(basename "$file")
    
    # Skip files that contain '_formatted'
    if [[ "$filename" == *"_formatted"* ]]; then
        continue
    fi
    
    # Get the base name without extension
    base="${filename%.mo}"
    
    echo "Formatting: $filename"
    
    # Run prettier and output to _formatted.mo
    npx prettier --plugin ./dist/index.js "test/$filename" > "test/${base}_formatted.mo"
done

echo ""
echo "Checking for differences..."

# Check for git diffs in the test directory
if git diff --exit-code --quiet HEAD -- "$TEST_DIR"/*.mo; then
    echo "✓ No formatting differences detected."
else
    echo "✗ Formatting differences detected:"
    echo ""
    git diff HEAD -- "$TEST_DIR"/*.mo
    exit 1
fi

echo ""
echo "Running idempotence test..."
node "$TEST_DIR/verify-idempotence.js"
#!/bin/bash
# A robust script to build and deploy Firebase Functions from a monorepo.
set -e # Exit immediately if a command exits with a non-zero status.
set -o pipefail # The return value of a pipeline is the status of the last command.

echo "--- 1. Ensuring all dependencies are installed from root..."
npm install

echo "--- 2. Building all workspaces (including @pediaquiz/types and functions)..."
npm run build

echo "--- 3. Preparing a clean, self-contained deployment package in 'functions/dist'..."

# Create a clean distribution directory inside functions
rm -rf functions/dist
mkdir -p functions/dist

# Copy the essential files for deployment
echo "    > Copying compiled code (lib) and package.json..."
cp -r functions/lib functions/dist/
cp functions/package.json functions/dist/

# Create the node_modules structure and copy the bundled local dependency
echo "    > Bundling local dependency @pediaquiz/types..."
mkdir -p functions/dist/node_modules/@pediaquiz
cp -r packages/types/lib functions/dist/node_modules/@pediaquiz/types
cp packages/types/package.json functions/dist/node_modules/@pediaquiz/types/

echo "--- 4. All preparations complete. Deploying the packaged 'functions/dist' directory to Firebase..."
firebase deploy --only functions

echo "--- ✅ Deployment script finished successfully! ---"
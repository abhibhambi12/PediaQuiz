#!/bin/bash
# A robust script to build and deploy Firebase Functions from a monorepo.
set -e # Exit immediately if a command exits with a non-zero status.

# Argument to trigger build-only mode
if [ "$1" = "build-only" ]; then
    echo "--- Running a full, clean build of all local workspaces (build-only mode)..."
    npm run build

    echo "--- Preparing a clean, self-contained deployment package in 'functions/dist'..."
    # Create a clean distribution directory inside functions
    rm -rf functions/dist
    mkdir -p functions/dist

    # Copy the essential files for deployment
    echo "    > Copying compiled functions code (lib) and its package.json..."
    cp -r functions/lib functions/dist/
    cp functions/package.json functions/dist/

    # Create the node_modules structure and copy the bundled local dependency
    echo "    > Physically bundling local dependency @pediaquiz/types..."
    mkdir -p functions/dist/node_modules/@pediaquiz
    cp -r packages/types/lib functions/dist/node_modules/@pediaquiz/types
    cp packages/types/package.json functions/dist/node_modules/@pediaquiz/types/
    echo "--- Local build and packaging complete in build-only mode. ---"
    exit 0
fi

# Original deploy logic (if not in build-only mode)
echo "--- 1. Running a full, clean build of all local workspaces (for direct deploy)..."
npm run build

echo "--- 2. Preparing a clean, self-contained deployment package in 'functions/dist'..."

# Create a clean distribution directory inside functions
rm -rf functions/dist
mkdir -p functions/dist

# Copy the essential files for deployment
echo "    > Copying compiled functions code (lib) and its package.json..."
cp -r functions/lib functions/dist/
cp functions/package.json functions/dist/

# Create the node_modules structure and copy the bundled local dependency
echo "    > Physically bundling local dependency @pediaquiz/types..."
mkdir -p functions/dist/node_modules/@pediaquiz
cp -r packages/types/lib functions/dist/node_modules/@pediaquiz/types
cp packages/types/package.json functions/dist/node_modules/@pediaquiz/types/

echo "--- 3. All preparations complete. Deploying from the 'functions/dist' directory..."
firebase deploy --only functions

echo "--- ✅ Deployment script finished successfully! ---"
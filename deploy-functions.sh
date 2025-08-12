#!/bin/bash

# --- Set Bash Options for Robustness ---
set -e   # Exit immediately if a command exits with a non-zero status.
set -o pipefail # Return value of a pipeline is the value of the last (rightmost) command to exit with a non-zero status, or zero if all commands in the pipeline exit successfully.
set -x   # Print commands and their arguments as they are executed (verbose output for debugging).

echo "--- Starting deploy-functions.sh script ---"

# --- Step 1: Build all workspace packages locally ---
# This builds @pediaquiz/types and functions/
echo "Building all workspace packages: npm run build"
npm run build || { echo "ERROR: Local build failed!"; exit 1; }

echo "--- Local build completed. Preparing functions for deployment. ---"

# --- Step 2: Prepare functions for deployment ---
# Navigate into the functions directory
echo "Navigating to functions directory: cd functions"
cd functions || { echo "ERROR: Could not navigate to functions directory!"; exit 1; }

# Remove the symlink for @pediaquiz/types created by npm workspaces
echo "Removing old @pediaquiz symlink..."
rm -rf node_modules/@pediaquiz || { echo "WARN: Failed to remove old @pediaquiz symlink (may not exist)."; }

# Create the directory structure for the local package
echo "Creating node_modules/@pediaquiz/types directory..."
mkdir -p node_modules/@pediaquiz/types || { echo "ERROR: Failed to create node_modules/@pediaquiz/types directory!"; exit 1; }

# Copy the BUILT code from the types package into the functions node_modules
echo "Copying built @pediaquiz/types code..."
cp ../packages/types/package.json node_modules/@pediaquiz/types/ || { echo "ERROR: Failed to copy types package.json!"; exit 1; }
cp -r ../packages/types/lib node_modules/@pediaquiz/types/ || { echo "ERROR: Failed to copy types lib folder!"; exit 1; }

echo "--- Local packages copied. Navigating back to root for Firebase deployment. ---"

# Navigate back to the root
echo "Navigating back to root directory: cd .."
cd .. || { echo "ERROR: Could not navigate back to root directory!"; exit 1; }

# --- Step 3: Deploy functions to Firebase ---
echo "--- Initiating Firebase deployment ---"
# Deploy only the functions
# This is the actual firebase deploy command
firebase deploy --only functions || { echo "ERROR: Firebase deployment failed!"; exit 1; }

echo "--- Deployment script finished successfully! ---"
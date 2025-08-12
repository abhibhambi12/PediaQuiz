#!/bin/bash
# A robust script to build and deploy Firebase Functions from a monorepo.
set -e # Exit immediately if a command exits with a non-zero status.

# Argument to trigger build-only mode
if [ "$1" = "build-only" ]; then
    echo "--- Running a full, clean build of all local workspaces (build-only mode)..."
    npm run build

    echo "--- Preparing a clean, self-contained deployment package in 'workspaces/functions/dist'..."
    # Create a clean distribution directory inside functions
    rm -rf workspaces/functions/dist
    mkdir -p workspaces/functions/dist

    # Copy the essential files for deployment
    echo "    > Copying compiled functions code (lib) and its package.json..."
    cp -r workspaces/functions/lib workspaces/functions/dist/
    cp workspaces/functions/package.json workspaces/functions/dist/

    # --- DEFINITIVE FIX: Run npm install --production inside functions/dist ---
    # This is critical for resolving `workspace:` dependencies like `@pediaquiz/types`
    # and all other production dependencies in the Cloud Build environment.
    echo "    > Installing node_modules within workspaces/functions/dist for deployment..."
    (cd workspaces/functions/dist && npm install --production)
    # --- END OF FIX ---

    echo "--- Local build and packaging complete in build-only mode. ---"
    exit 0
fi

# Original deploy logic (if not in build-only mode)
echo "--- 1. Running a full, clean build of all local workspaces (for direct deploy)..."
npm run build

echo "--- 2. Preparing a clean, self-contained deployment package in 'workspaces/functions/dist'..."

# Create a clean distribution directory inside functions
rm -rf workspaces/functions/dist
mkdir -p workspaces/functions/dist

# Copy the essential files for deployment
echo "    > Copying compiled functions code (lib) and its package.json..."
cp -r workspaces/functions/lib workspaces/functions/dist/
cp workspaces/functions/package.json workspaces/functions/dist/

# --- DEFINITIVE FIX: Run npm install --production inside functions/dist ---
echo "    > Installing node_modules within functions/dist for deployment..."
(cd workspaces/functions/dist && npm install --production)
# --- END OF FIX ---

echo "--- 3. All preparations complete. Deploying from the 'workspaces/functions/dist' directory..."
firebase deploy --only functions

echo "--- ✅ Deployment script finished successfully! ---"
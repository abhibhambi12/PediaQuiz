// deploy-functions.sh
# A robust script to build and deploy Firebase Functions from a monorepo.
set -e # Exit immediately if a command exits with a non-zero status.

# Argument to trigger build-only mode
if [ "$1" = "build-only" ]; then
    echo "--- Running a full, clean build of all local workspaces (build-only mode)..."
    # This command builds all workspaces, including @pediaquiz/types and @pediaquiz/functions
    npm run build

    echo "--- Preparing a clean, self-contained deployment package in 'workspaces/functions/dist'..."
    # Create a clean distribution directory inside functions
    rm -rf workspaces/functions/dist
    mkdir -p workspaces/functions/dist

    # Copy the essential files for deployment
    echo "    > Copying compiled functions code (lib) and its package.json..."
    cp -r workspaces/functions/lib workspaces/functions/dist/
    cp workspaces/functions/package.json workspaces/functions/dist/

    # This is critical for resolving `workspace:` dependencies like `@pediaquiz/types`
    # and all other production dependencies in the Cloud Build environment.
    # It ensures a self-contained node_modules within the deployed function source.
    echo "    > Installing node_modules within workspaces/functions/dist for deployment..."
    (cd workspaces/functions/dist && npm install --production)

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

# Install production dependencies inside the functions/dist directory.
# This ensures that all necessary node_modules, including those from other workspaces,
# are correctly bundled with the deployed function code.
echo "    > Installing node_modules within functions/dist for deployment..."
(cd workspaces/functions/dist && npm install --production)

echo "--- 3. All preparations complete. Deploying from the 'workspaces/functions/dist' directory..."
# The 'firebase.json' is now configured to point to 'workspaces/functions/dist' as the source.
# No need to change the --only functions command here, as firebase.json handles the source.
firebase deploy --only functions

echo "--- ✅ Deployment script finished successfully! ---"
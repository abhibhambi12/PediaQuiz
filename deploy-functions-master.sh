#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

echo "--- 1. Ensuring root dependencies are installed..."
npm install --quiet

echo "--- 2. Building all TypeScript projects..."
# This build command is confirmed to be working successfully.
tsc --build --force

# Verify the build output exists in the correct 'lib' directory.
if [ ! -f "functions/lib/index.js" ]; then
    echo "FATAL ERROR: TypeScript compilation did not create 'functions/lib/index.js'."
    exit 1
else
    echo "    > Successfully built functions."
fi

echo "--- ✅ Build complete. Proceeding to deployment. ---"

# --- DEPLOYMENT PHASE ---

# IMPORTANT WARNING: This grep pattern is tightly coupled to the CommonJS module output format
# specified in `functions/tsconfig.json` ("module": "CommonJS"). If you ever change the
# module system to ES Modules (ESM), this script will fail to find any functions.
# The error message below has been improved to reflect this.
FUNCTION_NAMES=$(grep -oP "(?<=exports\.)[a-zA-Z0-9_]+(?=\s*=)" functions/lib/index.js | sort -u)
ALL_DISCOVERED_FUNCTION_NAMES=($FUNCTION_NAMES)
TOTAL_FUNCTIONS=${#ALL_DISCOVERED_FUNCTION_NAMES[@]}

if [ $TOTAL_FUNCTIONS -eq 0 ]; then
  echo "FATAL ERROR: Could not find any functions to deploy in functions/lib/index.js."
  echo "    > This may be because the grep pattern in the deploy script is incompatible with the module format."
  echo "    > Check that 'functions/tsconfig.json' is set to '\"module\": \"CommonJS\"'."
  exit 1
else
  echo "    > Found ${TOTAL_FUNCTIONS} functions to deploy."
fi

# --- BATCH DEPLOYMENT LOGIC ---
if [ "$1" == "all-batched" ]; then
  echo "--- Starting automated batch deployment ---"
  BATCH_SIZE=2
  
  CURRENT_BATCH_FUNCTIONS=()
  for func_name in "${ALL_DISCOVERED_FUNCTION_NAMES[@]}"; do
    CURRENT_BATCH_FUNCTIONS+=("functions:${func_name}")
    
    if [ ${#CURRENT_BATCH_FUNCTIONS[@]} -ge $BATCH_SIZE ]; then
      (
        IFS=,
        echo "--- Deploying batch: ${CURRENT_BATCH_FUNCTIONS[*]}"
        firebase deploy --only "${CURRENT_BATCH_FUNCTIONS[*]}" --project pediaquizapp --force
      )
      CURRENT_BATCH_FUNCTIONS=()
    fi
  done
  
  # Deploy the final, possibly incomplete, batch
  if [ ${#CURRENT_BATCH_FUNCTIONS[@]} -gt 0 ]; then
    (
      IFS=,
      echo "--- Deploying final batch: ${CURRENT_BATCH_FUNCTIONS[*]}"
      firebase deploy --only "${CURRENT_BATCH_FUNCTIONS[*]}" --project pediaquizapp --force
    )
  fi
else
  # Deploy all functions at once if not batched
  echo "--- Deploying ALL functions (non-batched) ---"
  firebase deploy --only functions --project pediaquizapp --force
fi

echo "--- ✅ Deployment finished successfully! ---"
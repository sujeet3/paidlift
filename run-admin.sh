#!/usr/bin/env bash
# ==============================================================================
# PAID LIFT — Super Admin Web Control Center Runner
# Starts the Dedicated Web Admin Portal on http://localhost:3000
# ==============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="$ROOT_DIR/admin-web"
BACKEND_DIR="$ROOT_DIR/backend"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN}     🚗 PAID LIFT — Super Admin Web Dashboard         ${NC}"
echo -e "${BLUE}======================================================${NC}"

# Check if Backend is running on port 8001
if ! nc -z localhost 8001 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Note: FastAPI Backend is not currently detected on port 8001.${NC}"
    echo -e "${YELLOW}   To start both backend and mobile frontend, run in another terminal:${NC}"
    echo -e "${CYAN}   ./run.sh${NC}\n"
else
    echo -e "${GREEN}✔ FastAPI Backend is active on port 8001.${NC}"
fi

# Verify dependencies
if [ ! -d "$ADMIN_DIR/node_modules" ]; then
    echo -e "${BLUE}Installing admin web dependencies...${NC}"
    (cd "$ADMIN_DIR" && npm install)
fi

echo -e "\n${GREEN}🚀 Launching Super Admin Dashboard on http://localhost:3000...${NC}"
echo -e "${CYAN}Default Super Admin Secret:${NC} paidlift_superadmin_secret_2026"
echo -e "${YELLOW}Press Ctrl+C anytime to stop.${NC}\n"

cd "$ADMIN_DIR"
npm run dev

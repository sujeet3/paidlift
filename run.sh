#!/usr/bin/env bash
# ==============================================================================
# PAID LIFT — Unified Development Runner
# Starts both Backend (FastAPI :8001) and Frontend (Expo Web :8081) concurrently.
# ==============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ADMIN_DIR="$ROOT_DIR/admin-web"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN}          🚀 Starting PAID LIFT Full-Stack App        ${NC}"
echo -e "${BLUE}======================================================${NC}"

# 1. Cleanup handler for graceful shutdown
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping all services...${NC}"
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    if [ -n "$ADMIN_PID" ]; then
        kill "$ADMIN_PID" 2>/dev/null || true
    fi
    echo -e "${GREEN}✔ All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 2. Check MongoDB
echo -e "\n${BLUE}[1/4] Checking MongoDB connection...${NC}"
if ! nc -z localhost 27017 2>/dev/null && ! "$BACKEND_DIR/.venv/bin/python" -c "import socket; s = socket.socket(); s.settimeout(1); s.connect(('localhost', 27017))" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Warning: MongoDB is not responding on localhost:27017.${NC}"
    echo -e "${YELLOW}   If you have MongoDB installed, please run: 'sudo systemctl start mongod' or 'mongod'${NC}"
    echo -e "${YELLOW}   Or ensure your MONGO_URL in backend/.env is pointing to a live database.${NC}"
else
    echo -e "${GREEN}✔ MongoDB is running on port 27017.${NC}"
fi

# 3. Check / Ensure Environment Files
echo -e "\n${BLUE}[2/4] Checking Environment Files...${NC}"
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo "Creating backend/.env..."
    cat << 'EOF' > "$BACKEND_DIR/.env"
MONGO_URL="mongodb://localhost:27017"
DB_NAME="paidlift"
API_PUBLIC_URL="http://localhost:8001"
EOF
fi

if [ ! -f "$FRONTEND_DIR/.env" ]; then
    echo "Creating frontend/.env..."
    cat << 'EOF' > "$FRONTEND_DIR/.env"
EXPO_PUBLIC_BACKEND_URL="http://localhost:8001"
EOF
fi
echo -e "${GREEN}✔ Environment files ready.${NC}"

# 4. Verify / Setup Dependencies
echo -e "\n${BLUE}[3/4] Verifying Dependencies...${NC}"
if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo "Setting up Python virtual environment in backend/.venv..."
    python3 -m venv "$BACKEND_DIR/.venv"
    "$BACKEND_DIR/.venv/bin/python" -m pip install fastapi uvicorn motor pymongo pydantic python-dotenv httpx razorpay starlette requests pytest email-validator python-multipart
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo "Installing frontend dependencies via yarn..."
    (cd "$FRONTEND_DIR" && yarn install)
fi

if [ ! -d "$ADMIN_DIR/node_modules" ]; then
    echo "Installing admin web dependencies..."
    (cd "$ADMIN_DIR" && npm install)
fi
echo -e "${GREEN}✔ Dependencies verified.${NC}"

# 5. Launch Backend, Frontend & Admin Web
echo -e "\n${BLUE}[4/4] Launching Services...${NC}"

# Start Backend
"$BACKEND_DIR/.venv/bin/python" -m uvicorn server:app --app-dir "$BACKEND_DIR" --host 0.0.0.0 --port 8001 --reload &
BACKEND_PID=$!
echo -e "${GREEN}✔ Backend started (PID: $BACKEND_PID)${NC}"

# Small sleep to let backend initialize
sleep 2

# Start Frontend (Expo Web)
cd "$FRONTEND_DIR"
npx expo start --web &
FRONTEND_PID=$!
echo -e "${GREEN}✔ Frontend started (PID: $FRONTEND_PID)${NC}"

# Start Super Admin Web Dashboard
cd "$ADMIN_DIR"
npm run dev &
ADMIN_PID=$!
echo -e "${GREEN}✔ Super Admin Web started (PID: $ADMIN_PID)${NC}"

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN} 🎉 PAID LIFT is now running!                         ${NC}"
echo -e "${BLUE}  - Super Admin Web:   ${GREEN}http://localhost:3000${NC}"
echo -e "${BLUE}  - Frontend Web:      ${GREEN}http://localhost:8081${NC}"
echo -e "${BLUE}  - Backend API:       ${GREEN}http://localhost:8001/api${NC}"
echo -e "${BLUE}  - API Documentation: ${GREEN}http://localhost:8001/docs${NC}"
echo -e "${YELLOW} Press Ctrl+C anytime to stop all services.${NC}"
echo -e "${GREEN}======================================================${NC}\n"

# Wait indefinitely until interrupted
wait

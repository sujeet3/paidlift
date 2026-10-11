"""
PAID LIFT — WebSocket Real-Time Communication Hub
Handles high-concurrency real-time WebSocket connections:
1. In-App Chat: /ws/chat/{booking_id}
2. Driver Live GPS Streaming: /ws/ride/{ride_id}/location
Supports client connection tracking, rooms, broadcast, and database persistence.
"""
import json
import logging
from typing import Dict, Set, Any
from datetime import datetime, timezone
import uuid

from fastapi import WebSocket, WebSocketDisconnect
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ConnectionManager:
    def __init__(self):
        # Room ID -> Set of active WebSocket connections
        self.chat_rooms: Dict[str, Set[WebSocket]] = {}
        self.ride_tracking_rooms: Dict[str, Set[WebSocket]] = {}
        # Latest driver coordinates cache
        self.ride_locations: Dict[str, Dict[str, Any]] = {}

    async def connect_chat(self, booking_id: str, websocket: WebSocket):
        await websocket.accept()
        if booking_id not in self.chat_rooms:
            self.chat_rooms[booking_id] = set()
        self.chat_rooms[booking_id].add(websocket)
        logger.info(f"WebSocket connected to chat:{booking_id}. Total: {len(self.chat_rooms[booking_id])}")

    def disconnect_chat(self, booking_id: str, websocket: WebSocket):
        if booking_id in self.chat_rooms and websocket in self.chat_rooms[booking_id]:
            self.chat_rooms[booking_id].remove(websocket)
            if not self.chat_rooms[booking_id]:
                del self.chat_rooms[booking_id]
        logger.info(f"WebSocket disconnected from chat:{booking_id}")

    async def broadcast_chat(self, booking_id: str, message: dict):
        if booking_id in self.chat_rooms:
            payload = json.dumps(message)
            dead_sockets = set()
            for ws in self.chat_rooms[booking_id]:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead_sockets.add(ws)
            for ws in dead_sockets:
                self.disconnect_chat(booking_id, ws)

    async def connect_tracking(self, ride_id: str, websocket: WebSocket):
        await websocket.accept()
        if ride_id not in self.ride_tracking_rooms:
            self.ride_tracking_rooms[ride_id] = set()
        self.ride_tracking_rooms[ride_id].add(websocket)
        # Send latest known location immediately if available
        if ride_id in self.ride_locations:
            await websocket.send_text(json.dumps(self.ride_locations[ride_id]))

    def disconnect_tracking(self, ride_id: str, websocket: WebSocket):
        if ride_id in self.ride_tracking_rooms and websocket in self.ride_tracking_rooms[ride_id]:
            self.ride_tracking_rooms[ride_id].remove(websocket)
            if not self.ride_tracking_rooms[ride_id]:
                del self.ride_tracking_rooms[ride_id]

    async def broadcast_location(self, ride_id: str, location_data: dict, db: AsyncIOMotorDatabase):
        self.ride_locations[ride_id] = location_data
        # Save to DB ride doc
        await db.rides.update_one(
            {"id": ride_id},
            {"$set": {"last_location": location_data, "updated_at": now_iso()}}
        )
        if ride_id in self.ride_tracking_rooms:
            payload = json.dumps(location_data)
            dead_sockets = set()
            for ws in self.ride_tracking_rooms[ride_id]:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead_sockets.add(ws)
            for ws in dead_sockets:
                self.disconnect_tracking(ride_id, ws)


ws_manager = ConnectionManager()

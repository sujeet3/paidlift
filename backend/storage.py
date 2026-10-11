"""
PAID LIFT — Document & Image Storage Service (KYC)
Supports local filesystem storage, base64 payload upload, and cloud storage (AWS S3 / Cloudflare R2).
Stores Vehicle RC, Driving License (DL), Insurance Certificates, and Profile Photos.
"""
import os
import uuid
import base64
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)

STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "local").lower()
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# AWS / Cloudflare R2 credentials (optional for S3)
S3_BUCKET = os.environ.get("S3_BUCKET", "")
S3_ACCESS_KEY = os.environ.get("AWS_ACCESS_KEY_ID", "")
S3_SECRET_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
S3_REGION = os.environ.get("AWS_DEFAULT_REGION", "ap-south-1")
S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL", None)


def build_storage_router(api_public_url: str) -> APIRouter:
    router = APIRouter(prefix="/api/upload", tags=["Storage & KYC"])

    @router.post("/document")
    async def upload_document(
        file: Optional[UploadFile] = File(None),
        base64_data: Optional[str] = Form(None),
        doc_type: str = Form("kyc"),  # rc, dl, insurance, profile
        user_id: Optional[str] = Form(None),
    ) -> Dict[str, Any]:
        """
        Uploads a KYC document or vehicle photo.
        Accepts either multipart file or base64 data string.
        """
        file_ext = ".jpg"
        content_bytes = b""

        if file:
            filename = file.filename or "doc.jpg"
            file_ext = os.path.splitext(filename)[1].lower() or ".jpg"
            content_bytes = await file.read()
        elif base64_data:
            try:
                # Strip data URL prefix if present (e.g. data:image/jpeg;base64,)
                raw = base64_data
                if "," in raw:
                    raw = raw.split(",", 1)[1]
                content_bytes = base64.b64decode(raw)
            except Exception as e:
                raise HTTPException(400, f"Invalid base64 payload: {e}")
        else:
            raise HTTPException(400, "Either file or base64_data must be provided")

        if len(content_bytes) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(400, "File size exceeds 10MB limit")

        unique_id = str(uuid.uuid4())
        safe_filename = f"{doc_type}_{unique_id}{file_ext}"

        # If S3/R2 is configured and selected
        if STORAGE_BACKEND in ("s3", "r2") and S3_BUCKET:
            try:
                import boto3
                s3_client = boto3.client(
                    "s3",
                    aws_access_key_id=S3_ACCESS_KEY,
                    aws_secret_access_key=S3_SECRET_KEY,
                    region_name=S3_REGION,
                    endpoint_url=S3_ENDPOINT_URL,
                )
                key = f"kyc/{doc_type}/{safe_filename}"
                s3_client.put_object(
                    Bucket=S3_BUCKET,
                    Key=key,
                    Body=content_bytes,
                    ContentType=f"image/{file_ext.replace('.', '')}",
                )
                file_url = f"{S3_ENDPOINT_URL or 'https://' + S3_BUCKET + '.s3.amazonaws.com'}/{key}"
                return {
                    "ok": True,
                    "url": file_url,
                    "filename": safe_filename,
                    "doc_type": doc_type,
                    "storage": "s3",
                }
            except Exception as e:
                logger.error(f"S3 upload failed, falling back to local: {e}")

        # Local storage fallback
        dest_path = UPLOAD_DIR / safe_filename
        with open(dest_path, "wb") as f:
            f.write(content_bytes)

        file_url = f"{api_public_url.rstrip('/')}/api/upload/files/{safe_filename}"
        return {
            "ok": True,
            "url": file_url,
            "filename": safe_filename,
            "doc_type": doc_type,
            "storage": "local",
        }

    @router.get("/files/{filename}")
    async def serve_file(filename: str):
        safe_path = (UPLOAD_DIR / filename).resolve()
        # Prevent directory traversal
        if not str(safe_path).startswith(str(UPLOAD_DIR.resolve())):
            raise HTTPException(403, "Access denied")
        if not safe_path.exists():
            raise HTTPException(404, "File not found")
        return FileResponse(safe_path)

    return router

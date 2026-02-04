import io
import logging
from fastapi import APIRouter, Depends, File, UploadFile

from app.core.deps import get_current_admin
from app.services.storage import get_storage

router = APIRouter(prefix="/uploads", tags=["uploads"])
logger = logging.getLogger(__name__)

# Register HEIF opener at module load time
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    logger.info("pillow_heif registered successfully")
except Exception as e:
    logger.warning(f"Failed to register pillow_heif: {e}")


def is_heic_file(data: bytes, filename: str, content_type: str) -> bool:
    """Check if file is HEIC/HEIF by content-type, extension, or magic bytes."""
    # Check by content-type
    if content_type in ('image/heic', 'image/heif'):
        return True
    # Check by extension
    if filename.lower().endswith(('.heic', '.heif')):
        return True
    # Check by magic bytes (ftyp box with heic/heif brands)
    if len(data) >= 12:
        # HEIC files start with ftyp box
        if data[4:8] == b'ftyp':
            brand = data[8:12].decode('ascii', errors='ignore').lower()
            if brand in ('heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'):
                return True
    return False


def convert_heic_to_jpeg(data: bytes) -> tuple[bytes, str, str]:
    """Convert HEIC/HEIF image to JPEG. Returns (data, mime, extension)."""
    try:
        import pillow_heif
        from PIL import Image
        
        # Use open_heif which handles complex HEIC files better (Live Photos, HDR)
        heif_file = pillow_heif.open_heif(data)
        img = heif_file.to_pillow()
        
        # Convert to RGB if necessary (HEIC can have alpha)
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=92)
        output.seek(0)
        logger.info(f"HEIC converted successfully, output size: {len(output.getvalue())} bytes")
        return output.getvalue(), 'image/jpeg', '.jpg'
    except Exception as e:
        # If conversion fails, return original
        logger.error(f"HEIC conversion failed: {e}", exc_info=True)
        return data, 'image/heic', '.heic'


@router.post("")
async def upload_file(file: UploadFile = File(...), admin=Depends(get_current_admin)) -> dict:
    storage = get_storage()
    data = await file.read()
    
    filename = file.filename or 'file'
    content_type = file.content_type or ''
    
    # Convert HEIC/HEIF to JPEG for browser compatibility
    if is_heic_file(data, filename, content_type):
        data, content_type, ext = convert_heic_to_jpeg(data)
        # Change filename extension
        if '.' in filename:
            filename = filename.rsplit('.', 1)[0] + ext
        else:
            filename = filename + ext
    
    local_path, url = await storage.save(data, filename)
    return {
        "local_path": local_path,
        "url": url,
        "mime": content_type,
        "name": filename,
        "size": len(data),
    }

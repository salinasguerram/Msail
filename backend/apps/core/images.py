"""
Procesamiento de fotos subidas por los usuarios.

Toda foto pasa por acá antes de guardarse:
- se valida que sea una imagen real y que no supere el tamaño máximo;
- se rota según la orientación de la cámara y se redimensiona;
- se recomprime a JPEG y se descartan los metadatos EXIF (que pueden incluir la ubicación GPS).
"""

import uuid
from io import BytesIO

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.utils.translation import gettext_lazy as _
from PIL import Image, ImageOps, UnidentifiedImageError

# MPO es el JPEG que generan algunas cámaras. Las fotos HEIC del iPhone llegan como JPEG desde la app.
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO"}
BACKGROUND = (5, 11, 24)  # fondo azul noche para imágenes con transparencia


def process_image(uploaded, max_side=None, square=False):
    """Devuelve un ContentFile JPEG listo para asignar a un ImageField."""
    max_bytes = settings.PHOTO_MAX_UPLOAD_MB * 1024 * 1024
    if uploaded.size and uploaded.size > max_bytes:
        raise ValidationError(_("La foto supera el tamaño máximo de %(mb)s MB.") % {"mb": settings.PHOTO_MAX_UPLOAD_MB})

    try:
        image = Image.open(uploaded)
        image_format = image.format
        image.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise ValidationError(_("El archivo no es una imagen válida.")) from exc
    if image_format not in ALLOWED_FORMATS:
        raise ValidationError(_("Formato no soportado. Usá JPG, PNG o WEBP."))

    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGBA")
        flattened = Image.new("RGB", image.size, BACKGROUND)
        flattened.paste(image, mask=image.getchannel("A"))
        image = flattened
    else:
        image = image.convert("RGB")

    side = max_side or settings.PHOTO_MAX_SIDE_PX
    if square:
        image = ImageOps.fit(image, (side, side), Image.Resampling.LANCZOS)
    else:
        image.thumbnail((side, side), Image.Resampling.LANCZOS)

    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=85, optimize=True, progressive=True)  # sin exif=…: se descarta
    return ContentFile(buffer.getvalue(), name=f"{uuid.uuid4().hex}.jpg")


def thumbnail_html(file, size=64):
    """Miniatura para el panel de administración."""
    from django.utils.html import format_html

    if not file:
        return "—"
    return format_html('<img src="{}" style="width:{}px;height:{}px;object-fit:cover;border-radius:8px">', file.url, size, size)

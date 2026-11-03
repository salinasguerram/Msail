from rest_framework.exceptions import Throttled
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """Agrega `retry_after` (segundos) cuando se supera un límite, para que la app muestre la espera."""
    response = exception_handler(exc, context)
    if isinstance(exc, Throttled) and response is not None:
        response.data["retry_after"] = int(exc.wait or 0) + 1 if exc.wait is not None else None
    return response

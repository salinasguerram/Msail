import unicodedata


def normalize(text):
    """Minúsculas y sin tildes: "Río de Janeiro" → "rio de janeiro". Para búsquedas que no dependan de acentos."""
    decomposed = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()

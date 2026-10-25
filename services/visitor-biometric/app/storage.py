from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .verifier import MAX_IMAGE_BYTES, VerificationInputError, decode_data_url


class _RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        return None


_NO_REDIRECT_OPENER = build_opener(_RejectRedirects)


@dataclass(frozen=True)
class StorageImageReference:
    signed_url: str
    expected_mime: str | None = None
    expected_bytes: int | None = None


def _configured_storage_origin() -> tuple[str, str, int | None]:
    value = os.getenv("VISITOR_BIOMETRIC_STORAGE_ORIGIN", "").strip().rstrip("/")
    parsed = urlsplit(value)
    try:
        port = parsed.port
    except ValueError as exc:
        raise VerificationInputError("Private storage origin is not configured securely.") from exc
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise VerificationInputError("Private storage origin is not configured securely.")
    return parsed.scheme, parsed.hostname.lower(), port


def validate_signed_storage_url(value: str) -> str:
    if not value or len(value) > 4096:
        raise VerificationInputError("Private storage reference is invalid.")
    parsed = urlsplit(value)
    expected_scheme, expected_host, expected_port = _configured_storage_origin()
    try:
        port = parsed.port
    except ValueError as exc:
        raise VerificationInputError("Private storage reference is not authorized.") from exc
    if (
        parsed.scheme != expected_scheme
        or not parsed.hostname
        or parsed.hostname.lower() != expected_host
        or port != expected_port
        or parsed.username
        or parsed.password
        or parsed.fragment
    ):
        raise VerificationInputError("Private storage reference is not authorized.")
    bucket = os.getenv("VISITOR_BIOMETRIC_STORAGE_BUCKET", "visitor-identity-private").strip()
    if not bucket or not parsed.path.startswith(f"/storage/v1/object/sign/{quote(bucket, safe='')}/"):
        raise VerificationInputError("Private storage reference has an unauthorized object path.")
    query = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
    if set(query) != {"token"} or len(query["token"]) != 1 or not query["token"][0]:
        raise VerificationInputError("Private storage reference is not signed correctly.")
    return value


def download_storage_image(reference: StorageImageReference) -> str:
    url = validate_signed_storage_url(reference.signed_url)
    try:
        configured_timeout = int(os.getenv("VISITOR_BIOMETRIC_STORAGE_TIMEOUT_SECONDS", "15"))
    except ValueError:
        configured_timeout = 15
    timeout = max(5, min(30, configured_timeout))
    request = Request(url, headers={
        "Accept": "image/jpeg,image/png,image/webp",
        "Cache-Control": "no-store",
        "User-Agent": "HIRNA-Visitor-Biometric/1.0",
    })
    try:
        with _NO_REDIRECT_OPENER.open(request, timeout=timeout) as response:
            if response.status != 200:
                raise VerificationInputError("Private identity image could not be retrieved.")
            content_type = response.headers.get_content_type().lower()
            declared_length = response.headers.get("Content-Length")
            if declared_length:
                try:
                    length = int(declared_length)
                except ValueError as exc:
                    raise VerificationInputError("Private identity image size is invalid.") from exc
                if length <= 0 or length > MAX_IMAGE_BYTES:
                    raise VerificationInputError("Private identity image exceeds the size limit.")
            content = response.read(MAX_IMAGE_BYTES + 1)
    except VerificationInputError:
        raise
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        raise VerificationInputError("Private identity image could not be retrieved securely.") from exc

    if not content or len(content) > MAX_IMAGE_BYTES:
        raise VerificationInputError("Private identity image exceeds the size limit.")
    if reference.expected_bytes is not None and len(content) != reference.expected_bytes:
        raise VerificationInputError("Private identity image size does not match its authorized metadata.")
    if reference.expected_mime is not None and content_type != reference.expected_mime:
        raise VerificationInputError("Private identity image media type does not match its authorized metadata.")
    value = f"data:{content_type};base64,{base64.b64encode(content).decode('ascii')}"
    decode_data_url(value)
    return value

import os
import unittest
from io import BytesIO
from unittest.mock import patch

from PIL import Image

from app.storage import StorageImageReference, download_storage_image, validate_signed_storage_url
from app.verifier import VerificationInputError, decode_data_url


ORIGIN = "https://project-ref.supabase.co"
SIGNED_URL = f"{ORIGIN}/storage/v1/object/sign/visitor-identity-private/visitor/id.jpg?token=authorized-test-token"


def image_bytes() -> bytes:
    image = Image.new("RGB", (128, 128))
    image.putdata([((x * 7) % 255, (y * 11) % 255, ((x + y) * 5) % 255) for y in range(128) for x in range(128)])
    output = BytesIO()
    image.save(output, format="JPEG")
    return output.getvalue()


class Headers:
    def __init__(self, length: int):
        self.length = length

    def get_content_type(self):
        return "image/jpeg"

    def get(self, name, default=None):
        return str(self.length) if name.lower() == "content-length" else default


class Response:
    status = 200

    def __init__(self, content: bytes):
        self.content = content
        self.headers = Headers(len(content))

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, maximum):
        return self.content[:maximum]


class PrivateStorageTests(unittest.TestCase):
    def test_accepts_only_signed_urls_from_configured_private_bucket(self):
        environment = {
            "VISITOR_BIOMETRIC_STORAGE_ORIGIN": ORIGIN,
            "VISITOR_BIOMETRIC_STORAGE_BUCKET": "visitor-identity-private",
        }
        with patch.dict(os.environ, environment, clear=False):
            self.assertEqual(validate_signed_storage_url(SIGNED_URL), SIGNED_URL)
            for unauthorized in (
                "https://example.com/storage/v1/object/sign/visitor-identity-private/id.jpg?token=x",
                f"{ORIGIN}/storage/v1/object/sign/public/id.jpg?token=x",
                f"{ORIGIN}/storage/v1/object/sign/visitor-identity-private/id.jpg",
                f"{ORIGIN}/storage/v1/object/sign/visitor-identity-private/id.jpg?token=x#fragment",
            ):
                with self.assertRaises(VerificationInputError):
                    validate_signed_storage_url(unauthorized)

    def test_download_validates_metadata_and_returns_a_decodable_image(self):
        content = image_bytes()
        reference = StorageImageReference(SIGNED_URL, "image/jpeg", len(content))
        environment = {
            "VISITOR_BIOMETRIC_STORAGE_ORIGIN": ORIGIN,
            "VISITOR_BIOMETRIC_STORAGE_BUCKET": "visitor-identity-private",
        }
        with patch.dict(os.environ, environment, clear=False), \
                patch("app.storage._NO_REDIRECT_OPENER.open", return_value=Response(content)):
            value = download_storage_image(reference)
        decoded, suffix = decode_data_url(value)
        self.assertEqual(decoded, content)
        self.assertEqual(suffix, ".jpg")
        self.assertNotIn(SIGNED_URL, value)

    def test_download_rejects_metadata_mismatch(self):
        content = image_bytes()
        reference = StorageImageReference(SIGNED_URL, "image/jpeg", len(content) + 1)
        with patch.dict(os.environ, {"VISITOR_BIOMETRIC_STORAGE_ORIGIN": ORIGIN}, clear=False), \
                patch("app.storage._NO_REDIRECT_OPENER.open", return_value=Response(content)):
            with self.assertRaises(VerificationInputError):
                download_storage_image(reference)


if __name__ == "__main__":
    unittest.main()

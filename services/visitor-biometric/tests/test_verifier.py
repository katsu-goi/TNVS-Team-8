import base64
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.verifier import VerificationInputError, VerificationSettings, compare_faces, decode_data_url


def test_image_data_url() -> str:
    image = Image.new("RGB", (128, 128))
    image.putdata([((x * 7) % 255, (y * 11) % 255, ((x + y) * 5) % 255) for y in range(128) for x in range(128)])
    output = BytesIO()
    image.save(output, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode()


DATA_URL = test_image_data_url()


class Adapter:
    def __init__(self, faces=1, verified=True, failure=None):
        self.faces = faces
        self.verified = verified
        self.failure = failure

    def extract_faces(self, **kwargs):
        if self.failure:
            raise self.failure
        return [{"is_real": True} for _ in range(self.faces)]

    def verify(self, **kwargs):
        return {"verified": self.verified, "distance": 0.21, "threshold": 0.40}


class VerifierTests(unittest.TestCase):
    def test_rejects_invalid_media_and_base64(self):
        with self.assertRaises(VerificationInputError):
            decode_data_url("data:text/plain;base64,SGVsbG8=")
        with self.assertRaises(VerificationInputError):
            decode_data_url("data:image/jpeg;base64,not-base64")

    def test_rejects_tiny_or_flat_images_before_deepface(self):
        output = BytesIO()
        Image.new("RGB", (32, 32), "black").save(output, format="PNG")
        tiny = "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()
        with self.assertRaises(VerificationInputError):
            decode_data_url(tiny)

    def test_reports_actual_match_and_mismatch(self):
        matched = compare_faces(Adapter(verified=True), DATA_URL, DATA_URL, VerificationSettings())
        mismatched = compare_faces(Adapter(verified=False), DATA_URL, DATA_URL, VerificationSettings())
        self.assertEqual(matched["status"], "MATCH_INDICATED")
        self.assertEqual(mismatched["status"], "MISMATCH_INDICATED")
        self.assertTrue(matched["manualReviewRequired"])
        self.assertEqual(matched["distance"], 0.21)

    def test_reports_multiple_and_missing_faces(self):
        self.assertEqual(compare_faces(Adapter(faces=2), DATA_URL, DATA_URL, VerificationSettings())["status"], "MULTIPLE_FACES_DETECTED")
        self.assertEqual(compare_faces(Adapter(faces=0), DATA_URL, DATA_URL, VerificationSettings())["status"], "NO_FACE_DETECTED")

    def test_temporary_images_are_cleaned(self):
        with tempfile.TemporaryDirectory() as root:
            created = Path(root) / "job"

            class ControlledTemporaryDirectory:
                def __enter__(self):
                    created.mkdir()
                    return str(created)

                def __exit__(self, *_args):
                    return False

            with patch("app.verifier.tempfile.TemporaryDirectory", return_value=ControlledTemporaryDirectory()):
                compare_faces(Adapter(), DATA_URL, DATA_URL, VerificationSettings())
            self.assertEqual(list(created.iterdir()), [])


if __name__ == "__main__":
    unittest.main()

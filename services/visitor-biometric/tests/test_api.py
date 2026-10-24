import base64
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main

DATA_URL = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xffsynthetic").decode()
PAYLOAD = {"requestId": "12345678-1234-1234-1234-123456789abc", "idImage": DATA_URL, "selfieImage": DATA_URL}
SERVICE_KEY = "server-secret-with-at-least-32-bytes"


class ApiSecurityTests(unittest.TestCase):
    def setUp(self):
        main._cache.clear()
        main._requests.clear()
        main._adapter = None
        self.client = TestClient(main.app)

    def test_rejects_unauthorized_service_request(self):
        with patch.dict(os.environ, {"VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY, "VISITOR_BIOMETRIC_ENABLED": "true"}, clear=False):
            response = self.client.post("/v1/verify", json=PAYLOAD)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"]["code"], "UNAUTHORIZED_SERVICE_REQUEST")

    def test_feature_flag_defaults_to_disabled(self):
        with patch.dict(os.environ, {"VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY, "VISITOR_BIOMETRIC_ENABLED": "false"}, clear=False):
            response = self.client.post("/v1/verify", json=PAYLOAD, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "BIOMETRIC_FEATURE_DISABLED")

    def test_returns_only_screening_metadata_from_actual_adapter_result(self):
        result = {
            "status": "MISMATCH_INDICATED", "provider": "DEEPFACE", "model": "Facenet512", "detector": "retinaface",
            "distance": 0.61, "threshold": 0.40, "antiSpoofingStatus": "NOT_PERFORMED", "manualReviewRequired": True,
        }
        with patch.dict(os.environ, {"VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY, "VISITOR_BIOMETRIC_ENABLED": "true"}, clear=False), \
                patch.object(main, "load_deepface", return_value=object()), \
                patch.object(main, "compare_faces", return_value=result):
            response = self.client.post("/v1/verify", json=PAYLOAD, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)
        self.assertNotIn("embedding", response.text.lower())
        self.assertNotIn(DATA_URL, response.text)


if __name__ == "__main__":
    unittest.main()

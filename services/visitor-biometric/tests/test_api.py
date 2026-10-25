import base64
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main

DATA_URL = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xffsynthetic").decode()
PAYLOAD = {"requestId": "12345678-1234-1234-1234-123456789abc", "idImage": DATA_URL, "selfieImage": DATA_URL}
REFERENCE = {
    "signedUrl": "https://project-ref.supabase.co/storage/v1/object/sign/visitor-identity-private/test.jpg?token=authorized-test-token",
    "expectedMime": "image/jpeg",
    "expectedBytes": 1024,
}
REFERENCE_PAYLOAD = {
    "requestId": "12345678-1234-1234-1234-123456789abc",
    "idImageReference": REFERENCE,
    "selfieImageReference": REFERENCE,
}
SERVICE_KEY = "server-secret-with-at-least-32-bytes"
MODEL_ENV = {
    "DEEPFACE_MODEL_PROFILE": "opencv-sface-yunet-2021dec-2023mar",
    "DEEPFACE_MODEL": "SFace",
    "DEEPFACE_DETECTOR": "yunet",
}


class ApiSecurityTests(unittest.TestCase):
    def setUp(self):
        main._cache.clear()
        main._requests.clear()
        main._adapter = None
        main._model_initialized = False
        main._inference_status = "NOT_TESTED"
        main._inference_outcome = None
        main._inference_tested_at = None
        main._readiness_error_code = None
        main._model_initialization_milliseconds = None
        main._inference_duration_milliseconds = None
        main._readiness_requests_served = 0
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
            "status": "MISMATCH_INDICATED", "provider": "DEEPFACE", "model": "SFace", "detector": "yunet",
            "distance": 0.61, "threshold": 0.40, "antiSpoofingStatus": "NOT_PERFORMED", "manualReviewRequired": True,
        }
        with patch.dict(os.environ, {**MODEL_ENV, "VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY, "VISITOR_BIOMETRIC_ENABLED": "true"}, clear=False), \
                patch.object(main, "load_deepface", return_value=object()), \
                patch.object(main, "initialize_deepface", return_value=None), \
                patch.object(main, "compare_faces", return_value=result):
            response = self.client.post("/v1/verify", json=PAYLOAD, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)
        self.assertNotIn("embedding", response.text.lower())
        self.assertNotIn(DATA_URL, response.text)

    def test_storage_reference_transport_is_authenticated_and_does_not_return_signed_urls(self):
        result = {
            "status": "MATCH_INDICATED", "provider": "DEEPFACE", "model": "SFace", "detector": "yunet",
            "distance": 0.21, "threshold": 0.40, "antiSpoofingStatus": "NOT_PERFORMED", "manualReviewRequired": True,
        }
        environment = {
            **MODEL_ENV,
            "VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY,
            "VISITOR_BIOMETRIC_ENABLED": "true",
            "VISITOR_BIOMETRIC_REQUIRE_STORAGE_REFERENCES": "true",
        }
        with patch.dict(os.environ, environment, clear=False), \
                patch.object(main, "download_storage_image", return_value=DATA_URL), \
                patch.object(main, "load_deepface", return_value=object()), \
                patch.object(main, "initialize_deepface", return_value=None), \
                patch.object(main, "compare_faces", return_value=result):
            response = self.client.post("/v1/verify", json=REFERENCE_PAYLOAD, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)
        self.assertNotIn("token=", response.text)

    def test_vercel_mode_rejects_inline_image_transport(self):
        environment = {
            **MODEL_ENV,
            "VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY,
            "VISITOR_BIOMETRIC_ENABLED": "true",
            "VISITOR_BIOMETRIC_REQUIRE_STORAGE_REFERENCES": "true",
        }
        with patch.dict(os.environ, environment, clear=False):
            response = self.client.post("/v1/verify", json=PAYLOAD, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
        self.assertEqual(response.status_code, 422)

    def test_authenticated_readiness_distinguishes_initialized_from_inference_tested(self):
        environment = {
            **MODEL_ENV,
            "VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY,
            "VISITOR_BIOMETRIC_ENABLED": "true",
            "DEEPFACE_READINESS_ID_IMAGE_PATH": "",
            "DEEPFACE_READINESS_SELFIE_IMAGE_PATH": "",
        }
        with patch.dict(os.environ, environment, clear=False), \
                patch.object(main, "load_deepface", return_value=object()), \
                patch.object(main, "initialize_deepface", return_value=None):
            response = self.client.post("/v1/readiness", json={"runInference": True}, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["modelStatus"], "INITIALIZED")
        self.assertEqual(response.json()["inferenceStatus"], "NOT_TESTED")
        self.assertIsNone(response.json()["inferenceOutcome"])
        self.assertEqual(response.json()["errorCode"], "READINESS_TEST_IMAGES_NOT_CONFIGURED")

    def test_readiness_requires_server_authentication(self):
        with patch.dict(os.environ, {"VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY}, clear=False):
            response = self.client.post("/v1/readiness", json={"runInference": False})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"]["code"], "UNAUTHORIZED_SERVICE_REQUEST")

    def test_missing_service_authentication_configuration_fails_closed(self):
        with patch.dict(os.environ, {"VISITOR_BIOMETRIC_ENABLED": "false"}, clear=True):
            response = self.client.post(
                "/v1/readiness",
                json={"runInference": False},
                headers={"X-Visitor-Verification-Key": SERVICE_KEY},
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "SERVICE_CONFIGURATION_INVALID")

    def test_readiness_reports_model_initialization_failure_without_details(self):
        with patch.dict(os.environ, {**MODEL_ENV, "VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY}, clear=False), \
                patch.object(main, "load_deepface", side_effect=RuntimeError("sensitive internal model path")):
            response = self.client.post("/v1/readiness", json={"runInference": False}, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["modelStatus"], "ERROR")
        self.assertEqual(response.json()["errorCode"], "DEEPFACE_MODEL_INITIALIZATION_FAILED")
        self.assertNotIn("sensitive internal model path", response.text)

    def test_rejects_oversized_request_before_model_processing(self):
        body = b"x" * (main.MAX_REQUEST_BODY_LENGTH + 1)
        response = self.client.post(
            "/v1/verify",
            content=body,
            headers={"Content-Type": "application/json", "X-Visitor-Verification-Key": SERVICE_KEY},
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["detail"]["code"], "REQUEST_TOO_LARGE")

    def test_timeout_fails_closed_to_manual_verification(self):
        with patch.dict(os.environ, {**MODEL_ENV, "VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY, "VISITOR_BIOMETRIC_ENABLED": "true"}, clear=False), \
                patch.object(main, "load_deepface", return_value=object()), \
                patch.object(main, "initialize_deepface", return_value=None), \
                patch.object(main, "compare_with_capacity", side_effect=TimeoutError):
            response = self.client.post("/v1/verify", json=PAYLOAD, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.json()["detail"]["code"], "VERIFICATION_TIMEOUT")
        self.assertIn("manual verification", response.json()["detail"]["message"])

    def test_rate_limit_applies_to_authenticated_readiness_checks(self):
        environment = {
            **MODEL_ENV,
            "VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY,
            "DEEPFACE_REQUESTS_PER_MINUTE": "1",
        }
        with patch.dict(os.environ, environment, clear=False), \
                patch.object(main, "load_deepface", return_value=object()), \
                patch.object(main, "initialize_deepface", return_value=None):
            first = self.client.post("/v1/readiness", json={"runInference": False}, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
            second = self.client.post("/v1/readiness", json={"runInference": False}, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.json()["detail"]["code"], "RATE_LIMITED")

    def test_rejects_request_id_reuse_with_different_images(self):
        result = {
            "status": "MATCH_INDICATED", "provider": "DEEPFACE", "model": "SFace", "detector": "yunet",
            "distance": 0.2, "threshold": 0.4, "antiSpoofingStatus": "NOT_PERFORMED", "manualReviewRequired": True,
        }
        second_payload = {**PAYLOAD, "selfieImage": DATA_URL + "different"}
        with patch.dict(os.environ, {**MODEL_ENV, "VISITOR_BIOMETRIC_SERVICE_KEY": SERVICE_KEY, "VISITOR_BIOMETRIC_ENABLED": "true"}, clear=False), \
                patch.object(main, "load_deepface", return_value=object()), \
                patch.object(main, "initialize_deepface", return_value=None), \
                patch.object(main, "compare_faces", return_value=result):
            first = self.client.post("/v1/verify", json=PAYLOAD, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
            second = self.client.post("/v1/verify", json=second_payload, headers={"X-Visitor-Verification-Key": SERVICE_KEY})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.json()["detail"]["code"], "REQUEST_ID_REUSE")


if __name__ == "__main__":
    unittest.main()

import os
import secrets
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main
from app.verifier import compare_faces, data_url_from_test_file, settings_from_environment


@unittest.skipUnless(
    os.getenv("DEEPFACE_RUN_REAL_INFERENCE_TEST", "false").lower() == "true"
    and os.getenv("DEEPFACE_READINESS_ID_IMAGE_PATH")
    and os.getenv("DEEPFACE_READINESS_SELFIE_IMAGE_PATH")
    and os.getenv("DEEPFACE_EXPECTED_TEST_STATUS") in {"MATCH_INDICATED", "MISMATCH_INDICATED"},
    "Real DeepFace inference requires authorized fixtures, an explicit expected result, and DEEPFACE_RUN_REAL_INFERENCE_TEST=true.",
)
class RealDeepFaceIntegrationTests(unittest.TestCase):
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

    def test_authenticated_readiness_initializes_model_runs_real_inference_and_cleans_temporary_files(self):
        service_key = secrets.token_urlsafe(32)
        temporary_root = Path(tempfile.gettempdir())
        before = {path.resolve() for path in temporary_root.glob("hirna-visitor-*")}
        environment = {
            "VISITOR_BIOMETRIC_ENABLED": "false",
            "VISITOR_BIOMETRIC_SERVICE_KEY": service_key,
            "DEEPFACE_MODEL_PROFILE": "opencv-sface-yunet-2021dec-2023mar",
            "DEEPFACE_MODEL": "SFace",
            "DEEPFACE_DETECTOR": "yunet",
        }
        with patch.dict(os.environ, environment, clear=False):
            unauthorized = self.client.post("/v1/readiness", json={"runInference": True})
            response = self.client.post(
                "/v1/readiness",
                json={"runInference": True},
                headers={"X-Visitor-Verification-Key": service_key},
            )
            comparison = compare_faces(
                main._adapter,
                data_url_from_test_file(os.environ["DEEPFACE_READINESS_ID_IMAGE_PATH"]),
                data_url_from_test_file(os.environ["DEEPFACE_READINESS_SELFIE_IMAGE_PATH"]),
                settings_from_environment(),
            )
        after = {path.resolve() for path in temporary_root.glob("hirna-visitor-*")}

        self.assertEqual(unauthorized.status_code, 401)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["modelStatus"], "INITIALIZED")
        self.assertEqual(result["inferenceStatus"], "PASSED")
        self.assertEqual(result["inferenceOutcome"], os.environ["DEEPFACE_EXPECTED_TEST_STATUS"])
        self.assertIsNotNone(result["inferenceTestedAt"])
        self.assertEqual(result["featureEnabled"], False)
        self.assertEqual(result["status"], "not_ready")
        self.assertIsInstance(result["modelInitializationMilliseconds"], int)
        self.assertIsInstance(result["inferenceDurationMilliseconds"], int)
        self.assertEqual(comparison["status"], os.environ["DEEPFACE_EXPECTED_TEST_STATUS"])
        self.assertEqual(comparison["provider"], "DEEPFACE")
        self.assertTrue(comparison["manualReviewRequired"])
        self.assertEqual(after, before)


if __name__ == "__main__":
    unittest.main()

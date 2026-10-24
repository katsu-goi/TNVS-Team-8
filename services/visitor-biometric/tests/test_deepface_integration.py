import os
import unittest

from app.verifier import (
    compare_faces,
    data_url_from_test_file,
    initialize_deepface,
    load_deepface,
    settings_from_environment,
)


@unittest.skipUnless(
    os.getenv("DEEPFACE_RUN_REAL_INFERENCE_TEST", "false").lower() == "true"
    and os.getenv("DEEPFACE_READINESS_ID_IMAGE_PATH")
    and os.getenv("DEEPFACE_READINESS_SELFIE_IMAGE_PATH"),
    "Real DeepFace inference requires explicitly authorized non-sensitive test images and DEEPFACE_RUN_REAL_INFERENCE_TEST=true.",
)
class RealDeepFaceIntegrationTests(unittest.TestCase):
    def test_selected_model_detector_and_real_inference(self):
        settings = settings_from_environment()
        adapter = load_deepface()
        initialize_deepface(adapter, settings)
        result = compare_faces(
            adapter,
            data_url_from_test_file(os.environ["DEEPFACE_READINESS_ID_IMAGE_PATH"]),
            data_url_from_test_file(os.environ["DEEPFACE_READINESS_SELFIE_IMAGE_PATH"]),
            settings,
        )
        self.assertIn(result["status"], {"MATCH_INDICATED", "MISMATCH_INDICATED"})
        self.assertEqual(result["model"], settings.model_name)
        self.assertEqual(result["detector"], settings.detector_backend)
        self.assertTrue(result["manualReviewRequired"])


if __name__ == "__main__":
    unittest.main()

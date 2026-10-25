import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.model_manifest import (
    APPROVED_ARTIFACTS,
    APPROVED_MODEL_PROFILE,
    MODEL_LICENSES,
    require_approved_profile,
    validate_model_artifacts,
)


class ModelManifestTests(unittest.TestCase):
    def test_exact_candidate_artifacts_are_immutable_and_license_identified(self):
        artifacts = {artifact.role: artifact for artifact in APPROVED_ARTIFACTS}
        self.assertEqual(artifacts["recognizer"].filename, "face_recognition_sface_2021dec.onnx")
        self.assertEqual(artifacts["recognizer"].license_id, "Apache-2.0")
        self.assertEqual(artifacts["recognizer"].sha256, "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79")
        self.assertEqual(artifacts["detector"].filename, "face_detection_yunet_2023mar.onnx")
        self.assertEqual(artifacts["detector"].license_id, "MIT")
        self.assertEqual(artifacts["detector"].sha256, "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4")
        self.assertEqual({item[0] for item in MODEL_LICENSES}, {"SFace-APACHE-2.0.txt", "YuNet-MIT.txt"})

    def test_profile_must_be_explicit_and_cannot_use_legacy_models(self):
        approved = {
            "DEEPFACE_MODEL_PROFILE": APPROVED_MODEL_PROFILE,
            "DEEPFACE_MODEL": "SFace",
            "DEEPFACE_DETECTOR": "yunet",
        }
        with patch.dict(os.environ, approved, clear=True):
            self.assertEqual(require_approved_profile(), APPROVED_MODEL_PROFILE)
        with patch.dict(os.environ, {
            "DEEPFACE_MODEL_PROFILE": APPROVED_MODEL_PROFILE,
            "DEEPFACE_MODEL": "Facenet512",
            "DEEPFACE_DETECTOR": "retinaface",
        }, clear=True):
            with self.assertRaises(RuntimeError):
                require_approved_profile()

    def test_unapproved_weight_fails_closed(self):
        approved = {
            "DEEPFACE_MODEL_PROFILE": APPROVED_MODEL_PROFILE,
            "DEEPFACE_MODEL": "SFace",
            "DEEPFACE_DETECTOR": "yunet",
        }
        with tempfile.TemporaryDirectory() as temporary:
            weights = Path(temporary) / "weights"
            weights.mkdir()
            (weights / "retinaface.h5").write_bytes(b"legacy weight")
            with patch.dict(os.environ, {**approved, "DEEPFACE_HOME": temporary}, clear=True):
                with self.assertRaisesRegex(RuntimeError, "unapproved biometric model artifact"):
                    validate_model_artifacts()


if __name__ == "__main__":
    unittest.main()

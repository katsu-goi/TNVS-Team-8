import hashlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import model_manifest
from app.model_manifest import (
    APPROVED_ARTIFACTS,
    APPROVED_MODEL_PROFILE,
    MODEL_LICENSES,
    ModelArtifact,
    deepface_home,
    require_approved_profile,
    validate_model_artifacts,
)


class ModelManifestTests(unittest.TestCase):
    approved_environment = {
        "DEEPFACE_MODEL_PROFILE": APPROVED_MODEL_PROFILE,
        "DEEPFACE_MODEL": "SFace",
        "DEEPFACE_DETECTOR": "yunet",
    }

    @staticmethod
    def artifact(role: str, filename: str, content: bytes) -> ModelArtifact:
        return ModelArtifact(
            role=role,
            filename=filename,
            source="https://example.invalid/approved-test-artifact",
            license_id="TEST-ONLY",
            bytes=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
        )

    def write_test_artifacts(self, parent: str) -> tuple[ModelArtifact, ModelArtifact]:
        recognizer_content = b"approved-recognizer-test-weight"
        detector_content = b"approved-detector-test-weight"
        recognizer = self.artifact("recognizer", "recognizer.onnx", recognizer_content)
        detector = self.artifact("detector", "detector.onnx", detector_content)
        weights = Path(parent) / ".deepface" / "weights"
        weights.mkdir(parents=True)
        (weights / recognizer.filename).write_bytes(recognizer_content)
        (weights / detector.filename).write_bytes(detector_content)
        return recognizer, detector

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
        with tempfile.TemporaryDirectory() as temporary:
            weights = Path(temporary) / ".deepface" / "weights"
            weights.mkdir(parents=True)
            (weights / "retinaface.h5").write_bytes(b"legacy weight")
            with patch.dict(os.environ, {**self.approved_environment, "DEEPFACE_HOME": temporary}, clear=True):
                with self.assertRaisesRegex(RuntimeError, "unapproved biometric model artifact"):
                    validate_model_artifacts()

    def test_configured_home_matches_deepface_parent_contract_without_duplication(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.dict(os.environ, {"DEEPFACE_HOME": temporary}, clear=True):
                resolved = deepface_home()
        self.assertEqual(resolved, (Path(temporary) / ".deepface").resolve())
        self.assertNotIn(".deepface/.deepface", resolved.as_posix())

    def test_both_readable_approved_artifacts_are_validated_from_effective_home(self):
        with tempfile.TemporaryDirectory() as temporary:
            artifacts = self.write_test_artifacts(temporary)
            with patch.dict(os.environ, {**self.approved_environment, "DEEPFACE_HOME": temporary}, clear=True), \
                    patch.object(model_manifest, "APPROVED_ARTIFACTS", artifacts):
                result = validate_model_artifacts()
                weights = deepface_home() / "weights"
                readable = all(os.access(weights / item.filename, os.R_OK) for item in artifacts)
        self.assertEqual({item["role"] for item in result}, {"recognizer", "detector"})
        self.assertTrue(readable)

    def test_missing_required_model_fails_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            artifacts = self.write_test_artifacts(temporary)
            (Path(temporary) / ".deepface" / "weights" / artifacts[1].filename).unlink()
            with patch.dict(os.environ, {**self.approved_environment, "DEEPFACE_HOME": temporary}, clear=True), \
                    patch.object(model_manifest, "APPROVED_ARTIFACTS", artifacts):
                with self.assertRaisesRegex(RuntimeError, "exactly one detector"):
                    validate_model_artifacts()

    def test_incorrect_model_hash_fails_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            artifacts = self.write_test_artifacts(temporary)
            invalid = ModelArtifact(**{**artifacts[0].__dict__, "sha256": "0" * 64})
            with patch.dict(os.environ, {**self.approved_environment, "DEEPFACE_HOME": temporary}, clear=True), \
                    patch.object(model_manifest, "APPROVED_ARTIFACTS", (invalid, artifacts[1])):
                with self.assertRaisesRegex(RuntimeError, "integrity check"):
                    validate_model_artifacts()

    def test_unreadable_model_fails_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            artifacts = self.write_test_artifacts(temporary)
            with patch.dict(os.environ, {**self.approved_environment, "DEEPFACE_HOME": temporary}, clear=True), \
                    patch.object(model_manifest, "APPROVED_ARTIFACTS", artifacts), \
                    patch.object(model_manifest.os, "access", return_value=False):
                with self.assertRaisesRegex(RuntimeError, "not readable by the runtime user"):
                    validate_model_artifacts()


if __name__ == "__main__":
    unittest.main()

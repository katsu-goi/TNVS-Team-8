import os
import unittest
from unittest.mock import patch

from app.deployment_guard import main, require_safe_vercel_environment


class DeploymentGuardTests(unittest.TestCase):
    def test_local_execution_is_allowed_without_claiming_a_vercel_target(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(require_safe_vercel_environment())

    def test_preview_execution_is_allowed(self):
        with patch.dict(os.environ, {"VERCEL_ENV": "preview"}, clear=True):
            self.assertEqual(require_safe_vercel_environment(), "preview")

    def test_production_execution_fails_closed(self):
        with patch.dict(os.environ, {"VERCEL_ENV": "production"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "only in the Vercel Preview environment"):
                require_safe_vercel_environment()

    def test_target_environment_takes_precedence(self):
        with patch.dict(
            os.environ,
            {"VERCEL_ENV": "preview", "VERCEL_TARGET_ENV": "production"},
            clear=True,
        ):
            with self.assertRaises(RuntimeError):
                require_safe_vercel_environment()

    def test_build_guard_requires_biometrics_to_remain_disabled(self):
        with patch.dict(
            os.environ,
            {"VERCEL_ENV": "preview", "VISITOR_BIOMETRIC_ENABLED": "true"},
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "must remain disabled"):
                main()

    def test_runtime_guard_requires_biometrics_to_remain_disabled_on_vercel(self):
        with patch.dict(
            os.environ,
            {"VERCEL_ENV": "preview", "VISITOR_BIOMETRIC_ENABLED": "true"},
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "must remain disabled"):
                require_safe_vercel_environment()


if __name__ == "__main__":
    unittest.main()

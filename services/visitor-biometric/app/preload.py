from __future__ import annotations

import os
import tempfile
from pathlib import Path

from PIL import Image

from .deployment_guard import main as require_safe_staging_deployment
from .model_manifest import install_model_license_notices, require_approved_profile, validate_model_artifacts


def main() -> None:
    require_safe_staging_deployment()
    from deepface import DeepFace  # type: ignore

    require_approved_profile()
    model = os.environ["DEEPFACE_MODEL"]
    detector = os.environ["DEEPFACE_DETECTOR"]
    DeepFace.build_model(model_name=model)
    # Force detector weights into the immutable image. No identity fixture is
    # bundled; the generated image is discarded during the build.
    with tempfile.TemporaryDirectory(prefix="hirna-preload-") as temporary:
        image_path = Path(temporary) / "detector-preload.png"
        Image.new("RGB", (160, 160), color=(127, 127, 127)).save(image_path)
        DeepFace.extract_faces(
            img_path=str(image_path),
            detector_backend=detector,
            enforce_detection=False,
            align=True,
        )
    validate_model_artifacts()
    install_model_license_notices(Path("/service/third_party_model_licenses"))


if __name__ == "__main__":
    main()

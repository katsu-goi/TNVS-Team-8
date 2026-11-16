from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import platform
import site
from pathlib import Path

from .model_manifest import deepface_home, validate_model_artifacts


PACKAGES = (
    "deepface", "opencv-contrib-python-headless", "onnxruntime", "retina-face",
    "fastapi", "uvicorn", "pydantic", "pillow", "numpy", "pandas",
)


def directory_size(path: Path) -> int:
    if not path.is_dir():
        return 0
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    model_home = deepface_home()
    weights = []
    for path in sorted(model_home.rglob("*")) if model_home.is_dir() else []:
        if path.is_file():
            weights.append({
                "name": path.name,
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            })
    package_versions: dict[str, str] = {}
    for package in PACKAGES:
        try:
            package_versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            package_versions[package] = "NOT_INSTALLED"
    site_packages = Path(site.getsitepackages()[0]).resolve()
    report = {
        "event": "visitor_biometric_build_report",
        "python": platform.python_version(),
        "platform": platform.platform(),
        "modelProfile": os.environ["DEEPFACE_MODEL_PROFILE"],
        "model": os.environ["DEEPFACE_MODEL"],
        "detector": os.environ["DEEPFACE_DETECTOR"],
        "packageVersions": package_versions,
        "sitePackagesBytes": directory_size(site_packages),
        "deepfaceHomeBytes": directory_size(model_home),
        "weights": weights,
        "approvedArtifacts": validate_model_artifacts(),
        "modelLicenseNotices": [
            {"name": path.name, "bytes": path.stat().st_size, "sha256": sha256_file(path)}
            for path in sorted(Path("/service/third_party_model_licenses").glob("*.txt"))
        ],
    }
    print(json.dumps(report, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()

from __future__ import annotations

import os


ALLOWED_VERCEL_ENVIRONMENT = "preview"


def require_safe_vercel_environment() -> str | None:
    """Fail closed when Vercel identifies this staging service as non-Preview.

    Vercel does not guarantee that local CLI target flags control its server-side
    classification. This guard therefore limits build/runtime execution after
    Vercel exposes the resolved environment; it cannot prevent Vercel from
    creating a misclassified deployment record.
    """

    resolved = (
        os.getenv("VERCEL_TARGET_ENV", "").strip().lower()
        or os.getenv("VERCEL_ENV", "").strip().lower()
    )
    if resolved and resolved != ALLOWED_VERCEL_ENVIRONMENT:
        raise RuntimeError(
            "The visitor biometric staging service may run only in the Vercel Preview environment."
        )
    if resolved and os.getenv("VISITOR_BIOMETRIC_ENABLED", "false").strip().lower() != "false":
        raise RuntimeError("Biometric processing must remain disabled in the Vercel staging service.")
    return resolved or None


def main() -> None:
    require_safe_vercel_environment()
    if os.getenv("VISITOR_BIOMETRIC_ENABLED", "false").strip().lower() != "false":
        raise RuntimeError("Biometric processing must remain disabled during staging deployment preparation.")


if __name__ == "__main__":
    main()

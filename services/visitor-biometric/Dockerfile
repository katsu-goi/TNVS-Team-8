FROM python:3.11-slim-bookworm@sha256:f06d01d4ba3f8ad5af45a3ec87df19c1d317d8e8961edc0fabda61811af6f7cf

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TF_CPP_MIN_LOG_LEVEL=2 \
    VISITOR_BIOMETRIC_ENABLED=false \
    DEEPFACE_MODEL_PROFILE=opencv-sface-yunet-2021dec-2023mar \
    DEEPFACE_MODEL=SFace \
    DEEPFACE_DETECTOR=yunet \
    DEEPFACE_MAX_CONCURRENCY=1 \
    DEEPFACE_REQUEST_TIMEOUT_SECONDS=45 \
    DEEPFACE_REQUESTS_PER_MINUTE=20

WORKDIR /service
COPY requirements.lock.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock.txt
COPY app ./app

RUN useradd --create-home --uid 10001 verifier \
    && chown -R verifier:verifier /service
USER verifier

# Production image builds may set this to true to download and initialize both
# approved models, validate their exact byte counts and SHA-256 digests, and
# install their license notices during the controlled build.
ARG DEEPFACE_PRELOAD_MODEL=false
RUN if [ "$DEEPFACE_PRELOAD_MODEL" = "true" ]; then python -m app.preload; fi

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import json,urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3))['status'] == 'alive'"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--proxy-headers"]

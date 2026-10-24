FROM python:3.11-slim

ARG DEEPFACE_MODEL=Facenet512
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TF_CPP_MIN_LOG_LEVEL=2 \
    VISITOR_BIOMETRIC_ENABLED=false \
    DEEPFACE_MODEL=${DEEPFACE_MODEL} \
    DEEPFACE_DETECTOR=retinaface \
    DEEPFACE_MAX_CONCURRENCY=1 \
    DEEPFACE_REQUEST_TIMEOUT_SECONDS=45 \
    DEEPFACE_REQUESTS_PER_MINUTE=20

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /service
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

RUN useradd --create-home --uid 10001 verifier \
    && chown -R verifier:verifier /service
USER verifier

# Production image builds may set this to true to download and initialize the
# selected recognition model during the controlled build rather than on the
# first readiness check. Detector initialization is verified by the authorized
# readiness inference using the configured non-sensitive test images.
ARG DEEPFACE_PRELOAD_MODEL=false
RUN if [ "$DEEPFACE_PRELOAD_MODEL" = "true" ]; then python -c "import os; from deepface import DeepFace; DeepFace.build_model(model_name=os.environ['DEEPFACE_MODEL'])"; fi

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import json,urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3))['status'] == 'alive'"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--proxy-headers"]

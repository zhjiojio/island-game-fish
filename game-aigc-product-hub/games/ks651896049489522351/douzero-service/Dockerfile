FROM python:3.11.9-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DOUZERO_MODEL_DIR=/app/models \
    DOUZERO_MODEL_MANIFEST=/app/model-manifest.json

WORKDIR /app

COPY pyproject.toml app.py capacity.py features.py inference.py model_fetcher.py ./
RUN pip install --no-cache-dir .

COPY model-manifest.json ./
RUN mkdir -p /app/models

RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

EXPOSE 2021

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:2021/readyz', timeout=2)"]

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "2021", "--workers", "1", "--no-access-log"]

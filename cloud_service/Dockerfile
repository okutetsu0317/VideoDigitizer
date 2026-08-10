FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . ./cloud_service

USER 65532:65532
CMD ["sh", "-c", "uvicorn cloud_service.main:app --host 0.0.0.0 --port ${PORT}"]

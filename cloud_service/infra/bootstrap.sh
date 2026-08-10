#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="${PROJECT_ID:-videodigitizer}"
REGION="${REGION:-asia-northeast1}"
SERVICE_NAME="${SERVICE_NAME:-videodigitizer-sync}"
SERVICE_ACCOUNT_NAME="${SERVICE_ACCOUNT_NAME:-videodigitizer-sync}"
BUCKET_NAME="${BUCKET_NAME:-${PROJECT_ID}-videodigitizer-sync}"
DATASET_NAME="${DATASET_NAME:-videodigitizer}"
TABLE_NAME="${TABLE_NAME:-digitized_points}"
SECRET_NAME="${SECRET_NAME:-videodigitizer-user-hash-key}"
GOOGLE_OAUTH_CLIENT_ID="${GOOGLE_OAUTH_CLIENT_ID:-}"
CONFIRM_DEPLOY="${CONFIRM_DEPLOY:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if [[ "${CONFIRM_DEPLOY}" != "${PROJECT_ID}" ]]; then
  echo "Refusing to create billable resources. Set CONFIRM_DEPLOY=${PROJECT_ID}." >&2
  exit 2
fi
if [[ -z "${GOOGLE_OAUTH_CLIENT_ID}" ]]; then
  echo "GOOGLE_OAUTH_CLIENT_ID is required." >&2
  exit 2
fi
for command in gcloud bq openssl; do
  command -v "${command}" >/dev/null || { echo "${command} is required." >&2; exit 2; }
done

gcloud config set project "${PROJECT_ID}" >/dev/null
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com \
  bigquery.googleapis.com \
  secretmanager.googleapis.com \
  --project "${PROJECT_ID}"

if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
    --display-name "VideoDigitizer cloud sync" \
    --project "${PROJECT_ID}"
fi

if ! gcloud storage buckets describe "gs://${BUCKET_NAME}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUCKET_NAME}" \
    --project "${PROJECT_ID}" \
    --location "${REGION}" \
    --default-storage-class STANDARD \
    --uniform-bucket-level-access \
    --public-access-prevention
fi
gcloud storage buckets update "gs://${BUCKET_NAME}" \
  --project "${PROJECT_ID}" \
  --versioning \
  --lifecycle-file "${SERVICE_DIR}/lifecycle.json"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET_NAME}" \
  --member "serviceAccount:${SERVICE_ACCOUNT}" \
  --role roles/storage.objectAdmin \
  --project "${PROJECT_ID}" >/dev/null

if ! gcloud firestore databases describe --database="(default)" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud firestore databases create \
    --database="(default)" \
    --location "${REGION}" \
    --type firestore-native \
    --project "${PROJECT_ID}"
fi

if ! bq --project_id="${PROJECT_ID}" show "${PROJECT_ID}:${DATASET_NAME}" >/dev/null 2>&1; then
  bq --project_id="${PROJECT_ID}" --location="${REGION}" mk --dataset \
    --description "VideoDigitizer finalized coordinate data" \
    "${PROJECT_ID}:${DATASET_NAME}"
fi
if ! bq --project_id="${PROJECT_ID}" show "${PROJECT_ID}:${DATASET_NAME}.${TABLE_NAME}" >/dev/null 2>&1; then
  bq --project_id="${PROJECT_ID}" mk --table \
    --time_partitioning_field saved_at \
    --clustering_fields user_key,project_id,marker \
    "${PROJECT_ID}:${DATASET_NAME}.${TABLE_NAME}" \
    "${SERVICE_DIR}/bigquery_schema.json"
fi

for role in roles/datastore.user roles/bigquery.jobUser roles/bigquery.dataEditor; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "serviceAccount:${SERVICE_ACCOUNT}" \
    --role "${role}" \
    --condition=None >/dev/null
done

if ! gcloud secrets describe "${SECRET_NAME}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud secrets create "${SECRET_NAME}" --replication-policy=automatic --project "${PROJECT_ID}"
  openssl rand -base64 48 | gcloud secrets versions add "${SECRET_NAME}" \
    --data-file=- \
    --project "${PROJECT_ID}" >/dev/null
fi
gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
  --member "serviceAccount:${SERVICE_ACCOUNT}" \
  --role roles/secretmanager.secretAccessor \
  --project "${PROJECT_ID}" >/dev/null

gcloud run deploy "${SERVICE_NAME}" \
  --source "${SERVICE_DIR}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --service-account "${SERVICE_ACCOUNT}" \
  --allow-unauthenticated \
  --ingress all \
  --cpu 1 \
  --memory 512Mi \
  --concurrency 20 \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 360 \
  --set-env-vars "SYNC_BUCKET=${BUCKET_NAME},BIGQUERY_POINTS_TABLE=${PROJECT_ID}.${DATASET_NAME}.${TABLE_NAME},GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}" \
  --set-secrets "USER_HASH_KEY=${SECRET_NAME}:latest"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')"
echo
echo "Cloud sync API deployed: ${SERVICE_URL}"
echo "Configure the Mac app with this HTTPS URL in cloud_sync.json."

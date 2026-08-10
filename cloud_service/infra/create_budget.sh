#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="${PROJECT_ID:-videodigitizer}"
BUDGET_AMOUNT="${BUDGET_AMOUNT:-3000}"
BUDGET_NAME="${BUDGET_NAME:-VideoDigitizer monthly budget}"
CONFIRM_BUDGET="${CONFIRM_BUDGET:-}"

if [[ "${CONFIRM_BUDGET}" != "${PROJECT_ID}" ]]; then
  echo "Refusing to create a billing budget. Set CONFIRM_BUDGET=${PROJECT_ID}." >&2
  exit 2
fi
command -v gcloud >/dev/null || { echo "gcloud is required." >&2; exit 2; }

BILLING_ACCOUNT="${BILLING_ACCOUNT:-$(gcloud billing projects describe "${PROJECT_ID}" --format='value(billingAccountName.basename())')}"
if [[ -z "${BILLING_ACCOUNT}" ]]; then
  echo "No billing account is linked to ${PROJECT_ID}." >&2
  exit 2
fi

gcloud services enable billingbudgets.googleapis.com --project "${PROJECT_ID}"
if gcloud billing budgets list --billing-account "${BILLING_ACCOUNT}" --filter="displayName='${BUDGET_NAME}'" --format='value(name)' | grep -q .; then
  echo "Budget already exists: ${BUDGET_NAME}"
  exit 0
fi

gcloud billing budgets create \
  --billing-account "${BILLING_ACCOUNT}" \
  --display-name "${BUDGET_NAME}" \
  --budget-amount "${BUDGET_AMOUNT}" \
  --filter-projects "projects/${PROJECT_ID}" \
  --calendar-period month \
  --threshold-rule percent=0.50 \
  --threshold-rule percent=0.90 \
  --threshold-rule percent=1.00

echo "Created monthly budget ${BUDGET_AMOUNT} for ${PROJECT_ID}."

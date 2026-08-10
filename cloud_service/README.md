# VideoDigitizer Cloud Sync

The cloud service stores digitization data only. Video files, decoded frames,
thumbnails, local paths, AI frame buffers, and account autosave files remain on
the user's Mac.

## Data flow

- Every five minutes, the signed-in Mac app sends a gzip-compressed, allowlisted
  coordinate payload to Cloud Run.
- Cloud Run verifies the Google ID token and writes the current payload to a
  private, versioned Cloud Storage object.
- Firestore stores only project index fields such as generation, frame range,
  point count, and update time.
- The explicit finalize endpoint writes immutable newline-delimited point rows
  to Cloud Storage and loads them into BigQuery without expanding all rows in
  container memory.

## Deployment

Run the guarded bootstrap from Google Cloud Shell after reviewing the values:

```bash
export PROJECT_ID=videodigitizer
export GOOGLE_OAUTH_CLIENT_ID='your-installed-app-client-id'
export CONFIRM_DEPLOY="$PROJECT_ID"
bash cloud_service/infra/bootstrap.sh
```

Create a project-scoped monthly budget separately:

```bash
export PROJECT_ID=videodigitizer
export BUDGET_AMOUNT=3000
export CONFIRM_BUDGET="$PROJECT_ID"
bash cloud_service/infra/create_budget.sh
```

After deployment, put the printed service URL in
`~/Library/Application Support/VideoDigitizer/cloud_sync.json`:

```json
{"base_url":"https://SERVICE-URL"}
```

The endpoint is network-public because the Mac app cannot hold Google Cloud IAM
credentials. Application requests are still denied unless a valid Google ID
token for the configured OAuth client is present. The service intentionally
does not enable CORS.

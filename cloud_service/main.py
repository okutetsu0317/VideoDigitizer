from __future__ import annotations

import gzip
import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request, Response
from google.api_core.exceptions import Conflict, PreconditionFailed
from google.auth.transport import requests as google_requests
from google.cloud import bigquery, firestore, storage
from google.oauth2 import id_token

from cloud_service.contracts import (
    ContractError,
    canonical_json,
    decompress_gzip_limited,
    point_rows,
    user_storage_key,
    validate_cloud_payload,
    validate_project_id,
)


PROJECT_ID = os.environ.get("GCP_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
BUCKET_NAME = os.environ.get("SYNC_BUCKET", "")
BIGQUERY_TABLE = os.environ.get("BIGQUERY_POINTS_TABLE", "")
GOOGLE_OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
USER_HASH_KEY = os.environ.get("USER_HASH_KEY", "").encode("utf-8")
MAX_COMPRESSED_BYTES = 16 * 1024 * 1024

app = FastAPI(title="VideoDigitizer Sync API", docs_url=None, redoc_url=None)
storage_client = storage.Client(project=PROJECT_ID)
firestore_client = firestore.Client(project=PROJECT_ID)
bigquery_client = bigquery.Client(project=PROJECT_ID)
token_request = google_requests.Request()


def authenticated_user(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Google ID token is required")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        claims = id_token.verify_oauth2_token(token, token_request, GOOGLE_OAUTH_CLIENT_ID)
    except Exception as error:
        raise HTTPException(status_code=401, detail="Google ID token is invalid") from error
    if not claims.get("sub") or claims.get("email_verified") is not True:
        raise HTTPException(status_code=403, detail="Verified Google account is required")
    return claims


async def request_payload(request: Request) -> dict:
    body = await request.body()
    if len(body) > MAX_COMPRESSED_BYTES:
        raise HTTPException(status_code=413, detail="Compressed payload is too large")
    if request.headers.get("Content-Encoding", "").lower() == "gzip":
        try:
            body = decompress_gzip_limited(body)
        except (OSError, EOFError, ContractError) as error:
            raise HTTPException(status_code=400, detail="Invalid gzip payload") from error
    try:
        payload = json.loads(body.decode("utf-8"))
        return validate_cloud_payload(payload)
    except (UnicodeDecodeError, json.JSONDecodeError, ContractError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/projects/{project_id}/sync")
async def sync_project(
    project_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
    if_match: str | None = Header(default=None),
):
    claims = authenticated_user(authorization)
    try:
        project_id = validate_project_id(project_id)
        user_key = user_storage_key(str(claims["sub"]), USER_HASH_KEY)
    except ContractError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    payload = await request_payload(request)
    canonical = canonical_json(payload)
    compressed = gzip.compress(canonical, compresslevel=6, mtime=0)
    object_name = f"users/{user_key}/projects/{project_id}/current.json.gz"
    blob = storage_client.bucket(BUCKET_NAME).blob(object_name)
    generation_match = int(if_match) if if_match and if_match.isdigit() else 0
    try:
        blob.upload_from_string(
            compressed,
            content_type="application/json",
            if_generation_match=generation_match,
        )
    except (PreconditionFailed, Conflict) as error:
        raise HTTPException(status_code=409, detail="Cloud project was updated on another device") from error

    updated_at = datetime.now(timezone.utc).isoformat()
    document = firestore_client.collection("users").document(user_key).collection("projects").document(project_id)
    document.set(
        {
            "generation": str(blob.generation),
            "updated_at": updated_at,
            "saved_at": str(payload.get("saved_at") or ""),
            "point_count": sum(len(row) for row in payload["points"].values()),
            "frame_start": int((payload.get("frame_range") or {}).get("start") or 0),
            "frame_end": int((payload.get("frame_range") or {}).get("end") or 0),
        },
        merge=True,
    )
    return {"ok": True, "generation": str(blob.generation), "updated_at": updated_at}


@app.post("/v1/projects/{project_id}/finalize")
async def finalize_project(
    project_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    claims = authenticated_user(authorization)
    try:
        project_id = validate_project_id(project_id)
        user_key = user_storage_key(str(claims["sub"]), USER_HASH_KEY)
    except ContractError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    payload = await request_payload(request)
    revision = hashlib.sha256(canonical_json(payload)).hexdigest()
    row_count = 0
    object_name = f"users/{user_key}/projects/{project_id}/finalized/{revision}.ndjson.gz"
    bucket = storage_client.bucket(BUCKET_NAME)
    with tempfile.TemporaryDirectory(prefix="videodigitizer-finalize-") as temp_dir:
        ndjson_path = Path(temp_dir) / f"{revision}.ndjson.gz"
        with gzip.open(ndjson_path, "wt", encoding="utf-8", compresslevel=6) as output:
            for row in point_rows(payload, user_key, project_id, revision):
                output.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
                output.write("\n")
                row_count += 1

        if row_count:
            blob = bucket.blob(object_name)
            try:
                blob.upload_from_filename(
                    str(ndjson_path),
                    content_type="application/x-ndjson",
                    if_generation_match=0,
                )
            except (PreconditionFailed, Conflict):
                # The immutable revision may already exist after a retry.
                pass

    if row_count:
        job_id = f"finalize_{user_key[:16]}_{project_id}_{revision[:16]}"
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        )
        try:
            job = bigquery_client.load_table_from_uri(
                f"gs://{BUCKET_NAME}/{object_name}",
                BIGQUERY_TABLE,
                job_id=job_id,
                job_config=job_config,
            )
        except Conflict:
            job = bigquery_client.get_job(job_id)
        job.result(timeout=300)
    return {"ok": True, "revision": revision, "rows": row_count}


@app.get("/v1/projects")
def list_projects(authorization: str | None = Header(default=None)):
    claims = authenticated_user(authorization)
    try:
        user_key = user_storage_key(str(claims["sub"]), USER_HASH_KEY)
    except ContractError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    documents = (
        firestore_client.collection("users")
        .document(user_key)
        .collection("projects")
        .order_by("updated_at", direction=firestore.Query.DESCENDING)
        .limit(50)
        .stream()
    )
    projects = []
    for document in documents:
        value = document.to_dict() or {}
        projects.append(
            {
                "project_id": document.id,
                "generation": str(value.get("generation") or ""),
                "updated_at": str(value.get("updated_at") or ""),
                "point_count": int(value.get("point_count") or 0),
                "frame_start": int(value.get("frame_start") or 0),
                "frame_end": int(value.get("frame_end") or 0),
            }
        )
    return {"projects": projects}


@app.get("/v1/projects/{project_id}")
def download_project(
    project_id: str,
    authorization: str | None = Header(default=None),
):
    claims = authenticated_user(authorization)
    try:
        project_id = validate_project_id(project_id)
        user_key = user_storage_key(str(claims["sub"]), USER_HASH_KEY)
    except ContractError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    blob = storage_client.bucket(BUCKET_NAME).blob(
        f"users/{user_key}/projects/{project_id}/current.json.gz"
    )
    if not blob.exists():
        raise HTTPException(status_code=404, detail="Cloud project was not found")
    body = blob.download_as_bytes()
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Encoding": "gzip", "ETag": str(blob.generation)},
    )


@app.delete("/v1/projects/{project_id}")
def delete_project(
    project_id: str,
    authorization: str | None = Header(default=None),
):
    claims = authenticated_user(authorization)
    try:
        project_id = validate_project_id(project_id)
        user_key = user_storage_key(str(claims["sub"]), USER_HASH_KEY)
    except ContractError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    query = f"DELETE FROM `{BIGQUERY_TABLE}` WHERE user_key = @user_key AND project_id = @project_id"
    query_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("user_key", "STRING", user_key),
            bigquery.ScalarQueryParameter("project_id", "STRING", project_id),
        ]
    )
    bigquery_client.query(query, job_config=query_config).result(timeout=300)

    prefix = f"users/{user_key}/projects/{project_id}/"
    deleted_objects = 0
    for blob in storage_client.bucket(BUCKET_NAME).list_blobs(prefix=prefix, versions=True):
        blob.delete(if_generation_match=blob.generation)
        deleted_objects += 1
    firestore_client.collection("users").document(user_key).collection("projects").document(project_id).delete()
    return {"ok": True, "deleted_objects": deleted_objects}

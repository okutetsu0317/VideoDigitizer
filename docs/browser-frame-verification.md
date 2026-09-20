# Browser Frame Verification: 2.2.0-lite3

## Changes

- Removed timestamp-offset inference based on a single decoded frame.
- Preserve source presentation times. For positive-start MP4/MOV files, use
  an explicitly adjusted browser-only metadata copy when supported. Original
  media bytes, source files, frame IDs, and digitized coordinates are unchanged.
- Reparse adjusted metadata and verify every frame's timestamp correspondence
  before accepting the copy. No video re-encoding or resolution reduction.
- Retain exact variable-frame-rate timing when the final sample duration is zero.
- Invalidate the verified-frame state on every seek and decoder replacement;
  cancel obsolete presentation callbacks after failed attempts.
- Recover exceptional GOP-boundary seeks by decoding forward with exact PTS
  verification. A skipped or unverifiable frame is rejected, not relabeled.
- Reject ambiguous edit lists and invalid timing instead of silently substituting
  average FPS for a known MP4/MOV timing table.

## Verification

The local suite passed 182 tests, including 29 frame-source regression tests.
The standalone regressions can be run with Python 3 and Node.js on PATH:

```sh
python3 -m unittest discover -s tests -p test_frame_source.py
```

Synthetic movies embed a unique binary ID in each image. Reference IDs were
decoded independently with FFmpeg and compared with browser bitmap pixels for
every frame, backward seeks, repeated frames, and jumps to the first/last frame.
The matrix covers H.264 B-frames, no-edit positive timestamps, 1080p, HEVC MOV,
120 fps, empty leading edits, signed composition offsets, single-frame video,
trimmed video, and variable FPS. Testing used installed Chrome and Playwright's
WebKit engine on macOS, not physical iPhone/iPad devices.

The UI test also changes the range to 2-5 and the increment to 2, then clicks
through 2 -> 4 -> 5 -> next marker at 2, comparing visible canvas pixels.

## Limits

- This matrix does not guarantee all cameras, codecs, operating systems, or
  damaged files. The originally reported movie was not part of this matrix.
- Multiple video tracks, repeated/overlapping edits, non-unit edit rates,
  duplicate timestamps and unreadable MP4/MOV timing are rejected explicitly.
- Unknown-format fallback timing remains estimated; this release does not add
  exact variable-FPS indexing for formats without a parsed timing table.
- WebKit can pause briefly during the existing periodic decoder refresh.
  Exceptional forward recovery is slower than a normal direct seek.
- Updating an already-open working tab requires saving the project and reloading.

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DataEfficiencyTests(unittest.TestCase):
    def test_autosave_uses_compact_canonical_payload(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")

        self.assertIn('payload.storage_format = "compact_autosave_v1"', app)
        self.assertIn("delete payload.digitize.coordinates", app)
        self.assertIn("delete payload.points", app)
        self.assertIn("const text = autosaveJsonText();", app)
        self.assertIn("return JSON.stringify(autosavePayload());", app)

    def test_public_web_build_matches_compact_autosave_contract(self):
        app = (ROOT / "github_release" / "web" / "app.js").read_text(encoding="utf-8")

        self.assertIn('payload.storage_format = "compact_autosave_v1"', app)
        self.assertIn("const text = autosaveJsonText();", app)

    def test_cloud_payload_is_an_explicit_digitize_only_allowlist(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        start = app.index("function cloudDigitizePayload()")
        end = app.index("\nasync function saveProjectPackage()", start)
        cloud_payload = app[start:end]

        self.assertIn('schema: "video_digitizer_cloud_data_v1"', cloud_payload)
        self.assertIn("points: cloudPointStore()", cloud_payload)
        self.assertIn("point_flags: cloudPointFlagStore()", cloud_payload)
        self.assertIn("label: `calib_p${index + 1}`", cloud_payload)
        for forbidden in [
            "state.videoName",
            "source_path",
            "frameCache",
            "aiSuggestions",
            "audit",
            "metadata:",
        ]:
            self.assertNotIn(forbidden, cloud_payload)

    def test_cloud_sync_is_opt_in_and_runs_at_five_minute_intervals(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")

        self.assertIn("|| !state.cloud.enabled", app)
        self.assertIn("window.setInterval(syncCloudDigitize, 5 * 60_000)", app)
        self.assertIn('id="cloudSyncEnabled"', html)
        self.assertIn('id="deleteCloudProject"', html)

    def test_browser_frames_use_direct_bitmaps_without_encode_decode_roundtrip(self):
        source = (ROOT / "web_viewer" / "frame-source.js").read_text(encoding="utf-8")
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")

        self.assertIn("getFrameImage(frame, timeSec)", source)
        self.assertIn("return createImageBitmap(this.video)", source)
        self.assertIn("_waitForPresentedFrame(targetTime, frameDuration)", source)
        self.assertIn("requestVideoFrameCallback(checkFrame)", source)
        self.assertIn("const presented = typeof this.video.requestVideoFrameCallback", source)
        self.assertIn("frameDuration * 0.45", source)
        self.assertIn("await withTimeout(source._resetToFirstFrame()", source)
        self.assertIn("frameForMediaTime(mediaTime)", source)
        self.assertIn("await this._seekToTimedFrame(targetFrame)", source)
        self.assertIn("_waitForPresentationMetadata", source)
        self.assertIn("if (actual === target)", source)
        self.assertIn("MAX_TIMED_SEEKS_PER_DECODER = 48", source)
        self.assertIn("async _replaceVideoDecoder()", source)
        self.assertIn("return this._seekToTimedFrame(target, false)", source)
        self.assertIn("フレームID ${target}を正確にデコードできませんでした", source)
        self.assertNotIn("_playToFrame(targetFrame)", source)
        self.assertIn("function fetchFrameResource", app)
        self.assertIn("function paintFrameResource", app)
        self.assertNotIn("function decodeFrameUrl", app)
        self.assertIn('<canvas id="frameImage"', html)

    def test_slow_frame_completion_does_not_overwrite_active_trim_input(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")

        self.assertIn(
            "if (document.activeElement !== els.trimStartInput) els.trimStartInput.value = String(state.trimStart);",
            app,
        )
        self.assertIn(
            "if (document.activeElement !== els.trimEndInput) els.trimEndInput.value = String(state.trimEnd);",
            app,
        )

    def test_public_web_build_matches_frame_performance_contract(self):
        for relative_path in [
            "app.js", "frame-source.js", "native-bridge.js", "index.html", "styles.css",
            "pwa.js", "service-worker.js", "version.json", "analysis-aggregate-worker.js",
        ]:
            self.assertEqual(
                (ROOT / "web_viewer" / relative_path).read_bytes(),
                (ROOT / "github_release" / "web" / relative_path).read_bytes(),
            )

    def test_frame_cache_has_entry_and_decoded_byte_limits(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")

        self.assertIn("function clientFrameCacheByteLimit()", app)
        self.assertIn("function clientFrameCacheBytes()", app)
        self.assertIn("width * height * 4", app)
        self.assertIn("clientFrameCacheBytes() > clientFrameCacheByteLimit()", app)
        self.assertIn("client_cache_estimated_bytes", app)
        self.assertIn("client_cache_byte_limit", app)

    def test_seek_metrics_and_slider_coalescing_are_diagnostic_only(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")

        self.assertIn("FRAME_LATENCY_SAMPLE_LIMIT = 200", app)
        self.assertIn("FRAME_SLIDER_DEBOUNCE_MS = 45", app)
        self.assertIn("function frameLatencyPercentile(percentile)", app)
        self.assertIn("frame_display_p95_ms", app)
        self.assertIn("coalesced_seek_requests", app)
        self.assertIn('els.frameSlider.addEventListener("input", () => scheduleFrameSliderSeek', app)
        self.assertNotIn("framePerformance:", app[app.index("function projectPayload"):app.index("function projectJsonText")])

    def test_points_require_a_successfully_displayed_matching_frame(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")

        self.assertIn("state.displayedFrame !== state.frame", app)
        self.assertIn('verification.status !== "verified"', app)
        self.assertIn("function currentFrameVerification()", app)
        self.assertIn('state.frameTimingMode === "per_frame_container"', app)
        self.assertIn("state.displayedFrame = frame", app)
        self.assertIn("restoreLastDisplayedFrame();", app)
        self.assertIn('id="frameVerification"', html)

    def test_analysis_time_is_separate_from_video_playback_time(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")

        self.assertIn('id="analysisTimeBasis"', html)
        self.assertIn('id="captureFpsInput"', html)
        self.assertIn('id="captureFpsConfirmed"', html)
        self.assertIn("function videoPlaybackTime(frame)", app)
        self.assertIn("function analysisTimeForFrame(frame)", app)
        self.assertIn("return analysisTimeForFrame(frame);", app)
        self.assertIn("const playbackTime = videoPlaybackTime(frame);", app)
        self.assertIn('"playback_time_sec"', app)
        self.assertIn('"capture_fps_confirmed"', app)

    def test_display_precision_does_not_round_canonical_coordinates(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")

        normalize_start = app.index("function normalizeCoordinate")
        normalize_end = app.index("\nfunction formatCoord", normalize_start)
        normalize_body = app[normalize_start:normalize_end]
        records_start = app.index("function digitizeCoordinates")
        records_end = app.index("\nfunction digitizeSnapshot", records_start)

        self.assertIn("return Math.max(0, Math.min(max, numeric));", normalize_body)
        self.assertNotIn("Math.round", normalize_body)
        self.assertIn("x: Number(point.x)", app[records_start:records_end])
        self.assertIn("y: Number(point.y)", app[records_start:records_end])
        self.assertIn('id="coordDecimals" type="number" min="0" max="6"', html)
        self.assertIn("表示・CSV桁", html)

    def test_analysis_aggregate_runs_in_a_lazy_worker_and_rejects_stale_results(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        worker = ROOT / "web_viewer" / "analysis-aggregate-worker.js"

        self.assertTrue(worker.is_file())
        self.assertIn('new Worker(new URL("./analysis-aggregate-worker.js?v=', app)
        self.assertIn("data?.id !== state.analysisAggregateRequest", app)
        self.assertIn("data.key !== analysisAggregateKey()", app)
        self.assertIn("analysisAggregatePayload()", app)
        self.assertIn("analysis_aggregate_stale_results", app)

        spec = (ROOT / "digitizer_app.spec").read_text(encoding="utf-8")
        project = (ROOT / "ios" / "VideoDigitizerIOS.xcodeproj" / "project.pbxproj").read_text(encoding="utf-8")
        self.assertIn('WEB_VIEWER / "analysis-aggregate-worker.js"', spec)
        self.assertIn("analysis-aggregate-worker.js in Resources", project)

    def test_pointer_zoom_uses_a_throttled_overlay_layer(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")

        self.assertIn('<canvas id="cursorCanvas"', html)
        self.assertIn("function drawCursorLayer()", app)
        self.assertIn("function scheduleCursorDraw()", app)
        self.assertIn("state.cursorDrawRequest = requestAnimationFrame", app)

    def test_trim_inputs_apply_after_typing_and_on_enter(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")

        self.assertIn('scheduleTrimInput("start")', app)
        self.assertIn('scheduleTrimInput("end")', app)
        self.assertIn('if (event.key === "Enter") applyTrimInputs("start")', app)
        self.assertIn('if (event.key === "Enter") applyTrimInputs("end")', app)

    def test_browser_frame_count_uses_container_samples_when_available(self):
        source = (ROOT / "web_viewer" / "frame-source.js").read_text(encoding="utf-8")

        self.assertIn("async function exactMp4FrameCount(file)", source)
        self.assertIn('"container_timestamps"', source)
        self.assertIn('"container_samples"', source)
        self.assertIn("frame_count_estimated: this.exactFrameCount <= 0", source)

    def test_browser_frame_seek_uses_container_presentation_timestamps(self):
        source = (ROOT / "web_viewer" / "frame-source.js").read_text(encoding="utf-8")
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")

        self.assertIn("function samplePresentationTicks", source)
        self.assertIn("function editListEntries", source)
        self.assertIn("timeForFrame(frame)", source)
        self.assertIn("seekTimeForFrame(frame)", source)
        self.assertIn("state.frameSource?.timeForFrame?.(frame)", app)
        self.assertIn("動画の再生時刻（コンテナ実測）", app)

    def test_frame_status_distinguishes_zero_based_id_from_total_count(self):
        app = (ROOT / "web_viewer" / "app.js").read_text(encoding="utf-8")

        self.assertIn("フレームID ${state.frame}", app)
        self.assertIn("`全${state.frameCount}`", app)

    def test_service_worker_uses_current_frame_count_assets(self):
        html = (ROOT / "web_viewer" / "index.html").read_text(encoding="utf-8")
        worker = (ROOT / "web_viewer" / "service-worker.js").read_text(encoding="utf-8")

        self.assertIn("2.2.0-integrity2", html)
        self.assertIn("2.2.0-integrity2", worker)

    def test_pwa_updates_without_losing_active_unsaved_work(self):
        pwa = (ROOT / "web_viewer" / "pwa.js").read_text(encoding="utf-8")
        worker = (ROOT / "web_viewer" / "service-worker.js").read_text(encoding="utf-8")

        self.assertIn('updateViaCache: "none"', pwa)
        self.assertIn('addEventListener("controllerchange"', pwa)
        self.assertIn('videoName === "未選択" && !dirty', pwa)
        self.assertIn('event.request.mode === "navigate" ? "no-store"', worker)


if __name__ == "__main__":
    unittest.main()

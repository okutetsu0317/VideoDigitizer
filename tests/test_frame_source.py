"""Execute browser frame-source regressions with deterministic media events."""

import json
from pathlib import Path
import shutil
import subprocess
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / ("web_viewer" if (ROOT / "web_viewer").is_dir() else "web")
NODE = shutil.which("node")


@unittest.skipUnless(NODE, "Node.js is required for frame-source runtime tests")
class BrowserFrameSourceTests(unittest.TestCase):
    def run_source(self, body):
        harness = r"""
        const assert = require("node:assert/strict");
        const timers = new Map();
        let nextTimer = 0;
        globalThis.setTimeout = (callback, delay) => {
          const id = ++nextTimer;
          timers.set(id, { callback, delay });
          return id;
        };
        globalThis.clearTimeout = id => timers.delete(id);
        const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
        async function expire(delay) {
          for (const [id, timer] of [...timers]) {
            if (timer.delay !== delay) continue;
            timers.delete(id);
            timer.callback();
          }
          await flush();
        }
        let revoked = 0;
        URL.createObjectURL = () => "blob:test-video";
        URL.revokeObjectURL = () => { revoked++; };
        globalThis.HTMLMediaElement = { HAVE_METADATA: 1, HAVE_CURRENT_DATA: 2 };
        class FakeVideo extends EventTarget {
          constructor() {
            super();
            this.readyState = 0;
            this.videoWidth = 640;
            this.videoHeight = 480;
            this.duration = 0.1;
            this._currentTime = 0;
            this.seeks = [];
            this.callbacks = new Map();
            this.nextCallback = 0;
            this.listeners = new Set();
            this.loads = 0;
            this.pauses = 0;
          }
          addEventListener(name, fn, options) { this.listeners.add(fn); super.addEventListener(name, fn, options); }
          removeEventListener(name, fn) { this.listeners.delete(fn); super.removeEventListener(name, fn); }
          requestVideoFrameCallback(fn) { const id = ++this.nextCallback; this.callbacks.set(id, fn); return id; }
          cancelVideoFrameCallback(id) { this.callbacks.delete(id); }
          present(mediaTime) {
            const callbacks = [...this.callbacks.values()];
            this.callbacks.clear();
            callbacks.forEach(fn => fn(0, { mediaTime }));
          }
          get currentTime() { return this._currentTime; }
          set currentTime(time) { this._currentTime = time; this.seeks.push(time); this.onSeek?.(time); }
          load() { this.loads++; if (this.src) this.onLoad?.(); }
          pause() { this.pauses++; }
          play() { return Promise.reject(new Error("playback unavailable in this test")); }
          removeAttribute(name) { if (name === "src") this.src = ""; }
        }
        const videos = [];
        const canvas = { width: 0, height: 0, getContext: () => ({}) };
        globalThis.document = {
          createElement(type) {
            if (type === "canvas") return canvas;
            const video = new FakeVideo();
            configureVideo(video);
            videos.push(video);
            return video;
          },
        };
        let configureVideo = () => {};
        function atom(type, ...parts) {
          const content = Buffer.concat(parts);
          const header = Buffer.alloc(8);
          header.writeUInt32BE(content.length + 8, 0);
          header.write(type, 4);
          return Buffer.concat([header, content]);
        }
        function timingFile({ deltas = [1, 1, 1], scale = 30, offsets = null,
          brand = "isom", cttsVersion = 1, editDuration = null, editEntries = null,
          trackDuration = null, moovFirst = true } = {}) {
          const timeHeader = Buffer.alloc(20);
          timeHeader.writeUInt32BE(scale, 12);
          const handler = Buffer.alloc(12);
          handler.write("vide", 8);
          const sizes = Buffer.alloc(12);
          sizes.writeUInt32BE(deltas.length, 8);
          const stts = Buffer.alloc(8 + deltas.length * 8);
          stts.writeUInt32BE(deltas.length, 4);
          deltas.forEach((delta, i) => { stts.writeUInt32BE(1, 8 + i * 8); stts.writeUInt32BE(delta, 12 + i * 8); });
          const composition = [];
          if (offsets) {
            const ctts = Buffer.alloc(8 + offsets.length * 8);
            ctts[0] = cttsVersion;
            ctts.writeUInt32BE(offsets.length, 4);
            offsets.forEach((offset, i) => { ctts.writeUInt32BE(1, 8 + i * 8); ctts.writeUInt32BE(offset >>> 0, 12 + i * 8); });
            composition.push(atom("ctts", ctts));
          }
          const edits = [];
          const entries = editEntries ?? (editDuration !== null ? [[editDuration, 0, 1]] : []);
          if (entries.length) {
            const elst = Buffer.alloc(8 + entries.length * 12);
            elst.writeUInt32BE(entries.length, 4);
            entries.forEach(([duration, start, rate], i) => {
              elst.writeUInt32BE(duration, 8 + i * 12);
              elst.writeInt32BE(start, 12 + i * 12);
              elst.writeInt32BE(Math.round(rate * 65536), 16 + i * 12);
            });
            edits.push(atom("edts", atom("elst", elst)));
          }
          const ftyp = Buffer.alloc(12);
          ftyp.write(brand, 0);
          ftyp.write(brand, 8);
          const trackHeaders = [];
          if(trackDuration !== null) {
            const header=Buffer.alloc(84); header.writeUInt32BE(trackDuration,20);
            trackHeaders.push(atom('tkhd',header));
          }
          const moov = atom("moov",
            atom("mvhd", timeHeader), atom("trak", ...trackHeaders, ...edits, atom("mdia", atom("mdhd", timeHeader),
              atom("hdlr", handler), atom("minf", atom("stbl", atom("stsz", sizes), atom("stts", stts), ...composition)))));
          const media=atom('mdat',Buffer.from('test-media-must-not-change'));
          const file = new Blob([atom("ftyp", ftyp), ...(moovFirst ? [moov,media] : [media,moov])],
            { type: "video/mp4" });
          file.name = "sample.mp4";
          return file;
        }
        const { ApiFrameSource, BrowserFrameSource, mp4VideoTiming, prepareBrowserTimeline } = globalThis.VideoDigitizerFrames;
        """
        script = (
            f"require({json.dumps(str(WEB / 'frame-source.js'))});\n"
            + textwrap.dedent(harness)
            + "\n(async () => {\n"
            + textwrap.dedent(body)
            + "\n})().catch(error => { console.error(error); process.exitCode = 1; });"
        )
        completed = subprocess.run(
            [NODE, "-e", script], cwd=ROOT, check=False, capture_output=True,
            text=True, timeout=10,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        # A pending promise alone does not keep Node alive; require an explicit result.
        return json.loads(completed.stdout)

    def test_api_source_accepts_only_matching_reported_frame_ids(self):
        result = self.run_source("""
            const requested = [];
            globalThis.fetch = async url => {
              requested.push(url);
              const actual = url.includes("frame=4") ? "4" : "3";
              return {
                ok: true,
                headers: { get: name => name === "X-Frame-Index" ? actual : null },
                blob: async () => new Blob(["frame"]),
              };
            };
            const source = new ApiFrameSource(frame => `./api/frame?frame=${frame}`);
            await source.getFrameBlob(4, "jpeg", 0.2);
            assert.equal(source.isFrameVerified(4), true);
            await assert.rejects(() => source.getFrameBlob(5, "jpeg", 0.25), /3Fが返されました/);
            assert.equal(source.isFrameVerified(5), false);
            source.close();
            assert.equal(source.isFrameVerified(4), false);
            console.log(JSON.stringify({ requests: requested.length }));
        """)
        self.assertEqual(result["requests"], 2)

    def test_load_subscribes_before_fast_metadata_and_reuses_verified_first_frame(self):
        result = self.run_source("""
            configureVideo = video => {
              video.onLoad = () => {
                video.readyState = 2;
                video.present(0);
                video.dispatchEvent(new Event("loadedmetadata"));
              };
            };
            const phases = [];
            const opened = await BrowserFrameSource.open(timingFile(), 30, { onProgress: phase => phases.push(phase) });
            assert.equal(opened.metadata.timing_mode, "per_frame_container");
            assert.equal(opened.source.presentedFrame, 0);
            assert.deepEqual(videos[0].seeks, []);
            assert.equal(videos[0].listeners.size, 0);
            assert.equal(videos[0].callbacks.size, 0);
            assert.equal(timers.size, 0);
            opened.source.close();
            console.log(JSON.stringify({ phases: phases.length, revoked }));
        """)
        self.assertEqual(result, {"phases": 3, "revoked": 1})

    def test_missing_metadata_times_out_and_releases_blob_callbacks_and_listeners(self):
        result = self.run_source("""
            const outcome = BrowserFrameSource.open(timingFile()).catch(error => error.message);
            await flush();
            await expire(15000);
            const message = await outcome;
            assert.match(message, /タイムアウト/);
            assert.equal(videos[0].src, "");
            assert.equal(videos[0].listeners.size, 0);
            assert.equal(videos[0].callbacks.size, 0);
            assert.equal(timers.size, 0);
            console.log(JSON.stringify({ revoked }));
        """)
        self.assertEqual(result["revoked"], 1)

    def test_metadata_load_cancellation_releases_everything(self):
        result = self.run_source("""
            const controller = new AbortController();
            const outcome = BrowserFrameSource.open(timingFile(), 30, { signal: controller.signal }).catch(error => error.name);
            await flush(); await flush();
            controller.abort();
            assert.equal(await outcome, "AbortError");
            assert.equal(videos[0].listeners.size, 0);
            assert.equal(videos[0].callbacks.size, 0);
            assert.equal(timers.size, 0);
            console.log(JSON.stringify({ revoked }));
        """)
        self.assertEqual(result["revoked"], 1)

    def test_never_resolving_play_does_not_defeat_fps_sampling_deadline(self):
        result = self.run_source("""
            const video = new FakeVideo();
            video.duration = 10;
            video.play = () => new Promise(() => {});
            const source = new BrowserFrameSource(new Blob([]), "blob:test-video", video, canvas, 60);
            const detected = source.detectFps();
            await expire(1500);
            assert.equal(await detected, 60);
            assert.equal(video.callbacks.size, 0);
            assert.equal(timers.size, 0);
            console.log(JSON.stringify({ paused: video.pauses > 0 }));
        """)
        self.assertTrue(result["paused"])

    def test_cancelling_first_frame_verification_clears_seek_and_presentation_waits(self):
        result = self.run_source("""
            const controller = new AbortController();
            configureVideo = video => {
              video.onLoad = () => { video.readyState = 2; video.dispatchEvent(new Event("loadedmetadata")); };
            };
            const outcome = BrowserFrameSource.open(timingFile(), 30, {
              signal: controller.signal,
              onProgress: phase => { if (phase.includes("最初")) controller.abort(); },
            }).catch(error => error.name);
            assert.equal(await outcome, "AbortError");
            await flush();
            assert.equal(videos[0].listeners.size, 0);
            assert.equal(videos[0].callbacks.size, 0);
            assert.equal(timers.size, 0);
            console.log(JSON.stringify({ revoked }));
        """)
        self.assertEqual(result["revoked"], 1)

    def test_closing_source_aborts_replacement_decoder_load(self):
        result = self.run_source("""
            const source = new BrowserFrameSource(new Blob([]), "blob:test-video", new FakeVideo(), canvas, 30);
            const outcome = source._replaceVideoDecoder().catch(error => error.name);
            source.close();
            assert.equal(await outcome, "AbortError");
            assert.equal(videos[0].src, "");
            assert.equal(videos[0].listeners.size, 0);
            assert.equal(timers.size, 0);
            console.log(JSON.stringify({ revoked }));
        """)
        self.assertEqual(result["revoked"], 1)

    def test_old_decoder_timeout_cannot_cancel_replacement_presentation(self):
        result = self.run_source("""
            const original = new FakeVideo();
            const source = new BrowserFrameSource(new Blob([]), "blob:test-video", original, canvas, 30);
            const outcome = source._waitForPresentationMetadata().catch(error => error.message);
            const replacement = new FakeVideo();
            replacement.requestVideoFrameCallback(() => {});
            source.video = replacement;
            await expire(2000);
            assert.match(await outcome, /照合できません/);
            assert.equal(original.callbacks.size, 0);
            assert.equal(replacement.callbacks.size, 1);
            console.log(JSON.stringify({ timers: timers.size }));
        """)
        self.assertEqual(result["timers"], 0)

    def test_unknown_timing_seek_has_a_deadline(self):
        result = self.run_source("""
            const video = new FakeVideo();
            video.duration = 1;
            video.readyState = 2;
            const source = new BrowserFrameSource(new Blob([]), "blob:test-video", video, canvas, 30);
            const outcome = source._seekToFrame(10).catch(error => error.message);
            await expire(120);
            await expire(2000);
            assert.match(await outcome, /タイムアウト/);
            assert.equal(video.listeners.size, 0);
            assert.equal(video.callbacks.size, 0);
            console.log(JSON.stringify({ timers: timers.size }));
        """)
        self.assertEqual(result["timers"], 0)

    def test_loadeddata_wait_has_a_deadline(self):
        result = self.run_source("""
            const video = new FakeVideo();
            video.readyState = 1;
            const source = new BrowserFrameSource(new Blob([]), "blob:test-video", video, canvas, 30);
            const outcome = source._resetToFirstFrame().catch(error => error.message);
            await expire(15000);
            assert.match(await outcome, /タイムアウト/);
            assert.equal(video.listeners.size, 0);
            console.log(JSON.stringify({ timers: timers.size }));
        """)
        self.assertEqual(result["timers"], 0)

    def test_wrong_frame_is_never_accepted_as_exact(self):
        result = self.run_source("""
            const video = new FakeVideo();
            video.readyState = 2;
            video.onSeek = () => { video.present(0); video.dispatchEvent(new Event("seeked")); };
            const source = new BrowserFrameSource(new Blob([]), "blob:test-video", video, canvas, 30,
              { frameCount: 3, timestamps: Float64Array.of(0, 1/30, 2/30) });
            await assert.rejects(source._seekToTimedFrame(1, false), /正確にデコードできません/);
            assert.equal(source.presentedFrame, null);
            assert.equal(timers.size, 0);
            console.log(JSON.stringify({ seeks: video.seeks.length }));
        """)
        self.assertEqual(result["seeks"], 4)

    def test_nearest_frame_id_without_matching_pts_is_not_exact(self):
        result = self.run_source("""
            const video = new FakeVideo();
            video.readyState = 2;
            video.duration = 0.2;
            video.onSeek = () => { video.present(1/30); video.dispatchEvent(new Event("seeked")); };
            const source = new BrowserFrameSource(new Blob([]), "blob:test-video", video, canvas, 15,
              { frameCount: 3, timestamps: Float64Array.of(0, 2/30, 4/30) });
            assert.equal(source.frameForMediaTime(1/30), 0);
            await assert.rejects(source._seekToTimedFrame(0, false), /正確にデコードできません/);
            assert.equal(source.presentedFrame, null);
            console.log(JSON.stringify({ timers: timers.size }));
        """)
        self.assertEqual(result["timers"], 0)

    def test_positive_presentation_start_is_used_for_seeks_and_verification(self):
        result = self.run_source("""
            const video = new FakeVideo();
            video.readyState = 2;
            video.duration = 0.4;
            const origin = 0.3003;
            video.onSeek = time => {
              const frame = Math.max(0, Math.min(2, Math.floor((time - origin) * 30)));
              video.present(origin + frame / 30);
              video.dispatchEvent(new Event("seeked"));
            };
            const source = new BrowserFrameSource(new Blob([]), "blob:test-video", video, canvas, 30,
              { frameCount: 3, timestamps: Float64Array.of(origin, origin + 1/30, origin + 2/30) });
            await source._seekToTimedFrame(0, false);
            assert.equal(source.presentedFrame, 0);
            await source._seekToTimedFrame(1, false);
            assert.equal(source.presentedFrame, 1);
            await source._seekToTimedFrame(2, false);
            assert.equal(source.presentedFrame, 2);
            await source._seekToTimedFrame(0, false);
            assert.equal(source.presentedFrame, 0);
            assert.ok(video.seeks.every(time => time >= origin));
            console.log(JSON.stringify({ seeks: video.seeks.length }));
        """)
        self.assertGreaterEqual(result["seeks"], 2)

    def test_wrong_frame_cannot_choose_its_own_timestamp_offset(self):
        result = self.run_source("""
            const video = new FakeVideo(); video.readyState = 2; video.duration = 1;
            video.onSeek = () => { video.present(0.3); video.dispatchEvent(new Event('seeked')); };
            const source = new BrowserFrameSource(new Blob([]), 'blob:test-video', video, canvas, 30,
              {frameCount:30, timestamps:Float64Array.from({length:30}, (_,i)=>i/30), mediaTimeOrigin:0.3});
            await assert.rejects(source._seekToTimedFrame(0, false), /正確にデコードできません/);
            assert.equal(source.presentedFrame, null);
            console.log(JSON.stringify({ timers:timers.size }));
        """)
        self.assertEqual(result["timers"], 0)

    def test_seek_and_decoder_failure_invalidate_previously_verified_frame(self):
        result = self.run_source("""
            const video = new FakeVideo(); video.readyState = 2; video.duration = 1;
            const source = new BrowserFrameSource(new Blob([]), 'blob:test-video', video, canvas, 30,
              {frameCount:3, timestamps:Float64Array.of(0,1/30,2/30)});
            source.presentedFrame = 0;
            video.onSeek = () => { video.present(2/30); video.dispatchEvent(new Event('seeked')); };
            source._replaceVideoDecoder = async () => { throw new Error('decoder load failed'); };
            await assert.rejects(source._seekToTimedFrame(1), /decoder load failed/);
            assert.equal(source.presentedFrame, null);
            const before = video.seeks.length;
            video.onSeek = () => { video.present(0); video.dispatchEvent(new Event('seeked')); };
            await source._seekToTimedFrame(0);
            assert.equal(source.presentedFrame, 0);
            assert.ok(video.seeks.length > before);
            console.log(JSON.stringify({ timers:timers.size }));
        """)
        self.assertEqual(result["timers"], 0)

    def test_failed_seek_attempts_release_presentation_callbacks(self):
        result = self.run_source("""
            const video = new FakeVideo(); video.readyState = 2;
            const source = new BrowserFrameSource(new Blob([]), 'blob:test-video', video, canvas, 30,
              {frameCount:3, timestamps:Float64Array.of(0,1/30,2/30)});
            video.onSeek = () => video.dispatchEvent(new Event('error'));
            await assert.rejects(source._seekToTimedFrame(1, false), /正確にデコードできません/);
            assert.equal(video.callbacks.size, 0);
            assert.equal(video.listeners.size, 0);
            console.log(JSON.stringify({ timers:timers.size }));
        """)
        self.assertEqual(result["timers"], 0)

    def test_quicktime_version_zero_keeps_negative_offset_b_frames(self):
        result = self.run_source("""
            // Synthetic tables reproduce the user's iPhone HEVC container;
            // no bytes or images from their movie are stored in this test.
            const offsets = [0];
            for (let group = 0; group < 58; group++) offsets.push(60, 0, -40, -20);
            const timing = await mp4VideoTiming(timingFile({
              deltas: Array(233).fill(20), scale: 600, offsets,
              brand: "qt  ", cttsVersion: 0, editDuration: 4659,
            }));
            assert.equal(timing.frameCount, 233);
            assert.equal(timing.timestamps.length, 233);
            [...timing.timestamps].forEach((time, frame) => assert.ok(Math.abs(time - frame/30) < 1e-12));
            console.log(JSON.stringify({ frames: timing.frameCount, last: timing.timestamps.at(-1) }));
        """)
        self.assertEqual(result["frames"], 233)
        self.assertAlmostEqual(result["last"], 232 / 30)

    def test_iso_version_zero_composition_offsets_remain_unsigned(self):
        result = self.run_source("""
            const timing = await mp4VideoTiming(timingFile({
              offsets: [0, 0xFFFFFFFF, 0], brand: "isom", cttsVersion: 0,
            }));
            assert.equal(timing.frameCount, 3);
            assert.equal(timing.timestamps[1], 2/30);
            assert.equal(timing.timestamps[2], 0x100000000/30);
            console.log(JSON.stringify({ last: timing.timestamps.at(-1) }));
        """)
        self.assertGreater(result["last"], 1_000_000)

    def test_quicktime_without_composition_offsets_keeps_decode_timing(self):
        result = self.run_source("""
            const timing = await mp4VideoTiming(timingFile({ brand: "qt  " }));
            console.log(JSON.stringify([...timing.timestamps]));
        """)
        self.assertEqual(result, [0, 1 / 30, 2 / 30])

    def test_positive_composition_origin_is_preserved_for_browser_alignment(self):
        result = self.run_source("""
            const timing = await mp4VideoTiming(timingFile({
              scale: 30000, deltas: [1001, 1001, 1001], offsets: [9009, 9009, 9009],
              brand: "isom", cttsVersion: 1,
            }));
            console.log(JSON.stringify({ timestamps: [...timing.timestamps] }));
        """)
        self.assertAlmostEqual(result["timestamps"][0], 0.3003)
        self.assertAlmostEqual(result["timestamps"][1], 0.3003 + 1001 / 30000)

    def test_single_trim_and_empty_lead_in_keep_movie_timestamps(self):
        result = self.run_source("""
            const trimmed = await mp4VideoTiming(timingFile({
              deltas:Array(8).fill(1), scale:30, editEntries:[[4,2,1]],
            }));
            const delayed = await mp4VideoTiming(timingFile({
              deltas:Array(8).fill(1), scale:30, editEntries:[[3,-1,1],[4,2,1]],
            }));
            assert.equal(trimmed.frameCount,4);
            assert.equal(delayed.frameCount,4);
            assert.ok(Math.abs(trimmed.timestamps[0]) < 1e-12);
            assert.ok(Math.abs(delayed.timestamps[0] - .1) < 1e-12);
            console.log(JSON.stringify({frames:delayed.frameCount}));
        """)
        self.assertEqual(result["frames"], 4)

    def test_ambiguous_edits_and_duplicate_pts_are_rejected(self):
        result = self.run_source("""
            for (const edits of [[[3,0,0]], [[3,0,.5]], [[1,0,1],[1,2,1]], [[3,-1,1]]]) {
              await assert.rejects(mp4VideoTiming(timingFile({editEntries:edits})), /編集動画/);
            }
            await assert.rejects(mp4VideoTiming(timingFile({editEntries:[[3,90,1]]})), /表示可能/);
            await assert.rejects(mp4VideoTiming(timingFile({offsets:[1,0,0]})), /重複/);
            console.log(JSON.stringify({rejected:6}));
        """)
        self.assertEqual(result["rejected"], 6)

    def test_open_does_not_silently_fall_back_for_unsupported_edits(self):
        result = self.run_source("""
            configureVideo = video => {
              video.onLoad = () => { video.readyState=2; video.present(0); video.dispatchEvent(new Event('loadedmetadata')); };
            };
            await assert.rejects(BrowserFrameSource.open(timingFile({editEntries:[[3,0,.5]]})), /編集動画/);
            assert.equal(videos.length, 0);
            console.log(JSON.stringify({revoked}));
        """)
        self.assertEqual(result["revoked"], 0)

    def test_container_variable_timing_and_reordered_presentation_are_preserved(self):
        result = self.run_source("""
            const variable = await mp4VideoTiming(timingFile({ deltas: [1, 2, 1], scale: 30 }));
            const reordered = await mp4VideoTiming(timingFile({ deltas: [1, 1, 1], scale: 30, offsets: [2, -1, -1] }));
            assert.equal(variable.frameCount, 3);
            assert.equal(reordered.frameCount, 3);
            console.log(JSON.stringify({ variable: [...variable.timestamps], reordered: [...reordered.timestamps] }));
        """)
        self.assertEqual(result["variable"], [0, 1 / 30, 0.1])
        self.assertEqual(result["reordered"], [0, 1 / 30, 2 / 30])

    def test_zero_final_sample_duration_keeps_exact_variable_timing(self):
        result = self.run_source("""
            const timing = await mp4VideoTiming(timingFile({deltas:[1,2,0],scale:30}));
            console.log(JSON.stringify([...timing.timestamps]));
        """)
        self.assertEqual(result, [0, 1 / 30, 0.1])

    def test_browser_timeline_adapter_preserves_media_bytes_and_source_times(self):
        result = self.run_source("""
            for(const moovFirst of [true,false]) {
              const file=timingFile({offsets:[9,9,9],trackDuration:3,moovFirst});
              const before=Buffer.from(await file.arrayBuffer());
              const timing=await mp4VideoTiming(file);
              const prepared=await prepareBrowserTimeline(file,timing);
              assert.equal(prepared.offset,.3);
              const normalized=await mp4VideoTiming(prepared.file);
              assert.equal(normalized.frameCount,3);
              normalized.timestamps.forEach((t,i)=>assert.ok(Math.abs(t+.3-timing.timestamps[i])<1e-12));
              const after=Buffer.from(await prepared.file.arrayBuffer());
              const mediaIndex=before.indexOf('test-media-must-not-change');
              assert.equal(after.indexOf('test-media-must-not-change'),mediaIndex);
              assert.deepEqual(Buffer.from(await file.arrayBuffer()),before);
              const moovType=before.indexOf('moov');
              const expected=Buffer.from(before); expected.write('free',moovType);
              assert.deepEqual(after.subarray(0,before.length),expected);
            }
            console.log(JSON.stringify({checked:2}));
        """)
        self.assertEqual(result["checked"], 2)

    def test_browser_adapter_keeps_trim_meaning_and_removes_only_empty_lead_in(self):
        result = self.run_source("""
            const file=timingFile({deltas:Array(8).fill(1),scale:30,trackDuration:7,
              editEntries:[[3,-1,1],[4,2,1]]});
            const timing=await mp4VideoTiming(file);
            const prepared=await prepareBrowserTimeline(file,timing);
            const normalized=await mp4VideoTiming(prepared.file);
            assert.equal(prepared.offset,.1);
            assert.equal(normalized.frameCount,4);
            assert.ok(Math.abs(normalized.timestamps[0])<1e-12);
            assert.ok(Math.abs(timing.timestamps[0]-.1)<1e-12);
            const source=new BrowserFrameSource(file,'blob:test-video',new FakeVideo(),canvas,30,timing);
            source.duration=4/30; source.decoderTimeOffset=.1;
            assert.ok(source._timedSeekTarget(0,.5) < 1/30);
            assert.ok(Math.abs(source.timeForFrame(0)-.1)<1e-12);
            const tooShort=timingFile({offsets:[9,9,9],trackDuration:1});
            await assert.rejects(prepareBrowserTimeline(tooShort,await mp4VideoTiming(tooShort)), /フレーム対応/);
            console.log(JSON.stringify({checked:2}));
        """)
        self.assertEqual(result["checked"], 2)

    def test_incomplete_or_unknown_timing_cannot_become_average_fps(self):
        result = self.run_source("""
            for (const options of [{offsets:[0]}, {offsets:[0,0,0],cttsVersion:2}, {scale:0}]) {
              await assert.rejects(mp4VideoTiming(timingFile(options)), /正確に読み取れません/);
            }
            console.log(JSON.stringify({rejected:3}));
        """)
        self.assertEqual(result["rejected"], 3)

    def test_forward_recovery_checks_each_pts_and_restores_playback_rate(self):
        result = self.run_source("""
            const video = new FakeVideo(); video.readyState=2; video.duration=1; video.playbackRate=1;
            video.onSeek = () => video.dispatchEvent(new Event('seeked'));
            const source = new BrowserFrameSource(new Blob([]),'blob:test-video',video,canvas,30,
              {frameCount:4,timestamps:Float64Array.of(0,1/30,2/30,3/30)});
            video.play = async () => { video.present(0); video.present(1/30); video.present(2/30); };
            assert.equal(await source._playToTimedFrame(2),true);
            assert.equal(source.presentedFrame,2);
            assert.equal(video.playbackRate,1);
            video.play = async () => { video.present(0); video.present(3/30); };
            assert.equal(await source._playToTimedFrame(2),false);
            assert.equal(source.presentedFrame,null);
            assert.equal(video.callbacks.size,0);
            assert.equal(timers.size,0);
            console.log(JSON.stringify({rate:video.playbackRate}));
        """)
        self.assertEqual(result["rate"], 1)

    def test_forward_recovery_can_timeout_or_be_cancelled(self):
        result = self.run_source("""
            for (const cancel of [false,true]) {
              const video=new FakeVideo(); video.readyState=2; video.duration=1; video.playbackRate=1;
              video.onSeek=()=>video.dispatchEvent(new Event('seeked'));
              video.play=()=>new Promise(()=>{});
              const source=new BrowserFrameSource(new Blob([]),'blob:test-video',video,canvas,30,
                {frameCount:3,timestamps:Float64Array.of(0,1/30,2/30)});
              const pending=source._playToTimedFrame(2); await flush();
              if(cancel) source.close(); else await expire(4000);
              assert.equal(await pending,false);
              assert.equal(source.presentedFrame,null);
              assert.equal(video.callbacks.size,0);
              assert.equal(video.playbackRate,1);
              assert.equal(timers.size,0);
            }
            console.log(JSON.stringify({checked:2}));
        """)
        self.assertEqual(result["checked"], 2)


if __name__ == "__main__":
    unittest.main()

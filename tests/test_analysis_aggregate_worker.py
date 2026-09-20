import json
from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


@unittest.skipUnless(NODE, "Node.js required")
class AnalysisAggregateWorkerTests(unittest.TestCase):
    def test_sparse_points_are_aggregated_without_changing_sources(self):
        worker = ROOT / "web_viewer" / "analysis-aggregate-worker.js"
        script = f"""
          const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
          const messages=[];
          const context={{self:{{postMessage:value=>messages.push(value)}},Set,Map,Math,Number,String,Array,Object}};
          vm.runInNewContext(fs.readFileSync({json.dumps(str(worker))},'utf8'),context);
          context.self.onmessage({{data:{{id:7,key:'revision-3',payload:{{
            trimStart:0,trimEnd:3,videoWidth:1000,videoHeight:500,
            markers:['右肩','左肩'],frames:[
              {{frame:0,points:[[0,10,20,'manual'],[1,20,20,'manual']],flags:[]}},
              {{frame:1,points:[[0,100,20,'track'],[1,20,20,'manual']],flags:[]}},
              {{frame:2,points:[[0,110,20,'interp']],flags:[[1,'occluded']]}},
            ]}}
          }}}});
          assert.equal(messages.length,1);
          const message=messages[0],result=message.result;
          assert.equal(message.id,7);assert.equal(message.key,'revision-3');
          assert.equal(result.stats.rangePoints,5);
          assert.equal(result.stats.missingRangePoints,2);
          assert.equal(result.stats.completeFrames,3);
          assert.deepEqual(JSON.parse(JSON.stringify(result.stats.sourceCounts)),{{manual:3,track:1,interp:1}});
          assert.equal(result.longestRun.marker,'右肩');
          assert.equal(result.longestRun.start,3);
          assert.equal(result.jumps[0].frame,1);
          assert.equal(result.sideIssues[0].frame,1);
          assert.equal(result.heatmap.length,2);
          console.log('PASS');
        """
        result = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("PASS", result.stdout)


if __name__ == "__main__":
    unittest.main()

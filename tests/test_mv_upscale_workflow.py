# ltx-director-pro
# tests/test_mv_upscale_workflow.py    2026-08-12
#
# @link    : https://shezw.com
# @author  : shezw
# @email   : hello@shezw.com

import json
import unittest
from pathlib import Path

from upscale_chunker import ShezwUpscaleChunker


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / "pro-workflows" / "ltx-director-pro-mv-upscale.json"
REGULAR_UPSCALE_PATH = ROOT / "pro-workflows" / "ltx-director-pro-upscale.json"


class MvUpscaleWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))
        cls.nodes = {node["id"]: node for node in cls.workflow["nodes"]}
        cls.links = {
            (link[1], link[2], link[3], link[4], link[5])
            for link in cls.workflow["links"]
        }

    def test_uses_tuned_mv_restoration_defaults(self):
        self.assertEqual(self.nodes[94]["widgets_values"], ["scale by multiplier", 2, "lanczos"])
        self.assertEqual(self.nodes[62]["widgets_values"], [1, 0.93, 1.2, 0.05])
        self.assertEqual(self.nodes[29]["widgets_values"], ["sgm_uniform", 10, 1])
        self.assertEqual(self.nodes[20]["widgets_values"], [True, 402244474214267, "fixed", 4])
        self.assertEqual(
            self.nodes[111]["widgets_values"],
            [402244474214267, "fixed", 20, 5, "dpmpp_2m_sde", "karras", 0.18],
        )
        self.assertEqual(self.nodes[39]["widgets_values"], ["mkl_lab", "per_frame", 0.2])
        self.assertEqual(self.nodes[113]["widgets_values"], [1.01, 0.94, 0.97])
        self.assertEqual(self.nodes[114]["widgets_values"], [0.2])
        self.assertEqual(self.nodes[115]["widgets_values"], [True, 0.01, 0.02, "Gaussian"])

    def test_preserves_video_frames_fps_and_audio(self):
        expected = {
            (116, 0, 94, 0, "IMAGE"),
            (58, 2, 57, 2, "INT"),
            (116, 2, 118, 1, "AUDIO"),
            (116, 3, 117, 0, "VHS_VIDEOINFO"),
            (117, 0, 118, 4, "FLOAT"),
            (115, 0, 118, 0, "IMAGE"),
        }
        self.assertTrue(expected.issubset(self.links))
        self.assertEqual(self.nodes[116]["widgets_values"]["select_every_nth"], 1)
        self.assertEqual(self.nodes[116]["widgets_values"]["force_rate"], 0)
        self.assertEqual(self.nodes[116]["widgets_values"]["format"], "None")

    def test_uses_independent_supir_and_epicphotogasm_models(self):
        self.assertEqual(
            self.nodes[1]["widgets_values"],
            ["juggernautXL_v9Rdphoto2Lightning.safetensors"],
        )
        self.assertEqual(
            self.nodes[106]["widgets_values"],
            ["epicphotogasm_ultimateFidelity.safetensors"],
        )
        expected = {
            (1, 0, 62, 0, "MODEL"),
            (1, 2, 62, 2, "VAE"),
            (106, 0, 109, 0, "MODEL"),
            (106, 2, 110, 1, "VAE"),
            (106, 2, 112, 1, "VAE"),
        }
        self.assertTrue(expected.issubset(self.links))

    def test_prompt_template_drives_both_restoration_stages(self):
        expected = {
            (102, 0, 59, 7, "STRING"),
            (102, 0, 59, 8, "STRING"),
            (102, 1, 60, 7, "STRING"),
            (102, 1, 60, 8, "STRING"),
            (102, 0, 107, 1, "STRING"),
            (102, 1, 108, 1, "STRING"),
        }
        self.assertTrue(expected.issubset(self.links))

    def test_chunk_controller_uses_distinct_mv_prefixes(self):
        self.assertEqual(
            self.nodes[121]["widgets_values"],
            [
                0.25,
                "video/ltx-director-pro-mv-upscale-segment",
                "video/ltx-director-pro-mv-upscale-merged",
                5,
                0,
            ],
        )
        self.assertEqual(
            self.nodes[118]["widgets_values"]["filename_prefix"],
            "video/ltx-director-pro-mv-upscale-2x",
        )
        self.assertEqual(
            self.nodes[120]["widgets_values"][0],
            "video/ltx-director-pro-mv-upscale-tail-frame",
        )

    def test_story_script_covers_source_and_visible_quality_controls(self):
        properties = self.nodes[100]["properties"]
        self.assertEqual(properties["workflow_id"], "ltx-director-pro-mv-upscale")
        self.assertEqual(properties["script_name"], "ltx-director-pro-mv-upscale-ss.json")
        fields = {
            field.get("node_id", field.get("node_type")): set(field["widgets"])
            for field in properties["ss_struct"]["fields"]
        }
        self.assertTrue({"video", "force_rate", "custom_width", "custom_height"}.issubset(fields["116"]))
        self.assertEqual(fields["94"], {"resize_type", "resize_type.multiplier", "scale_method"})
        self.assertTrue({"restore_cfg", "strength_start", "strength_end"}.issubset(fields["62"]))
        self.assertTrue({"steps", "cfg", "denoise"}.issubset(fields["111"]))
        self.assertTrue({"grain_strength", "saturation_blend"}.issubset(fields["115"]))

    def test_chunker_accepts_subsecond_batches_without_changing_old_default(self):
        field_type, options = ShezwUpscaleChunker.INPUT_TYPES()["required"]["chunk_seconds"]
        self.assertEqual(field_type, "FLOAT")
        self.assertEqual(options["default"], 10.0)
        self.assertLessEqual(options["min"], 0.25)
        regular = json.loads(REGULAR_UPSCALE_PATH.read_text(encoding="utf-8"))
        regular_chunker = next(node for node in regular["nodes"] if node["type"] == "ShezwUpscaleChunker")
        self.assertEqual(regular_chunker["widgets_values"][0], 10)
        source = (ROOT / "js" / "upscale_chunker.js").read_text(encoding="utf-8")
        self.assertIn('min: 0.01, max: 300, integer: false', source)

    def test_serialized_links_match_node_inputs_and_outputs(self):
        self.assertEqual(len(self.workflow["links"]), self.workflow["last_link_id"])
        for link in self.workflow["links"]:
            link_id, origin_id, origin_slot, target_id, target_slot, _ = link
            self.assertIn(link_id, self.nodes[origin_id]["outputs"][origin_slot]["links"])
            self.assertEqual(self.nodes[target_id]["inputs"][target_slot]["link"], link_id)


if __name__ == "__main__":
    unittest.main()

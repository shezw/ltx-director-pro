# ltx-director-pro
# tests/test_image_workflow.py    2026-08-11
#
# @link    : https://shezw.com
# @author  : shezw
# @email   : hello@shezw.com

import json
import unittest
from pathlib import Path

from image_prompt_templates import DEFAULT_TEMPLATE, PROMPT_TEMPLATES


WORKFLOW_PATH = Path(__file__).resolve().parents[1] / "pro-workflows" / "ltx-director-pro-image.json"


class ImageWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))
        cls.nodes = {node["id"]: node for node in cls.workflow["nodes"]}
        cls.link_keys = {
            (link[1], link[2], link[3], link[4], link[5])
            for link in cls.workflow["links"]
        }

    def test_uses_prompt_conditioned_supir_without_caption_llm(self):
        node_types = {node["type"] for node in self.workflow["nodes"]}
        self.assertTrue(
            {
                "ShezwImagePromptTemplate",
                "SUPIRApply",
                "ModelPatchLoader",
                "CheckpointLoaderSimple",
                "ColorTransfer",
                "ImageCompare",
                "SaveImage",
            }.issubset(node_types)
        )
        self.assertTrue({"CLIPLoader", "TextGenerate", "ComfySwitchNode"}.isdisjoint(node_types))

    def test_prompt_outputs_feed_both_sdxl_text_inputs(self):
        expected = {
            (102, 0, 59, 1, "STRING"),
            (102, 0, 59, 2, "STRING"),
            (102, 1, 60, 1, "STRING"),
            (102, 1, 60, 2, "STRING"),
        }
        self.assertTrue(expected.issubset(self.link_keys))
        self.assertEqual(len(PROMPT_TEMPLATES), 4)
        self.assertEqual(self.nodes[102]["widgets_values"], [DEFAULT_TEMPLATE])

    def test_meta_info_persists_template_and_image_settings(self):
        properties = self.nodes[100]["properties"]
        self.assertEqual(properties["workflow_id"], "ltx-director-pro-image")
        fields = properties["ss_struct"]["fields"]
        prompt_field = next(field for field in fields if field.get("node_type") == "ShezwImagePromptTemplate")
        self.assertIn("template", prompt_field["widgets"])
        self.assertEqual(self.nodes[104]["widgets_values"][0], "image/ltx-director-pro-image-final")

    def test_serialized_links_match_node_inputs_and_outputs(self):
        self.assertEqual(len(self.workflow["links"]), self.workflow["last_link_id"])
        for link in self.workflow["links"]:
            link_id, origin_id, origin_slot, target_id, target_slot, _ = link
            self.assertIn(link_id, self.nodes[origin_id]["outputs"][origin_slot]["links"])
            self.assertEqual(self.nodes[target_id]["inputs"][target_slot]["link"], link_id)


if __name__ == "__main__":
    unittest.main()

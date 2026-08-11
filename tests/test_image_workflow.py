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
                "HyperTile",
                "VAEEncodeTiled",
                "KSampler",
                "VAEDecodeTiled",
                "LayerColor: BrightnessContrastV2",
                "ImageCASharpening+",
                "FilmGrain",
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
            (102, 0, 107, 1, "STRING"),
            (102, 1, 108, 1, "STRING"),
        }
        self.assertTrue(expected.issubset(self.link_keys))
        self.assertEqual(len(PROMPT_TEMPLATES), 4)
        self.assertEqual(self.nodes[102]["widgets_values"], [DEFAULT_TEMPLATE])

    def test_epicphotogasm_is_an_independent_low_denoise_sd15_stage(self):
        supir_checkpoint = self.nodes[1]
        texture_checkpoint = self.nodes[106]
        self.assertEqual(
            supir_checkpoint["widgets_values"],
            ["juggernautXL_v9Rdphoto2Lightning.safetensors"],
        )
        self.assertEqual(
            texture_checkpoint["widgets_values"],
            ["epicphotogasm_ultimateFidelity.safetensors"],
        )
        self.assertEqual(
            texture_checkpoint["properties"]["models"][0]["url"],
            "https://civitai.com/api/download/models/429454",
        )
        expected = {
            (1, 0, 62, 0, "MODEL"),
            (1, 1, 59, 0, "CLIP"),
            (1, 1, 60, 0, "CLIP"),
            (1, 2, 62, 2, "VAE"),
            (106, 0, 109, 0, "MODEL"),
            (106, 1, 107, 0, "CLIP"),
            (106, 1, 108, 0, "CLIP"),
            (106, 2, 110, 1, "VAE"),
            (106, 2, 112, 1, "VAE"),
            (109, 0, 111, 0, "MODEL"),
            (110, 0, 111, 3, "LATENT"),
        }
        self.assertTrue(expected.issubset(self.link_keys))
        self.assertEqual(
            self.nodes[111]["widgets_values"][2:],
            [20, 5, "dpmpp_2m_sde", "karras", 0.18],
        )

    def test_natural_editorial_finish_precedes_preview_and_save(self):
        expected = {
            (39, 0, 110, 0, "IMAGE"),
            (111, 0, 112, 0, "LATENT"),
            (112, 0, 113, 0, "IMAGE"),
            (113, 0, 114, 0, "IMAGE"),
            (114, 0, 115, 1, "IMAGE"),
            (115, 0, 103, 1, "IMAGE"),
            (115, 0, 104, 0, "IMAGE"),
        }
        self.assertTrue(expected.issubset(self.link_keys))
        self.assertEqual(self.nodes[62]["widgets_values"], [1, 0.93, 2.5, 0.05])
        self.assertEqual(self.nodes[20]["widgets_values"][-1], 4)
        self.assertEqual(self.nodes[39]["widgets_values"][-1], 0.2)
        self.assertEqual(self.nodes[113]["widgets_values"], [1.01, 0.94, 0.97])
        self.assertEqual(self.nodes[114]["widgets_values"], [0.2])
        self.assertEqual(self.nodes[115]["widgets_values"], [True, 0.02, 0.05, "Gaussian"])

    def test_meta_info_persists_template_and_image_settings(self):
        properties = self.nodes[100]["properties"]
        self.assertEqual(properties["workflow_id"], "ltx-director-pro-image")
        fields = properties["ss_struct"]["fields"]
        prompt_field = next(field for field in fields if field.get("node_type") == "ShezwImagePromptTemplate")
        self.assertIn("template", prompt_field["widgets"])
        fields_by_id = {field.get("node_id"): field for field in fields if field.get("node_id")}
        field_ids = {field.get("node_id") for field in fields}
        self.assertTrue({"111", "113", "114", "115"}.issubset(field_ids))
        self.assertEqual(
            fields_by_id["39"]["widgets"],
            ["method", "source_stats", "strength"],
        )
        self.assertEqual(
            fields_by_id["111"]["widgets"],
            ["seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"],
        )
        self.assertEqual(
            fields_by_id["113"]["widgets"],
            ["brightness", "contrast", "saturation"],
        )
        self.assertEqual(fields_by_id["114"]["widgets"], ["amount"])
        self.assertEqual(
            fields_by_id["115"]["widgets"],
            ["switch", "grain_strength", "saturation_blend", "grain_distribution"],
        )
        self.assertEqual(self.nodes[104]["widgets_values"][0], "image/ltx-director-pro-image-final")

    def test_serialized_links_match_node_inputs_and_outputs(self):
        self.assertEqual(len(self.workflow["links"]), self.workflow["last_link_id"])
        for link in self.workflow["links"]:
            link_id, origin_id, origin_slot, target_id, target_slot, _ = link
            self.assertIn(link_id, self.nodes[origin_id]["outputs"][origin_slot]["links"])
            self.assertEqual(self.nodes[target_id]["inputs"][target_slot]["link"], link_id)


if __name__ == "__main__":
    unittest.main()

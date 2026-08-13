# ltx-director-pro
# tests/test_image_workflow.py    2026-08-11
#
# @link    : https://shezw.com
# @author  : shezw
# @email   : hello@shezw.com

import json
import importlib.util
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

from image_prompt_templates import DEFAULT_TEMPLATE, PROMPT_TEMPLATES


WORKFLOW_PATH = Path(__file__).resolve().parents[1] / "pro-workflows" / "ltx-director-pro-image.json"
IMAGE_BATCH_PATH = Path(__file__).resolve().parents[1] / "image_batch.py"
IMAGE_BATCH_JS_PATH = Path(__file__).resolve().parents[1] / "js" / "image_batch.js"


def load_image_batch_module():
    class Routes:
        @staticmethod
        def post(_path):
            return lambda function: function

    aiohttp = types.ModuleType("aiohttp")
    aiohttp.web = types.SimpleNamespace()
    server = types.ModuleType("server")
    server.PromptServer = types.SimpleNamespace(
        instance=types.SimpleNamespace(routes=Routes())
    )
    spec = importlib.util.spec_from_file_location("image_batch_under_test", IMAGE_BATCH_PATH)
    module = importlib.util.module_from_spec(spec)
    with mock.patch.dict(sys.modules, {"aiohttp": aiohttp, "server": server}):
        spec.loader.exec_module(module)
    return module


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
                "ShezwImageBatchSource",
                "ShezwImageBatchSave",
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
            (101, 2, 104, 1, "STRING"),
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
        self.assertEqual(fields_by_id["101"]["node_type"], "ShezwImageBatchSource")
        self.assertEqual(fields_by_id["101"]["widgets"], ["files_json"])
        self.assertNotIn("104", fields_by_id)

    def test_batch_source_and_hd_same_name_save_preserve_the_image_chain(self):
        source = self.nodes[101]
        save = self.nodes[104]
        self.assertEqual(source["type"], "ShezwImageBatchSource")
        self.assertEqual(source["widgets_values"], ["[]", 0])
        self.assertEqual(
            [output["name"] for output in source["outputs"]],
            ["image", "mask", "source_path", "source_name", "total"],
        )
        self.assertEqual(save["type"], "ShezwImageBatchSave")
        self.assertEqual([item["name"] for item in save["inputs"]], ["images", "source_path"])
        self.assertEqual(save["widgets_values"], [])
        self.assertTrue(
            {
                (101, 0, 94, 0, "IMAGE"),
                (101, 0, 103, 0, "IMAGE"),
                (115, 0, 104, 0, "IMAGE"),
                (101, 2, 104, 1, "STRING"),
            }.issubset(self.link_keys)
        )

    def test_batch_runtime_uses_native_multiselect_serial_prompts_and_hd_output(self):
        python_source = IMAGE_BATCH_PATH.read_text(encoding="utf-8")
        javascript_source = IMAGE_BATCH_JS_PATH.read_text(encoding="utf-8")
        self.assertIn('Multiselect = $true', python_source)
        self.assertIn('os.path.dirname(source), "HD", os.path.basename(source)', python_source)
        self.assertIn("os.replace(temp_path, target)", python_source)
        self.assertIn("for (let index = 0; index < files.length; index += 1)", javascript_source)
        self.assertIn("await waitForHistory(promptId)", javascript_source)
        self.assertIn("await cleanupPrompt(promptId, true)", javascript_source)
        self.assertIn("await cleanupPrompt(null, false, 5)", javascript_source)
        self.assertIn("app.__shezwImageBatchQueueHookInstalled", javascript_source)
        self.assertIn("shezw_clear_executor_cache_after_prompt: isFinalImage", javascript_source)
        self.assertIn("clear_executor_cache: !preserveModels", javascript_source)

    def test_batch_path_resolution_preserves_source_name_and_rejects_missing_files(self):
        image_batch = load_image_batch_module()
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "Portrait.JPG"
            source.write_bytes(b"test")
            files = image_batch._decode_selected_files(json.dumps([str(source), str(source)]))
            self.assertEqual(files, [str(source)])
            self.assertEqual(
                image_batch.hd_output_path(str(source)),
                str(Path(directory) / "HD" / "Portrait.JPG"),
            )
            with self.assertRaises(FileNotFoundError):
                image_batch._decode_selected_files(json.dumps([str(Path(directory) / "missing.png")]))

    def test_serialized_links_match_node_inputs_and_outputs(self):
        self.assertEqual(len(self.workflow["links"]), self.workflow["last_link_id"])
        for link in self.workflow["links"]:
            link_id, origin_id, origin_slot, target_id, target_slot, _ = link
            self.assertIn(link_id, self.nodes[origin_id]["outputs"][origin_slot]["links"])
            self.assertEqual(self.nodes[target_id]["inputs"][target_slot]["link"], link_id)


if __name__ == "__main__":
    unittest.main()

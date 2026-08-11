# ltx-director-pro
# tests/test_image_prompt_templates.py    2026-08-11
#
# @link    : https://shezw.com
# @author  : shezw
# @email   : hello@shezw.com

import unittest

from image_prompt_templates import (
    DEFAULT_TEMPLATE,
    NEGATIVE_PROMPT,
    PROMPT_TEMPLATES,
    ShezwImagePromptTemplate,
)


class ImagePromptTemplateTests(unittest.TestCase):
    def test_exposes_four_named_templates(self):
        self.assertEqual(len(PROMPT_TEMPLATES), 4)
        self.assertIn("Hasselblad Portrait / 哈苏人像", PROMPT_TEMPLATES)
        self.assertIn("Modern MV / 现代 MV", PROMPT_TEMPLATES)
        self.assertIn("Film Look Test / 胶片定妆照", PROMPT_TEMPLATES)
        self.assertIn(DEFAULT_TEMPLATE, PROMPT_TEMPLATES)

    def test_each_template_returns_prompt_and_shared_negative(self):
        node = ShezwImagePromptTemplate()
        for name, prompt in PROMPT_TEMPLATES.items():
            positive, negative, selected = node.select(name)
            self.assertEqual(positive, prompt)
            self.assertIn("preserve the exact identity", positive)
            self.assertNotIn("32k", positive.lower())
            self.assertNotIn("hyper sharp", positive.lower())
            self.assertLess(len(positive.split()), 55)
            self.assertEqual(negative, NEGATIVE_PROMPT)
            self.assertEqual(selected, name)

    def test_unknown_template_falls_back_to_best_template(self):
        positive, negative, selected = ShezwImagePromptTemplate().select("missing")
        self.assertEqual(selected, DEFAULT_TEMPLATE)
        self.assertEqual(positive, PROMPT_TEMPLATES[DEFAULT_TEMPLATE])
        self.assertEqual(negative, NEGATIVE_PROMPT)


if __name__ == "__main__":
    unittest.main()

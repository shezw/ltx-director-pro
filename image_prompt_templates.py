# ltx-director-pro
# image_prompt_templates.py    2026-08-11
#
# @link    : https://shezw.com
# @author  : shezw
# @email   : hello@shezw.com

from collections import OrderedDict


NEGATIVE_PROMPT = (
    "identity change, different person, plastic skin, waxy face, beauty filter, fake pores, "
    "oversharpening, sharpening halos, excessive HDR, oversaturated color, crushed blacks, "
    "clipped highlights, CGI, illustration, watermark, text, deformed features"
)

PROMPT_TEMPLATES = OrderedDict(
    [
        (
            "Hasselblad Portrait / 哈苏人像",
            (
                "preserve the exact identity, expression, pose, wardrobe and composition, natural "
                "medium-format editorial portrait, truthful skin texture and fine facial lines, "
                "delicate tonal transitions, soft highlight roll-off, clean shadows, restrained "
                "micro-contrast, accurate rich color, realistic optical detail"
            ),
        ),
        (
            "Modern MV / 现代 MV",
            (
                "preserve the exact identity, expression, pose, wardrobe and composition, modern "
                "music-video editorial still, truthful skin and hair texture, clean directional "
                "lighting, controlled highlights, open detailed shadows, vivid accurate color, "
                "crisp but natural optical detail, polished contemporary photography"
            ),
        ),
        (
            "Film Look Test / 胶片定妆照",
            (
                "preserve the exact identity, expression, pose, makeup, wardrobe and composition, "
                "professional character look-test portrait, truthful skin and fabric texture, "
                "restrained studio lighting, soft contrast, gentle highlight roll-off, neutral "
                "cinematic color, subtle organic photographic texture"
            ),
        ),
        (
            "Natural Cinema Master / 自然电影母版",
            (
                "preserve the exact identity, expression, pose, wardrobe, composition and lighting "
                "direction, natural editorial portrait, truthful skin with pores and fine facial "
                "lines, realistic hair and fabric, soft highlight roll-off, gentle tonal transitions, "
                "clean neutral color, restrained micro-contrast, realistic optical detail"
            ),
        ),
    ]
)

DEFAULT_TEMPLATE = "Natural Cinema Master / 自然电影母版"


class ShezwImagePromptTemplate:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "template": (
                    list(PROMPT_TEMPLATES),
                    {"default": DEFAULT_TEMPLATE},
                ),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("positive_prompt", "negative_prompt", "template_name")
    FUNCTION = "select"
    CATEGORY = "shezw/image"
    DESCRIPTION = "Select a bilingual still-image restoration prompt preset."

    def select(self, template=DEFAULT_TEMPLATE):
        selected = template if template in PROMPT_TEMPLATES else DEFAULT_TEMPLATE
        return (PROMPT_TEMPLATES[selected], NEGATIVE_PROMPT, selected)

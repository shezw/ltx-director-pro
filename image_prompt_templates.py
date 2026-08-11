# ltx-director-pro
# image_prompt_templates.py    2026-08-11
#
# @link    : https://shezw.com
# @author  : shezw
# @email   : hello@shezw.com

from collections import OrderedDict


NEGATIVE_PROMPT = (
    "identity change, altered facial features, different person, plastic skin, waxy face, "
    "excessive beauty retouching, oversharpening, sharpening halos, exaggerated pores, "
    "fake details, deformed eyes, deformed hands, oversaturated colors, crushed blacks, "
    "blown highlights, excessive HDR, heavy film grain, painterly, illustration, CGI, "
    "watermark, signature, text, jpeg artifacts, low quality, blurry"
)

PROMPT_TEMPLATES = OrderedDict(
    [
        (
            "Hasselblad Portrait / 哈苏人像",
            (
                "preserve the exact identity, facial structure, expression, pose, hairstyle, "
                "wardrobe, composition and background, Hasselblad medium format portrait "
                "photography, master portrait quality, natural realistic skin texture, delicate "
                "pores, smooth tonal transitions, rich color depth, refined micro-contrast, soft "
                "highlight roll-off, clean shadows, subtle dimensional lighting, premium editorial "
                "photography, elegant and timeless, highly detailed, photorealistic"
            ),
        ),
        (
            "Modern MV / 现代 MV",
            (
                "preserve the exact identity, facial structure, expression, pose, hairstyle, "
                "wardrobe, composition and background, ultra high-definition contemporary music "
                "video still, premium commercial cinematography, crisp natural details, modern "
                "cinematic lighting, controlled highlights, clean deep blacks, vivid but accurate "
                "colors, polished skin texture, sharp eyes and hair details, high dynamic range, "
                "sophisticated color grading, energetic and luxurious, photorealistic 4K quality"
            ),
        ),
        (
            "Film Look Test / 胶片定妆照",
            (
                "preserve the exact identity, facial structure, expression, pose, hairstyle, "
                "makeup, wardrobe, composition and background, professional character look test, "
                "cinematic costume and makeup portrait, natural skin texture, accurate fabric and "
                "makeup details, restrained studio lighting, neutral cinematic color palette, "
                "soft contrast, gentle highlight roll-off, subtle 35mm film grain, fine organic "
                "texture, understated editorial finish, realistic and production-ready"
            ),
        ),
        (
            "Natural Cinema Master / 自然电影母版",
            (
                "preserve the exact identity, facial anatomy, expression, pose, hairstyle, makeup, "
                "wardrobe, composition, lighting direction and background, premium cinematic master "
                "portrait, true-to-life skin with natural pores and fine imperfections, realistic "
                "hair and fabric texture, balanced optical sharpness, refined micro-contrast, high "
                "dynamic range with soft highlight roll-off and clean shadow separation, accurate "
                "neutral color science, subtle depth and dimensional lighting, restrained organic "
                "film texture, no artificial beautification, photorealistic, production-ready 4K"
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

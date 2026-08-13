# ltx-director-pro
# image_batch.py    2026-08-13
#
# @link    : https://shezw.com
# @author  : shezw
# @email   : hello@shezw.com

import asyncio
import json
import os
import subprocess
import sys
import uuid

from aiohttp import web
from PIL import Image, ImageOps
from server import PromptServer


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
IMAGE_DIALOG_FILTER = (
    "Images (*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.tif;*.tiff)|"
    "*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.tif;*.tiff|All files (*.*)|*.*"
)


def _normalise_selected_files(paths):
    selected = []
    seen = set()
    for raw_path in paths or []:
        path = os.path.abspath(os.path.expanduser(str(raw_path or "").strip()))
        key = os.path.normcase(path)
        if (
            path
            and key not in seen
            and os.path.isfile(path)
            and os.path.splitext(path)[1].lower() in IMAGE_EXTENSIONS
        ):
            selected.append(path)
            seen.add(key)
    return selected


def _decode_selected_files(files_json):
    try:
        paths = json.loads(files_json or "[]")
    except json.JSONDecodeError as exc:
        raise ValueError("Selected image list is not valid JSON") from exc
    if not isinstance(paths, list):
        raise ValueError("Selected image list must be an array")
    selected = []
    seen = set()
    for raw_path in paths:
        path = os.path.abspath(os.path.expanduser(str(raw_path or "").strip()))
        key = os.path.normcase(path)
        if not path:
            raise ValueError("Selected image path is empty")
        if os.path.splitext(path)[1].lower() not in IMAGE_EXTENSIONS:
            raise ValueError(f"Unsupported source image type: {path}")
        if not os.path.isfile(path):
            raise FileNotFoundError(f"Source image not found: {path}")
        if key not in seen:
            selected.append(path)
            seen.add(key)
    return selected


def _powershell_image_dialog(initial_directory=""):
    script = r"""
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Select source images / 选择源图片'
$dialog.Filter = $env:SHEZW_IMAGE_BATCH_FILTER
$dialog.Multiselect = $true
$dialog.RestoreDirectory = $true
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.StartPosition = 'CenterScreen'
if ($env:SHEZW_IMAGE_BATCH_INITIAL_DIR -and (Test-Path -LiteralPath $env:SHEZW_IMAGE_BATCH_INITIAL_DIR -PathType Container)) {
    $dialog.InitialDirectory = $env:SHEZW_IMAGE_BATCH_INITIAL_DIR
}
if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    ConvertTo-Json -InputObject @($dialog.FileNames) -Compress
} else {
    '[]'
}
$owner.Dispose()
"""
    env = os.environ.copy()
    env["SHEZW_IMAGE_BATCH_FILTER"] = IMAGE_DIALOG_FILTER
    env["SHEZW_IMAGE_BATCH_INITIAL_DIR"] = initial_directory or ""
    run_options = {
        "capture_output": True,
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
        "env": env,
        "check": False,
    }
    if hasattr(subprocess, "CREATE_NO_WINDOW"):
        run_options["creationflags"] = subprocess.CREATE_NO_WINDOW
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-STA", "-Command", script],
        **run_options,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Native image selection dialog failed")
    payload = json.loads(result.stdout.lstrip("\ufeff").strip() or "[]")
    return [payload] if isinstance(payload, str) else payload


def _tk_image_dialog(initial_directory=""):
    import tkinter
    from tkinter import filedialog

    root = tkinter.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        return list(
            filedialog.askopenfilenames(
                parent=root,
                title="Select source images / 选择源图片",
                initialdir=initial_directory or None,
                filetypes=[
                    ("Images", "*.png *.jpg *.jpeg *.webp *.bmp *.tif *.tiff"),
                    ("All files", "*.*"),
                ],
            )
        )
    finally:
        root.destroy()


def _select_image_files(initial_directory=""):
    if sys.platform == "win32":
        return _powershell_image_dialog(initial_directory)
    return _tk_image_dialog(initial_directory)


def hd_output_path(source_path):
    source = os.path.abspath(os.path.expanduser(source_path or ""))
    if not os.path.isfile(source):
        raise FileNotFoundError(f"Source image not found: {source_path}")
    if os.path.splitext(source)[1].lower() not in IMAGE_EXTENSIONS:
        raise ValueError(f"Unsupported source image type: {source_path}")
    return os.path.join(os.path.dirname(source), "HD", os.path.basename(source))


@PromptServer.instance.routes.post("/shezw/image_batch/select")
async def shezw_image_batch_select(request):
    try:
        payload = await request.json()
        initial_directory = str(payload.get("initial_directory") or "").strip()
        if not os.path.isdir(initial_directory):
            initial_directory = ""
        paths = await asyncio.to_thread(_select_image_files, initial_directory)
        files = _normalise_selected_files(paths)
        return web.json_response(
            {
                "ok": True,
                "cancelled": not files,
                "files": files,
                "count": len(files),
            }
        )
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)


class ShezwImageBatchSource:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "files_json": ("STRING", {"default": "[]", "multiline": True}),
                "current_index": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1}),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "STRING", "INT")
    RETURN_NAMES = ("image", "mask", "source_path", "source_name", "total")
    FUNCTION = "load_image"
    CATEGORY = "shezw/image"
    DESCRIPTION = "Loads one image from a frontend-managed, serial batch of absolute source paths."

    @classmethod
    def VALIDATE_INPUTS(cls, files_json, current_index):
        try:
            files = _decode_selected_files(files_json)
            if not files:
                return "Select at least one source image"
            if current_index < 0 or current_index >= len(files):
                return f"Image index {current_index} is outside the selected batch"
        except Exception as exc:
            return str(exc)
        return True

    @classmethod
    def IS_CHANGED(cls, files_json, current_index):
        try:
            files = _decode_selected_files(files_json)
            path = files[int(current_index)]
            stat = os.stat(path)
            return f"{path}:{stat.st_mtime_ns}:{stat.st_size}"
        except Exception:
            return float("nan")

    def load_image(self, files_json, current_index):
        import numpy as np
        import torch

        files = _decode_selected_files(files_json)
        if not files:
            raise ValueError("Select at least one source image")
        index = int(current_index)
        if index < 0 or index >= len(files):
            raise IndexError(f"Image index {index} is outside a batch of {len(files)}")

        path = files[index]
        with Image.open(path) as opened:
            image = ImageOps.exif_transpose(opened)
            if image.mode == "I":
                image = image.point(lambda value: value * (1 / 255))
            alpha = image.getchannel("A") if "A" in image.getbands() else None
            rgb = image.convert("RGB")
            pixels = np.asarray(rgb, dtype=np.float32).copy() / 255.0
            image_tensor = torch.from_numpy(pixels)[None,]
            if alpha is None:
                mask_tensor = torch.zeros((1, rgb.height, rgb.width), dtype=torch.float32)
            else:
                mask = 1.0 - (np.asarray(alpha, dtype=np.float32).copy() / 255.0)
                mask_tensor = torch.from_numpy(mask)[None,]

        return image_tensor, mask_tensor, path, os.path.basename(path), len(files)


class ShezwImageBatchSave:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "source_path": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("saved_path",)
    FUNCTION = "save_image"
    OUTPUT_NODE = True
    CATEGORY = "shezw/image"
    DESCRIPTION = "Saves to an HD subfolder beside the source image, using the source filename."

    def save_image(self, images, source_path):
        import numpy as np

        if len(images) != 1:
            raise ValueError(f"Expected one processed image, received batch size {len(images)}")

        target = hd_output_path(source_path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        suffix = os.path.splitext(target)[1].lower()
        temp_path = os.path.join(
            os.path.dirname(target),
            f".{os.path.basename(target)}.{uuid.uuid4().hex}.tmp{suffix}",
        )

        pixels = images[0].detach().cpu().float().clamp(0, 1).numpy()
        rendered = Image.fromarray(np.rint(pixels * 255.0).astype(np.uint8))
        save_options = {}
        with Image.open(source_path) as source:
            if source.info.get("icc_profile"):
                save_options["icc_profile"] = source.info["icc_profile"]
            if source.info.get("dpi"):
                save_options["dpi"] = source.info["dpi"]

        if suffix in {".jpg", ".jpeg"}:
            rendered = rendered.convert("RGB")
            save_options.update({"format": "JPEG", "quality": 95, "subsampling": 0, "optimize": True})
        elif suffix == ".png":
            save_options.update({"format": "PNG", "compress_level": 4})
        elif suffix == ".webp":
            save_options.update({"format": "WEBP", "quality": 95, "method": 4})
        elif suffix == ".bmp":
            rendered = rendered.convert("RGB")
            save_options.update({"format": "BMP"})
        else:
            save_options.update({"format": "TIFF", "compression": "tiff_lzw"})

        try:
            rendered.save(temp_path, **save_options)
            os.replace(temp_path, target)
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)

        return {
            "ui": {"saved_paths": [target], "text": [f"Saved: {target}"]},
            "result": (target,),
        }

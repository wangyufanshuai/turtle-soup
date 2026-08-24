from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCES = [
    Path(r"C:\Users\86137\.codex\generated_images\01a02905-0258-7b90-ab21-f6161965170e\exec-d8003247-087c-4b08-96b9-efce8dbf4d10.png"),
    Path(r"C:\Users\86137\.codex\generated_images\01a02905-0258-7b90-ab21-f6161965170e\exec-3d9f9500-4c0a-437c-86e0-234e42caa6f8.png"),
    Path(r"C:\Users\86137\.codex\generated_images\01a02905-0258-7b90-ab21-f6161965170e\exec-b411bfdb-b9a7-4e05-817e-950c86738e47.png"),
    Path(r"C:\Users\86137\.codex\generated_images\01a02905-0258-7b90-ab21-f6161965170e\exec-d2830aef-57ee-4e3e-9245-396ffbc77d9f.png"),
    Path(r"C:\Users\86137\.codex\generated_images\01a02905-0258-7b90-ab21-f6161965170e\exec-5b405f8d-6afc-4799-b2ea-58e5eed4b8e0.png"),
    Path(r"C:\Users\86137\.codex\generated_images\01a02905-0258-7b90-ab21-f6161965170e\exec-51acd1e4-d6c5-44d4-be0c-326ed11f5c0e.png"),
    Path(r"C:\Users\86137\.codex\generated_images\01a02905-0258-7b90-ab21-f6161965170e\exec-9d44de78-0cf3-4459-b5a3-1d2404927798.png"),
    Path(r"C:\Users\86137\.codex\generated_images\01a02905-0258-7b90-ab21-f6161965170e\exec-985a2941-517e-497d-b533-6c62b5d30128.png"),
    Path(r"C:\Users\86137\.codex\generated_images\01a02905-0258-7b90-ab21-f6161965170e\exec-3c9bd823-9665-40d9-ae26-3d485b1b450c.png"),
]

PROMPTS = [
    "2x2 premium hand-painted editorial noir investigation scenes for C01-C04: sealed cold room, snow route, theatre identity confusion, future-dated mail; grounded and non-violent, no text or watermark.",
    "2x2 premium hand-painted editorial noir investigation scenes for C05-C08: reflected emergency light, delayed harbor ledger, magnetic key return, buffered recording; grounded and non-violent, no text or watermark.",
    "2x2 premium hand-painted editorial noir investigation scenes for C09-C12: delayed roof drip, queued telephone ring, borrowed signature mark, virtual elevator floor; grounded and non-violent, no text or watermark.",
    "2x2 premium hand-painted editorial noir investigation scenes for C13-C16: submerged counterweight, moving boundary, panorama resampling, rotating pass-through cabinet; grounded and non-violent, no text or watermark.",
    "2x2 premium hand-painted editorial noir investigation scenes for C17-C20: independent clock wheel, scale zeroing, dew point fog, six roles with five people; grounded and non-violent, no text or watermark.",
    "2x2 premium hand-painted editorial noir investigation scenes for C21-C24: sparse video sampling, aggregate bridge load, delayed air sampling, rotating museum wall; grounded and non-violent, no text or watermark.",
    "2x2 premium hand-painted editorial noir investigation scenes for C25-C28: doorbell debounce, three-dimensional pipe route, AGV cargo transfer, delayed thermal measurement; grounded engineering, no text or watermark.",
    "2x2 premium hand-painted editorial noir investigation scenes for C29-C32: role seal, shift identifier handoff, hotel contract cardinality, inherited access permission; grounded institutions, no text or watermark.",
    "2x2 premium hand-painted editorial noir investigation scenes for C33-C36: mismatched timebases, future-dated cargo seal, curved-glass reflection, empty terminal train; grounded systems, no text or watermark.",
]

def cover(image: Image.Image, size: tuple[int, int], center: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    target_ratio = size[0] / size[1]
    ratio = image.width / image.height
    if ratio > target_ratio:
        width = int(image.height * target_ratio)
        left = int((image.width - width) * center[0])
        box = (left, 0, left + width, image.height)
    else:
        height = int(image.width / target_ratio)
        top = int((image.height - height) * center[1])
        box = (0, top, image.width, top + height)
    return image.crop(box).resize(size, Image.Resampling.LANCZOS)

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save_asset(image: Image.Image, path: Path, size: tuple[int, int], quality: int = 64) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    prepared = ImageEnhance.Contrast(image).enhance(1.04)
    prepared = ImageEnhance.Color(prepared).enhance(0.94)
    prepared = cover(prepared, size)
    prepared.save(path, "WEBP", quality=quality, method=6)

def main() -> None:
    sources = [Path(value) for value in sys.argv[1:]] or DEFAULT_SOURCES
    if len(sources) != 9 or any(not path.exists() for path in sources):
        raise SystemExit("Expected nine existing 2x2 source sheets")
    entries: list[dict[str, object]] = []
    for name in ["manifest.v0.6.json", "manifest.season2.v1.0.json", "manifest.season3.v1.1.json"]:
        manifest = json.loads((ROOT / "content/zh/cases" / name).read_text(encoding="utf-8"))
        entries.extend(manifest["cases"])
    assets: list[dict[str, object]] = []
    generated_at = datetime.now(timezone.utc).isoformat()
    focus_points = [(0.24, 0.28), (0.76, 0.28), (0.5, 0.5), (0.28, 0.74), (0.74, 0.74)]
    for sheet_index, source in enumerate(sources):
        sheet = Image.open(source).convert("RGB")
        half_w, half_h = sheet.width // 2, sheet.height // 2
        for quadrant in range(4):
            case_index = sheet_index * 4 + quadrant
            entry = entries[case_index]
            code = entry["id"].split("-")[0]
            public = entry.get("public", {})
            if isinstance(public, dict) and public.get("title"):
                title = str(public["title"])
            else:
                case_file = json.loads((ROOT / "content/zh/cases" / str(entry["file"])).read_text(encoding="utf-8"))
                title_key = case_file.get("surface", {}).get("titleKey") or case_file.get("metadata", {}).get("titleKey")
                title = case_file.get("localization", {}).get("zh-CN", {}).get(title_key, str(entry["id"]))
            col, row = quadrant % 2, quadrant // 2
            inset = 3
            panel = sheet.crop((col * half_w + inset, row * half_h + inset, (col + 1) * half_w - inset, (row + 1) * half_h - inset))
            out_dir = ROOT / "apps/web/public/assets/cases" / code
            specs = [
                ("scene-desktop", "scene-desktop.webp", (640, 413), (0.5, 0.5), f"{title}的桌面主场景"),
                ("scene-mobile", "scene-mobile.webp", (320, 426), (0.5, 0.52), f"{title}的手机主场景"),
            ]
            for role, filename, size, center, alt in specs:
                path = out_dir / filename
                save_asset(cover(panel, size, center), path, size, 55)
                assets.append({"id": f"{code}-{role}", "caseId": entry["id"], "role": role, "path": f"/assets/cases/{code}/{filename}", "width": size[0], "height": size[1], "bytes": path.stat().st_size, "sha256": sha256(path), "alt": alt, "prompt": PROMPTS[sheet_index], "generatedAt": generated_at, "generator": "OpenAI built-in imagegen / gpt-image-2", "humanEdits": ["selected from generated master", "quadrant crop", "contrast and saturation normalization", "WebP compression"], "licenseStatus": "generated-for-project"})
            for evidence_index, point in enumerate(focus_points, 1):
                zoomed = cover(panel, (256, 160), point).filter(ImageFilter.UnsharpMask(radius=0.65, percent=55, threshold=3))
                filename = f"evidence-{evidence_index:02d}.webp"
                path = out_dir / filename
                save_asset(zoomed, path, (256, 160), 45)
                assets.append({"id": f"{code}-evidence-{evidence_index:02d}", "caseId": entry["id"], "role": "evidence", "path": f"/assets/cases/{code}/{filename}", "width": 256, "height": 160, "bytes": path.stat().st_size, "sha256": sha256(path), "alt": f"{title}的证据局部图 {evidence_index}", "prompt": PROMPTS[sheet_index], "generatedAt": generated_at, "generator": "OpenAI built-in imagegen / gpt-image-2", "humanEdits": ["selected from generated master", f"evidence focus crop {evidence_index}", "contrast and saturation normalization", "WebP compression"], "licenseStatus": "generated-for-project"})
    output = {"manifestVersion": 1, "releaseProfile": "v1.1-internal-rc", "generatedAt": generated_at, "sourceMasters": [{"sha256": sha256(path), "generator": "OpenAI built-in imagegen / gpt-image-2", "prompt": PROMPTS[index], "published": False} for index, path in enumerate(sources)], "assets": assets}
    output_path = ROOT / "docs/raster-manifest.v1.1.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"assets": len(assets), "bytes": sum(item["bytes"] for item in assets), "manifest": str(output_path)}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()

"""
生成带安全边距（safe area）的 Tauri 图标源图。

动机：macOS 会对应用图标做系统 mask（圆角方形），如果源图内容贴边，
在 Dock/Finder 里会显得“更大/突兀”。最简单的修复就是加留白：把现有图标缩小后居中贴到更大的透明画布上。
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="src", required=True, help="输入 PNG 路径")
    p.add_argument("--out", dest="dst", required=True, help="输出 PNG 路径")
    p.add_argument("--size", type=int, default=1024, help="输出画布尺寸（正方形）")
    p.add_argument("--scale", type=float, default=0.88, help="内容缩放比例（0~1）")
    return p.parse_args()


def main() -> int:
    a = parse_args()
    src = Path(a.src)
    dst = Path(a.dst)

    if not src.exists():
        raise FileNotFoundError(src)
    if a.size <= 0:
        raise ValueError("--size 必须 > 0")
    if not (0.0 < a.scale <= 1.0):
        raise ValueError("--scale 必须在 (0, 1] 之间")

    im = Image.open(src).convert("RGBA")
    canvas = Image.new("RGBA", (a.size, a.size), (0, 0, 0, 0))

    target = int(round(a.size * a.scale))
    resized = im.resize((target, target), resample=Image.Resampling.LANCZOS)

    x = (a.size - target) // 2
    y = (a.size - target) // 2
    canvas.paste(resized, (x, y), resized)

    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst, format="PNG", optimize=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


import os
import time
from datetime import datetime
from typing import Tuple, Optional, List
from pathlib import Path
import pyautogui
from PIL import Image, ImageDraw, ImageFont


class ScreenshotCapture:
    def __init__(self, default_directory: str = "screenshots"):
        self.default_directory = Path(default_directory)
        self.default_directory.mkdir(exist_ok=True)

        self.default_format = "PNG"
        self.quality = 95
        self.include_cursor = False

        self.screen_width, self.screen_height = pyautogui.size()

        self.screenshot_history = []

    def capture(self, filename: Optional[str] = None,
                region: Optional[Tuple[int, int, int, int]] = None) -> str:
        try:
            if not filename:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"screenshot_{timestamp}.png"

            if not Path(filename).suffix:
                filename += ".png"

            if not os.path.isabs(filename):
                filepath = self.default_directory / filename
            else:
                filepath = Path(filename)

            filepath.parent.mkdir(parents=True, exist_ok=True)

            if region:
                screenshot = pyautogui.screenshot(region=region)
            else:
                screenshot = pyautogui.screenshot()

            screenshot.save(str(filepath), format=self.default_format, quality=self.quality)

            self.screenshot_history.append({
                "path": str(filepath),
                "timestamp": datetime.now().isoformat(),
                "region": region,
                "size": screenshot.size
            })

            return str(filepath)

        except Exception as e:
            print(f"Screenshot capture error: {e}")
            return ""

    def capture_window(self, window_title: str, filename: Optional[str] = None) -> str:
        try:
            return self.capture(filename)

        except Exception as e:
            print(f"Window capture error: {e}")
            return ""

    def capture_region(self, left: int, top: int, width: int, height: int,
                      filename: Optional[str] = None) -> str:
        return self.capture(filename, region=(left, top, width, height))

    def capture_with_annotation(self, filename: Optional[str] = None,
                               annotations: Optional[List[dict]] = None) -> str:
        try:
            screenshot = pyautogui.screenshot()

            if annotations:
                screenshot = self._add_annotations(screenshot, annotations)

            if not filename:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"annotated_screenshot_{timestamp}.png"

            if not os.path.isabs(filename):
                filepath = self.default_directory / filename
            else:
                filepath = Path(filename)

            filepath.parent.mkdir(parents=True, exist_ok=True)
            screenshot.save(str(filepath), format=self.default_format, quality=self.quality)

            self.screenshot_history.append({
                "path": str(filepath),
                "timestamp": datetime.now().isoformat(),
                "region": None,
                "size": screenshot.size,
                "annotations": len(annotations) if annotations else 0
            })

            return str(filepath)

        except Exception as e:
            print(f"Annotated screenshot error: {e}")
            return ""

    def capture_multiple(self, count: int, interval: float = 1.0,
                        filename_prefix: str = "sequence") -> List[str]:
        screenshots = []

        try:
            for i in range(count):
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
                filename = f"{filename_prefix}_{i+1:03d}_{timestamp}.png"

                screenshot_path = self.capture(filename)
                if screenshot_path:
                    screenshots.append(screenshot_path)

                if i < count - 1:
                    time.sleep(interval)

        except Exception as e:
            print(f"Multiple capture error: {e}")

        return screenshots

    def capture_delayed(self, delay: float, filename: Optional[str] = None) -> str:
        try:
            time.sleep(delay)
            return self.capture(filename)
        except Exception as e:
            print(f"Delayed capture error: {e}")
            return ""

    def capture_clipboard(self) -> bool:
        try:
            screenshot = pyautogui.screenshot()
            temp_file = self.default_directory / "clipboard_temp.png"
            screenshot.save(str(temp_file))

            return True
        except Exception as e:
            print(f"Clipboard capture error: {e}")
            return False

    def _add_annotations(self, image: Image.Image, annotations: List[dict]) -> Image.Image:
        try:
            annotated = image.copy()
            draw = ImageDraw.Draw(annotated)

            try:
                font = ImageFont.truetype("arial.ttf", 20)
            except:
                font = ImageFont.load_default()

            for annotation in annotations:
                ann_type = annotation.get("type", "text")
                position = annotation.get("position", (10, 10))
                color = annotation.get("color", "red")

                if ann_type == "text":
                    text = annotation.get("text", "")
                    draw.text(position, text, fill=color, font=font)

                elif ann_type == "rectangle":
                    size = annotation.get("size", (100, 100))
                    x, y = position
                    w, h = size
                    draw.rectangle([x, y, x + w, y + h], outline=color, width=2)

                elif ann_type == "circle":
                    radius = annotation.get("radius", 50)
                    x, y = position
                    draw.ellipse([x - radius, y - radius, x + radius, y + radius],
                               outline=color, width=2)

                elif ann_type == "arrow":
                    end_position = annotation.get("end_position", (position[0] + 50, position[1] + 50))
                    self._draw_arrow(draw, position, end_position, color)

                elif ann_type == "highlight":
                    size = annotation.get("size", (100, 30))
                    x, y = position
                    w, h = size
                    highlight = Image.new('RGBA', (w, h), (*self._hex_to_rgb(color), 128))
                    annotated.paste(highlight, (x, y), highlight)

            return annotated

        except Exception as e:
            print(f"Annotation error: {e}")
            return image

    def _draw_arrow(self, draw, start, end, color, width=2):
        import math

        draw.line([start, end], fill=color, width=width)

        angle = math.atan2(end[1] - start[1], end[0] - start[0])
        arrow_length = 20
        arrow_angle = math.pi / 6

        x1 = end[0] - arrow_length * math.cos(angle - arrow_angle)
        y1 = end[1] - arrow_length * math.sin(angle - arrow_angle)
        x2 = end[0] - arrow_length * math.cos(angle + arrow_angle)
        y2 = end[1] - arrow_length * math.sin(angle + arrow_angle)

        draw.line([end, (x1, y1)], fill=color, width=width)
        draw.line([end, (x2, y2)], fill=color, width=width)

    def _hex_to_rgb(self, hex_color):
        if hex_color.startswith('#'):
            hex_color = hex_color[1:]
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

    def compare_screenshots(self, image1_path: str, image2_path: str,
                           output_path: Optional[str] = None) -> str:
        try:
            from PIL import ImageChops

            img1 = Image.open(image1_path)
            img2 = Image.open(image2_path)

            if img1.size != img2.size:
                img2 = img2.resize(img1.size)

            diff = ImageChops.difference(img1, img2)

            if not output_path:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                output_path = self.default_directory / f"diff_{timestamp}.png"

            diff.save(str(output_path))
            return str(output_path)

        except Exception as e:
            print(f"Screenshot comparison error: {e}")
            return ""

    def get_screen_info(self) -> dict:
        return {
            "width": self.screen_width,
            "height": self.screen_height,
            "size": (self.screen_width, self.screen_height)
        }

    def get_screenshot_history(self, limit: Optional[int] = None) -> List[dict]:
        if limit:
            return self.screenshot_history[-limit:]
        return self.screenshot_history.copy()

    def clear_history(self):
        self.screenshot_history.clear()

    def set_default_format(self, format_name: str):
        self.default_format = format_name.upper()

    def set_quality(self, quality: int):
        self.quality = max(1, min(100, quality))

    def set_default_directory(self, directory: str):
        self.default_directory = Path(directory)
        self.default_directory.mkdir(exist_ok=True)

    def cleanup_old_screenshots(self, days_old: int = 30):
        try:
            cutoff_time = time.time() - (days_old * 24 * 60 * 60)

            for file_path in self.default_directory.glob("*.png"):
                if file_path.stat().st_mtime < cutoff_time:
                    file_path.unlink()
                    print(f"Deleted old screenshot: {file_path}")

            for file_path in self.default_directory.glob("*.jpg"):
                if file_path.stat().st_mtime < cutoff_time:
                    file_path.unlink()
                    print(f"Deleted old screenshot: {file_path}")

        except Exception as e:
            print(f"Cleanup error: {e}")

    def create_timelapse(self, screenshot_paths: List[str],
                        output_path: str, duration_per_frame: float = 0.5) -> str:
        try:
            images = []
            for path in screenshot_paths:
                img = Image.open(path)
                images.append(img)

            if images:
                images[0].save(
                    output_path,
                    save_all=True,
                    append_images=images[1:],
                    duration=int(duration_per_frame * 1000),
                    loop=0
                )

            return output_path

        except Exception as e:
            print(f"Timelapse creation error: {e}")
            return ""

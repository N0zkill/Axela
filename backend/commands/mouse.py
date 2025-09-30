import time
import pyautogui
import cv2
import numpy as np
from typing import Tuple, Optional, Union
from pathlib import Path

pyautogui.PAUSE = 0.1
pyautogui.FAILSAFE = True


class MouseController:

    def __init__(self):
        self.screen_width, self.screen_height = pyautogui.size()
        self.last_position = (0, 0)

    def click(self, target: Union[str, Tuple[int, int]], button: str = 'left') -> bool:
        try:
            position = self._resolve_target(target)
            if position:
                pyautogui.click(position[0], position[1], button=button)
                self.last_position = position
                return True
            return False
        except Exception as e:
            pass
            return False

    def double_click(self, target: Union[str, Tuple[int, int]]) -> bool:
        try:
            position = self._resolve_target(target)
            if position:
                pyautogui.doubleClick(position[0], position[1])
                self.last_position = position
                return True
            return False
        except Exception as e:
            pass
            return False

    def right_click(self, target: Union[str, Tuple[int, int]]) -> bool:
        return self.click(target, button='right')

    def drag(self, source: Union[str, Tuple[int, int]],
             destination: Union[str, Tuple[int, int]],
             duration: float = 1.0) -> bool:
        try:
            start_pos = self._resolve_target(source)
            end_pos = self._resolve_target(destination)

            if start_pos and end_pos:
                pyautogui.drag(end_pos[0] - start_pos[0],
                              end_pos[1] - start_pos[1],
                              duration=duration,
                              button='left')
                self.last_position = end_pos
                return True
            return False
        except Exception as e:
            pass
            return False

    def scroll(self, direction: str, clicks: int = 3,
               position: Optional[Tuple[int, int]] = None) -> bool:
        try:
            if position:
                pyautogui.moveTo(position[0], position[1])

            if direction.lower() == 'up':
                pyautogui.scroll(clicks)
            elif direction.lower() == 'down':
                pyautogui.scroll(-clicks)
            elif direction.lower() == 'left':
                pyautogui.hscroll(-clicks)
            elif direction.lower() == 'right':
                pyautogui.hscroll(clicks)
            else:
                return False

            return True
        except Exception as e:
            pass
            return False

    def move_to(self, target: Union[str, Tuple[int, int]], duration: float = 0.5) -> bool:
        try:
            position = self._resolve_target(target)
            if position:
                pyautogui.moveTo(position[0], position[1], duration=duration)
                self.last_position = position
                return True
            return False
        except Exception as e:
            pass
            return False

    def get_position(self) -> Tuple[int, int]:
        return pyautogui.position()

    def get_screen_size(self) -> Tuple[int, int]:
        return self.screen_width, self.screen_height

    def _resolve_target(self, target: Union[str, Tuple[int, int]]) -> Optional[Tuple[int, int]]:
        if isinstance(target, tuple) and len(target) == 2:
            return target
        elif isinstance(target, str):
            return self._find_element_by_description(target)

    def _find_element_by_description(self, description: str) -> Optional[Tuple[int, int]]:
        try:
            try:
                from util.element_finder import SmartElementFinder

                import tempfile
                import os

                with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                    screenshot = pyautogui.screenshot()
                    screenshot.save(tmp_file.name)
                    screenshot_path = tmp_file.name

                try:
                    finder = SmartElementFinder()

                    description_lower = description.lower().strip()

                    if "first" in description_lower and "result" in description_lower:
                        results = finder.find_search_results(screenshot_path)
                        if results:
                            return results[0].coordinates

                    elif "button" in description_lower or "click" in description_lower:
                        buttons = finder.find_buttons_and_links(screenshot_path)
                        if buttons:
                            for button in buttons:
                                if any(word in button.text.lower() for word in description_lower.split()):
                                    return button.coordinates
                            return buttons[0].coordinates

                    else:
                        elements = finder.find_elements_by_text(screenshot_path, description, fuzzy_match=True)
                        if elements:
                            return elements[0].coordinates

                finally:
                    try:
                        os.unlink(screenshot_path)
                    except:
                        pass

            except ImportError:
                pass
            except Exception as e:
                pass

            position = self._find_text_on_screen(description)
            if position:
                return position

            if Path(description).exists():
                return self._find_image_on_screen(description)

            common_elements = {
                'start button': (50, self.screen_height - 50),
                'taskbar': (self.screen_width // 2, self.screen_height - 25),
                'center': (self.screen_width // 2, self.screen_height // 2),
                'top left': (50, 50),
                'top right': (self.screen_width - 50, 50),
                'bottom left': (50, self.screen_height - 50),
                'bottom right': (self.screen_width - 50, self.screen_height - 50),
            }

            desc_lower = description.lower()
            for element, coords in common_elements.items():
                if element in desc_lower:
                    return coords

            return None

        except Exception as e:
            pass
            return None

    def _find_text_on_screen(self, text: str) -> Optional[Tuple[int, int]]:
        try:
            return None
        except:
            return None

    def _find_image_on_screen(self, image_path: str, confidence: float = 0.8) -> Optional[Tuple[int, int]]:
        try:
            screenshot = pyautogui.screenshot()
            screenshot_np = np.array(screenshot)
            screenshot_gray = cv2.cvtColor(screenshot_np, cv2.COLOR_RGB2GRAY)

            template = cv2.imread(image_path, 0)
            if template is None:
                return None

            result = cv2.matchTemplate(screenshot_gray, template, cv2.TM_CCOEFF_NORMED)
            locations = np.where(result >= confidence)

            if len(locations[0]) > 0:
                y, x = locations[0][0], locations[1][0]
                h, w = template.shape
                center_x = x + w // 2
                center_y = y + h // 2
                return (center_x, center_y)

            return None

        except Exception as e:
            pass
            return None

    def take_screenshot_for_click(self, save_path: str = "click_reference.png") -> str:
        try:
            screenshot = pyautogui.screenshot()
            screenshot.save(save_path)
            return save_path
        except Exception as e:
            pass
            return ""

    def click_relative(self, offset_x: int, offset_y: int,
                      reference: Optional[Tuple[int, int]] = None) -> bool:
        try:
            if reference is None:
                reference = self.last_position

            target_x = reference[0] + offset_x
            target_y = reference[1] + offset_y

            target_x = max(0, min(target_x, self.screen_width - 1))
            target_y = max(0, min(target_y, self.screen_height - 1))

            return self.click((target_x, target_y))

        except Exception as e:
            pass
            return False

    def multi_click(self, positions: list, delay: float = 0.5) -> bool:
        try:
            for position in positions:
                if not self.click(position):
                    return False
                time.sleep(delay)
            return True
        except Exception as e:
            pass
            return False

    def is_position_valid(self, position: Tuple[int, int]) -> bool:
        x, y = position
        return 0 <= x < self.screen_width and 0 <= y < self.screen_height

    def wait_for_element(self, target: str, timeout: int = 10) -> Optional[Tuple[int, int]]:
        start_time = time.time()
        while time.time() - start_time < timeout:
            position = self._resolve_target(target)
            if position:
                return position
            time.sleep(0.5)
        return None

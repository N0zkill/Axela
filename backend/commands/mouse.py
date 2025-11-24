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
        self._element_finder = None
        self._tried_targets = []  # Track targets that have been tried already

    def click(self, target: Union[str, Tuple[int, int]], button: str = 'left') -> bool:
        try:
            position = self._resolve_target(target)
            if position:
                print(f"Clicking at position: {position}")
                pyautogui.click(position[0], position[1], button=button)
                self.last_position = position
                return True
            else:
                print(f"Could not find target: {target}")
                return False
        except Exception as e:
            print(f"Click error: {e}")
            import traceback
            traceback.print_exc()
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
                from commands.screenshot import ScreenshotCapture

                import tempfile
                import os

                # Use ScreenshotCapture to properly mask taskbar
                screenshot_capture = ScreenshotCapture()
                
                with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                    screenshot = pyautogui.screenshot()
                    # Apply taskbar mask before saving
                    screenshot = screenshot_capture._apply_taskbar_mask(screenshot)
                    screenshot.save(tmp_file.name)
                    screenshot_path = tmp_file.name

                try:
                    # Use cached finder instance
                    if self._element_finder is None:
                        self._element_finder = SmartElementFinder()

                    finder = self._element_finder

                    description_lower = description.lower().strip()
                    print(f"Searching for element: '{description}'")

                    if "first" in description_lower and ("result" in description_lower or "link" in description_lower):
                        print("Looking for first search result...")
                        results = finder.find_search_results(screenshot_path)
                        print(f"Found {len(results)} search results")
                        if results:
                            print(f"First result: '{results[0].text}' at {results[0].coordinates}")
                            return results[0].coordinates

                    elif "button" in description_lower or "click" in description_lower:
                        print("Looking for buttons/links...")
                        buttons = finder.find_buttons_and_links(screenshot_path)
                        print(f"Found {len(buttons)} buttons/links")
                        if buttons:
                            for button in buttons:
                                if any(word in button.text.lower() for word in description_lower.split()):
                                    print(f"Matched button: '{button.text}' at {button.coordinates}")
                                    return button.coordinates
                            print(f"No match, using first button: '{buttons[0].text}' at {buttons[0].coordinates}")
                            return buttons[0].coordinates

                    else:
                        # Use exact matching for short specific text or numbers with symbols
                        use_fuzzy = True
                        if len(description) <= 5 or any(sym in description for sym in ['$', '€', '£', '¥', '#']):
                            print(f"Searching for text: '{description}' (EXACT match mode)")
                            use_fuzzy = False
                        else:
                            print(f"Searching for text: '{description}' (fuzzy match mode)")
                        
                        # Check if we have tried targets to exclude
                        exclude_list = getattr(self, '_tried_targets', [])
                        if exclude_list:
                            print(f"Excluding {len(exclude_list)} already-tried targets: {exclude_list}")
                        
                        elements = finder.find_elements_by_text(screenshot_path, description, fuzzy_match=use_fuzzy, exclude_texts=exclude_list)
                        print(f"Found {len(elements)} matching elements")
                        
                        # If exact match found nothing, try fuzzy match as fallback
                        if not elements and not use_fuzzy:
                            print("No exact matches found, trying fuzzy match...")
                            elements = finder.find_elements_by_text(screenshot_path, description, fuzzy_match=True, exclude_texts=exclude_list)
                            print(f"Found {len(elements)} fuzzy matches")
                        
                        if elements:
                            best_text_match = elements[0]
                            
                            # intelligent click adjustment: check for visual elements (icons/images) above the text
                            try:
                                visual_elements = finder.find_visual_elements(screenshot_path)
                                if visual_elements:
                                    text_center_x, text_center_y = best_text_match.coordinates
                                    
                                    best_visual_match = None
                                    min_dist = float('inf')
                                    
                                    for visual in visual_elements:
                                        vis_x, vis_y = visual.coordinates
                                        
                                        # Check horizontal alignment (strict)
                                        if abs(vis_x - text_center_x) < 60:
                                            # Check if visual is ABOVE text (within 150px)
                                            # text_y > vis_y means visual is higher (screen coords start top-left)
                                            if 10 < (text_center_y - vis_y) < 180:
                                                dist = ((vis_x - text_center_x)**2 + (vis_y - text_center_y)**2)**0.5
                                                if dist < min_dist:
                                                    min_dist = dist
                                                    best_visual_match = visual
                                    
                                    if best_visual_match:
                                        print(f"Found visual element above text '{best_text_match.text}': clicking visual at {best_visual_match.coordinates}")
                                        return best_visual_match.coordinates
                            except Exception as ve:
                                print(f"Visual element search failed (using text target): {ve}")

                            print(f"Best match: '{elements[0].text}' at {elements[0].coordinates} (confidence: {elements[0].confidence})")
                            # Show all matches if multiple found
                            if len(elements) > 1:
                                print(f"Other matches:")
                                for i, elem in enumerate(elements[1:4], 2):  # Show top 3 additional matches
                                    print(f"  {i}. '{elem.text}' at {elem.coordinates} (confidence: {elem.confidence})")
                            return elements[0].coordinates
                        else:
                            print("No matches found, trying similarity search...")
                            # Try finding all text and pick the most similar one
                            all_elements = finder._extract_all_text(screenshot_path)
                            print(f"Total text elements found: {len(all_elements)}")
                            if all_elements:
                                # Find the most similar text using character similarity
                                best_match = finder._find_most_similar(all_elements, description)
                                if best_match:
                                    print(f"Best similarity match: '{best_match.text}' at {best_match.coordinates} (confidence: {best_match.confidence})")
                                    return best_match.coordinates
                                
                                print("Sample of detected text (sorted by position):")
                                # Sort by y-position to show elements top to bottom
                                sorted_elements = sorted(all_elements, key=lambda e: (e.coordinates[1], e.coordinates[0]))
                                for elem in sorted_elements[:15]:  # Show top 15
                                    print(f"  - '{elem.text}' at {elem.coordinates} (conf: {elem.confidence:.2f})")

                finally:
                    try:
                        os.unlink(screenshot_path)
                    except:
                        pass

            except ImportError as e:
                print(f"ImportError: {e}")
            except Exception as e:
                print(f"Exception in element finder: {e}")
                import traceback
                traceback.print_exc()

            position = self._find_text_on_screen(description)
            if position:
                print(f"Found with _find_text_on_screen: {position}")
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

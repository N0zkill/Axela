import time
import pyautogui
import keyboard
from typing import Dict, List, Optional, Union


class KeyboardController:
    def __init__(self):
        # Mapping of common key names to pyautogui key names
        self.key_mapping = {
            # Arrow keys
            'up': 'up', 'down': 'down', 'left': 'left', 'right': 'right',
            'arrow up': 'up', 'arrow down': 'down', 'arrow left': 'left', 'arrow right': 'right',

            # Function keys
            'f1': 'f1', 'f2': 'f2', 'f3': 'f3', 'f4': 'f4', 'f5': 'f5', 'f6': 'f6',
            'f7': 'f7', 'f8': 'f8', 'f9': 'f9', 'f10': 'f10', 'f11': 'f11', 'f12': 'f12',

            # Special keys
            'enter': 'enter', 'return': 'enter', 'space': 'space', 'spacebar': 'space',
            'tab': 'tab', 'escape': 'esc', 'esc': 'esc', 'delete': 'delete', 'del': 'delete',
            'backspace': 'backspace', 'home': 'home', 'end': 'end',
            'page up': 'pageup', 'pageup': 'pageup', 'page down': 'pagedown', 'pagedown': 'pagedown',
            'insert': 'insert', 'caps lock': 'capslock', 'capslock': 'capslock',
            'num lock': 'numlock', 'numlock': 'numlock', 'scroll lock': 'scrolllock',
            'print screen': 'printscreen', 'printscreen': 'printscreen',

            # Modifier keys
            'ctrl': 'ctrl', 'control': 'ctrl', 'alt': 'alt', 'shift': 'shift',
            'win': 'win', 'windows': 'win', 'cmd': 'cmd', 'command': 'cmd',

            # Number pad
            'num0': 'num0', 'num1': 'num1', 'num2': 'num2', 'num3': 'num3', 'num4': 'num4',
            'num5': 'num5', 'num6': 'num6', 'num7': 'num7', 'num8': 'num8', 'num9': 'num9',
            'num+': 'add', 'num-': 'subtract', 'num*': 'multiply', 'num/': 'divide',
            'num.': 'decimal', 'num enter': 'enter',
        }

        # Common key combinations
        self.common_combos = {
            'copy': ['ctrl', 'c'],
            'paste': ['ctrl', 'v'],
            'cut': ['ctrl', 'x'],
            'undo': ['ctrl', 'z'],
            'redo': ['ctrl', 'y'],
            'select all': ['ctrl', 'a'],
            'save': ['ctrl', 's'],
            'open': ['ctrl', 'o'],
            'new': ['ctrl', 'n'],
            'print': ['ctrl', 'p'],
            'find': ['ctrl', 'f'],
            'replace': ['ctrl', 'h'],
            'bold': ['ctrl', 'b'],
            'italic': ['ctrl', 'i'],
            'underline': ['ctrl', 'u'],
            'refresh': ['f5'],
            'alt tab': ['alt', 'tab'],
            'task manager': ['ctrl', 'shift', 'esc'],
            'close window': ['alt', 'f4'],
            'minimize': ['win', 'm'],
            'maximize': ['win', 'up'],
            'show desktop': ['win', 'd'],
            'lock screen': ['win', 'l'],
            'run dialog': ['win', 'r'],
            'screenshot': ['win', 'shift', 's'],
        }

        self.typing_speed = 0.05

    def type_text(self, text: str, interval: Optional[float] = None) -> bool:
        try:
            if interval is None:
                interval = self.typing_speed

            pyautogui.write(text, interval=interval)
            return True
        except Exception as e:
            pass
            return False

    def press_key(self, key: str) -> bool:
        try:
            key_name = self._normalize_key_name(key)
            if key_name:
                pyautogui.press(key_name)
                return True
            return False
        except Exception as e:
            pass
            return False

    def key_combination(self, combo: Union[str, List[str]]) -> bool:
        try:
            if isinstance(combo, str):
                combo_lower = combo.lower()
                if combo_lower in self.common_combos:
                    keys = self.common_combos[combo_lower]
                else:
                    keys = [key.strip() for key in combo.replace('+', ' ').split()]
            else:
                keys = combo

            normalized_keys = []
            for key in keys:
                normalized = self._normalize_key_name(key)
                if normalized:
                    normalized_keys.append(normalized)
                else:
                    print(f"Unknown key: {key}")
                    return False

            pyautogui.hotkey(*normalized_keys)
            return True

        except Exception as e:
            pass
            return False

    def hold_key(self, key: str, duration: float = 1.0) -> bool:
        try:
            key_name = self._normalize_key_name(key)
            if key_name:
                pyautogui.keyDown(key_name)
                time.sleep(duration)
                pyautogui.keyUp(key_name)
                return True
            return False
        except Exception as e:
            pass
            return False

    def key_down(self, key: str) -> bool:
        try:
            key_name = self._normalize_key_name(key)
            if key_name:
                pyautogui.keyDown(key_name)
                return True
            return False
        except Exception as e:
            pass
            return False

    def key_up(self, key: str) -> bool:
        try:
            key_name = self._normalize_key_name(key)
            if key_name:
                pyautogui.keyUp(key_name)
                return True
            return False
        except Exception as e:
            pass
            return False

    def type_with_formatting(self, text: str, formatting: Dict[str, any] = None) -> bool:
        try:
            if formatting:
                if formatting.get('bold'):
                    self.key_combination(['ctrl', 'b'])
                if formatting.get('italic'):
                    self.key_combination(['ctrl', 'i'])
                if formatting.get('underline'):
                    self.key_combination(['ctrl', 'u'])

            success = self.type_text(text)

            if formatting:
                if formatting.get('underline'):
                    self.key_combination(['ctrl', 'u'])
                if formatting.get('italic'):
                    self.key_combination(['ctrl', 'i'])
                if formatting.get('bold'):
                    self.key_combination(['ctrl', 'b'])

            return success

        except Exception as e:
            pass
            return False

    def clear_text(self, method: str = "select_all") -> bool:
        try:
            if method == "select_all":
                self.key_combination(['ctrl', 'a'])
                self.press_key('delete')
            elif method == "backspace":
                self.hold_key('backspace', 0.5)
            elif method == "delete":
                self.hold_key('delete', 0.5)
            else:
                return False

            return True
        except Exception as e:
            pass
            return False

    def navigate_text(self, direction: str, unit: str = "character") -> bool:
        try:
            keys = []

            if unit == "word":
                keys.append('ctrl')
            elif unit == "line":
                if direction in ["home", "end"]:
                    keys = []
                else:
                    return False
            elif unit == "document":
                keys.append('ctrl')
                direction = "home" if direction in ["up", "home"] else "end"

            if direction in ["left", "right", "up", "down"]:
                keys.append(direction)
            elif direction in ["home", "end"]:
                keys.append(direction)
            else:
                return False

            if len(keys) == 1:
                return self.press_key(keys[0])
            else:
                return self.key_combination(keys)

        except Exception as e:
            pass
            return False

    def select_text(self, direction: str, unit: str = "character", amount: int = 1) -> bool:
        try:
            for _ in range(amount):
                keys = ['shift']

                if unit == "word":
                    keys.append('ctrl')
                elif unit == "document":
                    keys.append('ctrl')
                    direction = "home" if direction in ["up", "home"] else "end"

                if direction in ["left", "right", "up", "down"]:
                    keys.append(direction)
                elif direction in ["home", "end"]:
                    keys.append(direction)
                else:
                    return False

                if not self.key_combination(keys):
                    return False

            return True
        except Exception as e:
            pass
            return False

    def _normalize_key_name(self, key: str) -> Optional[str]:
        key_lower = key.lower().strip()

        if key_lower in self.key_mapping:
            return self.key_mapping[key_lower]

        valid_keys = pyautogui.KEYBOARD_KEYS
        if key_lower in valid_keys:
            return key_lower

        if len(key) == 1:
            return key.lower()

        return None

    def register_hotkey(self, hotkey: str, callback) -> bool:
        try:
            keyboard.add_hotkey(hotkey, callback)
            return True
        except Exception as e:
            pass
            return False

    def unregister_hotkey(self, hotkey: str) -> bool:
        try:
            keyboard.remove_hotkey(hotkey)
            return True
        except Exception as e:
            pass
            return False

    def is_key_pressed(self, key: str) -> bool:
        try:
            key_name = self._normalize_key_name(key)
            if key_name:
                return keyboard.is_pressed(key_name)
            return False
        except Exception as e:
            pass
            return False

    def wait_for_key(self, key: str, timeout: Optional[float] = None) -> bool:
        try:
            key_name = self._normalize_key_name(key)
            if key_name:
                if timeout:
                    start_time = time.time()
                    while time.time() - start_time < timeout:
                        if keyboard.is_pressed(key_name):
                            return True
                        time.sleep(0.01)
                    return False
                else:
                    keyboard.wait(key_name)
                    return True
            return False
        except Exception as e:
            pass
            return False

    def get_typing_speed(self) -> float:
        return self.typing_speed

    def set_typing_speed(self, speed: float):
        self.typing_speed = max(0.0, speed)

    def get_common_combinations(self) -> Dict[str, List[str]]:
        return self.common_combos.copy()

    def simulate_human_typing(self, text: str, wpm: int = 60) -> bool:
        try:
            import random

            base_delay = 60.0 / (wpm * 5)

            for char in text:
                variation = random.uniform(0.8, 1.2)
                delay = base_delay * variation

                if char in '.,!?;:':
                    delay *= random.uniform(1.5, 2.5)
                elif char == ' ':
                    delay *= random.uniform(1.2, 1.8)

                pyautogui.write(char, interval=0)
                time.sleep(delay)

            return True
        except Exception as e:
            pass
            return False

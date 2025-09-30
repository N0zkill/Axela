import os
import sys
import subprocess
import webbrowser
import time
from typing import Dict, Any, Optional
from pathlib import Path

if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes
    import psutil

from core.parser import ParsedCommand, CommandType, ActionType
from core.logger import AxelaLogger
from commands.mouse import MouseController
from commands.keyboard import KeyboardController
from commands.screenshot import ScreenshotCapture


class ExecutionResult:
    def __init__(self, success: bool, message: str, data: Optional[Dict] = None):
        self.success = success
        self.message = message
        self.data = data or {}


class CommandExecutor:
    def __init__(self, logger: Optional[AxelaLogger] = None):
        self.logger = logger or AxelaLogger()
        self.mouse = MouseController()
        self.keyboard = KeyboardController()
        self.screenshot = ScreenshotCapture()
        self.execution_history = []

    def execute(self, command: ParsedCommand) -> ExecutionResult:
        try:
            self.logger.log_command(command)

            if command.command_type == CommandType.MOUSE:
                result = self._execute_mouse_command(command)
            elif command.command_type == CommandType.KEYBOARD:
                result = self._execute_keyboard_command(command)
            elif command.command_type == CommandType.SCREENSHOT:
                result = self._execute_screenshot_command(command)
            elif command.command_type == CommandType.SYSTEM:
                result = self._execute_system_command(command)
            elif command.command_type == CommandType.FILE:
                result = self._execute_file_command(command)
            elif command.command_type == CommandType.PROGRAM:
                result = self._execute_program_command(command)
            elif command.command_type == CommandType.WEB:
                result = self._execute_web_command(command)
            elif command.command_type == CommandType.UTILITY:
                result = self._execute_utility_command(command)
            else:
                result = ExecutionResult(False, f"Unknown command type: {command.command_type}")

            self.logger.log_result(result)
            self.execution_history.append((command, result))

            return result

        except Exception as e:
            error_msg = f"Error executing command: {str(e)}"
            self.logger.log_error(error_msg)
            return ExecutionResult(False, error_msg)

    def _execute_mouse_command(self, command: ParsedCommand) -> ExecutionResult:
        params = command.parameters

        try:
            if command.action == ActionType.CLICK:
                if "x" in params and "y" in params:
                    target = (int(params["x"]), int(params["y"]))
                    success = self.mouse.click(target)
                    return ExecutionResult(success, f"Clicked at ({params['x']}, {params['y']})" if success else "Click failed")
                else:
                    target = params.get("target", "")
                    success = self.mouse.click(target)
                    return ExecutionResult(success, f"Clicked on {target}" if success else "Click failed")

            elif command.action == ActionType.DOUBLE_CLICK:
                if "x" in params and "y" in params:
                    target = (int(params["x"]), int(params["y"]))
                    success = self.mouse.double_click(target)
                    return ExecutionResult(success, f"Double-clicked at ({params['x']}, {params['y']})" if success else "Double-click failed")
                else:
                    target = params.get("target", "")
                    success = self.mouse.double_click(target)
                    return ExecutionResult(success, f"Double-clicked on {target}" if success else "Double-click failed")

            elif command.action == ActionType.RIGHT_CLICK:
                if "x" in params and "y" in params:
                    target = (int(params["x"]), int(params["y"]))
                    success = self.mouse.right_click(target)
                    return ExecutionResult(success, f"Right-clicked at ({params['x']}, {params['y']})" if success else "Right-click failed")
                else:
                    target = params.get("target", "")
                    success = self.mouse.right_click(target)
                    return ExecutionResult(success, f"Right-clicked on {target}" if success else "Right-click failed")

            elif command.action == ActionType.DRAG:
                source = params.get("source", "")
                destination = params.get("destination", "")
                success = self.mouse.drag(source, destination)
                return ExecutionResult(success, f"Dragged from {source} to {destination}" if success else "Drag failed")

            elif command.action == ActionType.SCROLL:
                direction = params.get("direction", "down")
                success = self.mouse.scroll(direction)
                return ExecutionResult(success, f"Scrolled {direction}" if success else "Scroll failed")

            elif command.action == ActionType.MOVE:
                target = params.get("target", "")
                success = self.mouse.move_to(target)
                return ExecutionResult(success, f"Moved mouse to {target}" if success else "Move failed")

            else:
                return ExecutionResult(False, f"Unknown mouse action: {command.action}")

        except Exception as e:
            return ExecutionResult(False, f"Mouse command error: {str(e)}")

    def _execute_keyboard_command(self, command: ParsedCommand) -> ExecutionResult:
        params = command.parameters

        try:
            if command.action == ActionType.TYPE:
                text = params.get("text", "")
                success = self.keyboard.type_text(text)
                return ExecutionResult(success, f"Typed: {text}" if success else "Typing failed")

            elif command.action == ActionType.KEY_PRESS:
                key = params.get("key", "")
                success = self.keyboard.press_key(key)
                return ExecutionResult(success, f"Pressed key: {key}" if success else "Key press failed")

            elif command.action == ActionType.KEY_COMBO:
                combo = params.get("combo", "")
                success = self.keyboard.key_combination(combo)
                return ExecutionResult(success, f"Executed key combo: {combo}" if success else "Key combo failed")

            else:
                return ExecutionResult(False, f"Unknown keyboard action: {command.action}")

        except Exception as e:
            return ExecutionResult(False, f"Keyboard command error: {str(e)}")

    def _execute_screenshot_command(self, command: ParsedCommand) -> ExecutionResult:
        params = command.parameters

        try:
            if command.action == ActionType.CAPTURE:
                screenshot_path = self.screenshot.capture()
                return ExecutionResult(True, f"Screenshot saved to: {screenshot_path}",
                                     {"path": screenshot_path})

            elif command.action == ActionType.SAVE:
                filename = params.get("filename", "screenshot.png")
                screenshot_path = self.screenshot.capture(filename)
                return ExecutionResult(True, f"Screenshot saved as: {screenshot_path}",
                                     {"path": screenshot_path})

            else:
                return ExecutionResult(False, f"Unknown screenshot action: {command.action}")

        except Exception as e:
            return ExecutionResult(False, f"Screenshot command error: {str(e)}")

    def _execute_system_command(self, command: ParsedCommand) -> ExecutionResult:
        try:
            if command.action == ActionType.SHUTDOWN:
                self._system_shutdown()
                return ExecutionResult(True, "System shutdown initiated")

            elif command.action == ActionType.RESTART:
                self._system_restart()
                return ExecutionResult(True, "System restart initiated")

            elif command.action == ActionType.LOGOUT:
                self._system_logout()
                return ExecutionResult(True, "User logout initiated")

            elif command.action == ActionType.SLEEP:
                self._system_sleep()
                return ExecutionResult(True, "System sleep initiated")

            else:
                return ExecutionResult(False, f"Unknown system action: {command.action}")

        except Exception as e:
            return ExecutionResult(False, f"System command error: {str(e)}")

    def _execute_file_command(self, command: ParsedCommand) -> ExecutionResult:
        params = command.parameters

        try:
            if command.action == ActionType.OPEN:
                path = params.get("path", "")
                success = self._open_file(path)
                return ExecutionResult(success, f"Opened: {path}" if success else f"Failed to open: {path}")

            elif command.action == ActionType.CREATE:
                path = params.get("path", "")
                success = self._create_file(path)
                return ExecutionResult(success, f"Created: {path}" if success else f"Failed to create: {path}")

            elif command.action == ActionType.DELETE:
                path = params.get("path", "")
                success = self._delete_file(path)
                return ExecutionResult(success, f"Deleted: {path}" if success else f"Failed to delete: {path}")

            elif command.action == ActionType.COPY:
                source = params.get("source", "")
                destination = params.get("destination", "")
                success = self._copy_file(source, destination)
                return ExecutionResult(success, f"Copied {source} to {destination}" if success else "Copy failed")

            elif command.action == ActionType.MOVE_FILE:
                source = params.get("source", "")
                destination = params.get("destination", "")
                success = self._move_file(source, destination)
                return ExecutionResult(success, f"Moved {source} to {destination}" if success else "Move failed")

            elif command.action == ActionType.RENAME:
                source = params.get("source", "")
                destination = params.get("destination", "")
                success = self._rename_file(source, destination)
                return ExecutionResult(success, f"Renamed {source} to {destination}" if success else "Rename failed")

            else:
                return ExecutionResult(False, f"Unknown file action: {command.action}")

        except Exception as e:
            return ExecutionResult(False, f"File command error: {str(e)}")

    def _execute_program_command(self, command: ParsedCommand) -> ExecutionResult:
        params = command.parameters

        try:
            if command.action == ActionType.START:
                program = params.get("program", "")
                success = self._start_program(program)
                return ExecutionResult(success, f"Started: {program}" if success else f"Failed to start: {program}")

            elif command.action == ActionType.CLOSE:
                program = params.get("program", "")
                success = self._close_program(program)
                return ExecutionResult(success, f"Closed: {program}" if success else f"Failed to close: {program}")

            elif command.action in [ActionType.MINIMIZE, ActionType.MAXIMIZE]:
                program = params.get("program", "")
                action_name = "minimized" if command.action == ActionType.MINIMIZE else "maximized"
                success = self._window_action(program, command.action)
                return ExecutionResult(success, f"{action_name.title()}: {program}" if success else f"Failed to {action_name}: {program}")

            else:
                return ExecutionResult(False, f"Unknown program action: {command.action}")

        except Exception as e:
            return ExecutionResult(False, f"Program command error: {str(e)}")

    def _execute_web_command(self, command: ParsedCommand) -> ExecutionResult:
        params = command.parameters

        try:
            if command.action == ActionType.SEARCH:
                query = params.get("query", "")
                success = self._web_search(query)
                return ExecutionResult(success, f"Searched for: {query}" if success else "Search failed")

            elif command.action == ActionType.NAVIGATE:
                url = params.get("query", "")
                success = self._web_navigate(url)
                return ExecutionResult(success, f"Navigated to: {url}" if success else "Navigation failed")

            else:
                return ExecutionResult(False, f"Unknown web action: {command.action}")

        except Exception as e:
            return ExecutionResult(False, f"Web command error: {str(e)}")

    def _system_shutdown(self):
        if sys.platform == "win32":
            os.system("shutdown /s /t 1")
        else:
            os.system("sudo shutdown -h now")

    def _system_restart(self):
        if sys.platform == "win32":
            os.system("shutdown /r /t 1")
        else:
            os.system("sudo reboot")

    def _system_logout(self):
        if sys.platform == "win32":
            os.system("shutdown /l")
        else:
            os.system("pkill -KILL -u $USER")

    def _system_sleep(self):
        if sys.platform == "win32":
            os.system("rundll32.exe powrprof.dll,SetSuspendState 0,1,0")
        else:
            os.system("systemctl suspend")

    def _open_file(self, path: str) -> bool:
        try:
            if sys.platform == "win32":
                os.startfile(path)
            elif sys.platform == "darwin":
                subprocess.run(["open", path])
            else:
                subprocess.run(["xdg-open", path])
            return True
        except:
            return False

    def _create_file(self, path: str) -> bool:
        try:
            Path(path).touch()
            return True
        except:
            return False

    def _delete_file(self, path: str) -> bool:
        try:
            os.remove(path)
            return True
        except:
            return False

    def _copy_file(self, source: str, destination: str) -> bool:
        try:
            import shutil
            shutil.copy2(source, destination)
            return True
        except:
            return False

    def _move_file(self, source: str, destination: str) -> bool:
        try:
            import shutil
            shutil.move(source, destination)
            return True
        except:
            return False

    def _rename_file(self, source: str, destination: str) -> bool:
        try:
            os.rename(source, destination)
            return True
        except:
            return False

    def _start_program(self, program: str) -> bool:
        try:
            program_mappings = {
                'file explorer': 'explorer',
                'filemanager': 'explorer',
                'windows explorer': 'explorer',
                'file manager': 'explorer',
                'command prompt': 'cmd',
                'cmd prompt': 'cmd',
                'powershell': 'powershell',
                'power shell': 'powershell',
                'task manager': 'taskmgr',
                'taskmanager': 'taskmgr',
                'calculator': 'calc',
                'notepad': 'notepad',
                'paint': 'mspaint',
                'ms paint': 'mspaint',
                'control panel': 'control',
                'controlpanel': 'control',
                'registry editor': 'regedit',
                'regedit': 'regedit'
            }

            program_lower = program.lower().strip()
            actual_program = program_mappings.get(program_lower, program)

            if sys.platform == "win32":
                process = subprocess.Popen(actual_program, shell=True)

                time.sleep(0.2)

                self._focus_program_window(actual_program, process.pid)
            else:
                subprocess.Popen([actual_program])
            return True
        except Exception as e:
            if hasattr(self, 'logger') and self.logger:
                self.logger.log_error(f"Failed to start program '{program}': {e}")
            return False

    def _focus_program_window(self, program_name: str, process_id: int) -> bool:
        if sys.platform != "win32":
            return False

        try:
            SW_RESTORE = 9
            SW_SHOW = 5

            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32

            def enum_windows_proc(hwnd, lParam):
                try:
                    process_id_ptr = ctypes.pointer(wintypes.DWORD())
                    user32.GetWindowThreadProcessId(hwnd, process_id_ptr)
                    window_pid = process_id_ptr.contents.value

                    if window_pid == process_id:
                        if user32.IsWindowVisible(hwnd):
                            user32.ShowWindow(hwnd, SW_RESTORE)
                            user32.SetForegroundWindow(hwnd)
                            user32.SetActiveWindow(hwnd)
                            return False
                except:
                    pass
                return True

            EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
            enum_proc = EnumWindowsProc(enum_windows_proc)

            for attempt in range(10):
                user32.EnumWindows(enum_proc, 0)
                time.sleep(0.2)

                try:
                    for proc in psutil.process_iter(['pid', 'name']):
                        if proc.info['pid'] == process_id:
                            return True
                except:
                    pass

            return True

        except Exception as e:
            if hasattr(self, 'logger') and self.logger:
                self.logger.log_error(f"Failed to focus window for {program_name}: {e}")
            return False

    def _close_program(self, program: str) -> bool:
        try:
            if sys.platform == "win32":
                os.system(f"taskkill /f /im {program}.exe")
            else:
                os.system(f"pkill {program}")
            return True
        except:
            return False

    def _window_action(self, program: str, action: ActionType) -> bool:
        # TODO: Add window actions
        return True

    def _web_search(self, query: str) -> bool:
        try:
            search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
            webbrowser.open(search_url)
            return True
        except:
            return False

    def _web_navigate(self, url: str) -> bool:
        try:
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url
            webbrowser.open(url)
            return True
        except:
            return False

    def get_execution_history(self) -> list:
        return self.execution_history.copy()

    def clear_history(self):
        self.execution_history.clear()

    def _execute_utility_command(self, command: ParsedCommand) -> ExecutionResult:
        import time

        try:
            if command.action in [ActionType.WAIT, ActionType.DELAY]:
                duration = command.parameters.get("duration", 1.0)
                if isinstance(duration, str):
                    try:
                        duration = float(duration)
                    except ValueError:
                        duration = 1.0

                time.sleep(duration)
                return ExecutionResult(True, f"Waited for {duration} seconds")
            else:
                return ExecutionResult(False, f"Unknown utility action: {command.action}")

        except Exception as e:
            return ExecutionResult(False, f"Utility command error: {str(e)}")

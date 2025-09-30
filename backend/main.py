#!/usr/bin/env python3
import sys
import os
import argparse
from pathlib import Path
from typing import Optional

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

try:
    from core.parser import NaturalLanguageParser
    from core.executor import CommandExecutor
    from core.logger import AxelaLogger
    from core.ai_agent import AIAgent
    from util.config import Config
    from util.helpers import get_system_info
except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure you're running from the project root directory.")
    sys.exit(1)


class AxelaApp:
    def __init__(self, config_file: str = "config.json"):
        self.config = Config(config_file)
        self.logger = AxelaLogger()
        self.parser = NaturalLanguageParser()
        self.executor = CommandExecutor(self.logger)
        self.ai_agent = AIAgent(self.logger)

        self.running = False
        self.ai_mode = True

        self._initialize()

    def _initialize(self):
        self.logger.log_info("Initializing Axela")
        system_info = get_system_info()
        self.logger.log_info(f"System: {system_info['platform']}")

        perf_config = self.config.get_performance_config()
        if hasattr(self.executor, 'keyboard'):
            self.executor.keyboard.set_typing_speed(perf_config['keyboard_speed'])

        self.logger.log_info("Axela initialized")

    def process_command(self, text: str) -> bool:
        try:
            if self.ai_mode and self.ai_agent.is_available():
                success = self._process_ai_command(text)
                if success:
                    return True

            parsed_command = self.parser.parse(text)

            if not self.config.is_command_allowed(
                parsed_command.command_type.value,
                parsed_command.action.value
            ):
                print(f"Command not allowed: {text}")
                return False

            # Confirm dangerous commands
            if self.config.requires_confirmation(parsed_command.action.value):
                if not self._confirm_command(parsed_command):
                    print("Command cancelled")
                    return False

            # Execute command
            result = self.executor.execute(parsed_command)
            self.parser.add_context(parsed_command)

            return result.success

        except Exception as e:
            self.logger.log_error(f"Error processing command: {e}")
            return False

    def _confirm_command(self, parsed_command) -> bool:
        print(f"\nConfirm command: {parsed_command.raw_text}")
        print(f"Type: {parsed_command.command_type.value}")
        print(f"Action: {parsed_command.action.value}")
        response = input("Execute? (y/N): ").strip().lower()
        return response in ['y', 'yes']

    def _process_ai_command(self, text: str) -> bool:
        try:
            screenshot_path = None
            if self.ai_agent.needs_visual_context(text):
                screenshot_path = self._take_screenshot()
                if screenshot_path:
                    print("Taking screenshot...")

            if screenshot_path:
                ai_response = self.ai_agent.process_with_visual_context(text, screenshot_path)
            else:
                ai_response = self.ai_agent.process_request(text)

            if not ai_response.success:
                print(f"AI: {ai_response.explanation}")
                return False

            if ai_response.warnings:
                print("Warnings: " + "; ".join(ai_response.warnings))

            if ai_response.explanation:
                print(f"AI: {ai_response.explanation}")

            if ai_response.requires_confirmation:
                if not self._confirm_ai_commands(ai_response.commands):
                    print("AI commands cancelled")
                    return False

            total_success = True
            for i, parsed_command in enumerate(ai_response.commands, 1):
                command_desc = self.ai_agent.explain_command(parsed_command)
                print(f"Step {i}/{len(ai_response.commands)}: {command_desc}")

                if not self.config.is_command_allowed(
                    parsed_command.command_type.value,
                    parsed_command.action.value
                ):
                    print(f"Step {i} blocked by security policy")
                    total_success = False
                    break

                result = self.executor.execute(parsed_command)

                if not result.success:
                    print(f"Step {i}: failed")
                    total_success = False
                    break
                else:
                    print(f"Step {i} completed")

            return total_success

        except Exception as e:
            self.logger.log_error(f"AI command processing error: {e}")
            return False

    def _confirm_ai_commands(self, commands: list) -> bool:
        print(f"\nAI wants to execute {len(commands)} command(s):")
        for i, cmd in enumerate(commands, 1):
            command_desc = self.ai_agent.explain_command(cmd)
            print(f"  {i}. {command_desc}")

        response = input("\nExecute AI commands? (y/N): ").strip().lower()
        return response in ['y', 'yes']

    def _take_screenshot(self) -> Optional[str]:
        try:
            import datetime
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            screenshot_path = f"screenshots/context_{timestamp}.png"

            os.makedirs("screenshots", exist_ok=True)
            result_path = self.executor.screenshot.capture(screenshot_path)

            if result_path and os.path.exists(result_path):
                return result_path
            return None

        except Exception as e:
            self.logger.log_error(f"Screenshot error: {e}")
            return None

    def run_cli(self):
        print("Axela - AI Computer Control Agent")
        print("Type 'help' for commands, 'quit' to exit")

        # Show AI status
        if self.ai_agent.is_available():
            print("AI Mode: ENABLED")
        else:
            print("AI Mode: DISABLED (set OPENAI_API_KEY to enable)")

        print()
        self.running = True

        try:
            while self.running:
                try:
                    user_input = input("axela> ").strip()

                    if not user_input:
                        continue

                    # Handle special commands
                    if user_input.lower() in ['quit', 'exit', 'stop']:
                        print("Shutting down...")
                        break
                    elif user_input.lower() in ['emergency', 'abort']:
                        print("Emergency stop!")
                        break
                    elif user_input.lower() == 'help':
                        self._show_help()
                        continue
                    elif user_input.lower() == 'status':
                        self._show_status()
                        continue
                    elif user_input.lower() == 'toggle-ai':
                        self._toggle_ai_mode()
                        continue

                    success = self.process_command(user_input)

                    if success:
                        print("Command executed successfully")
                    else:
                        print("Command failed")

                except KeyboardInterrupt:
                    print("\nEmergency stop! Shutting down...")
                    break
                except EOFError:
                    print("\nShutting down...")
                    break
                except Exception as e:
                    print(f"Error: {e}")

        finally:
            self._cleanup()

    def _show_help(self):
        help_text = """
Commands:
- Mouse: click on [target], double click, right click, drag, scroll
- Keyboard: type "text", press enter, ctrl+c, etc.
- Screenshot: take screenshot, save screenshot as filename
- System: shutdown, restart, log out, sleep
- Files: open file, create file, delete file, copy file
- Programs: start program, close program
- Web: search for query, go to website

Special:
- help - Show this help
- status - Show system status
- toggle-ai - Enable/disable AI mode
- quit/exit - Exit
- emergency/abort - Emergency stop

Examples:
- "click on start button"
- "type hello world"
- "take a screenshot"
- "open notepad"
- "search for python tutorials"
        """
        print(help_text)

    def _show_status(self):
        """Show system status"""
        stats = self.logger.get_statistics()
        print(f"""
Status:
Commands Executed: {stats['commands_executed']}
Success Rate: {stats.get('success_rate', 0):.1f}%
AI Mode: {'ENABLED' if self.ai_mode else 'DISABLED'}
AI Available: {'YES' if self.ai_agent.is_available() else 'NO'}
        """)

    def _toggle_ai_mode(self):
        """Toggle AI mode"""
        self.ai_mode = not self.ai_mode

        if self.ai_mode:
            if self.ai_agent.is_available():
                print("AI Mode ENABLED")
            else:
                print("AI Mode enabled but not available (check OPENAI_API_KEY)")
        else:
            print("AI Mode DISABLED")

    def stop(self):
        self.running = False

    def _cleanup(self):
        try:
            self.logger.save_session_log()
            self.config.save()
            self.logger.close()
        except Exception as e:
            print(f"Cleanup error: {e}")


def main():
    parser = argparse.ArgumentParser(description="Axela - AI Computer Control Agent")

    parser.add_argument(
        "--config",
        default="config.json",
        help="Configuration file path"
    )

    parser.add_argument(
        "--version",
        action="version",
        version="Axela 1.0.0"
    )

    args = parser.parse_args()

    try:
        app = AxelaApp(config_file=args.config)
        app.run_cli()
    except KeyboardInterrupt:
        print("\nShutdown requested")
    except Exception as e:
        print(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
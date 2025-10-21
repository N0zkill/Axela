import asyncio
from typing import List, Dict, Any, Tuple
from dataclasses import dataclass
from .script_manager import Script, ScriptCommand, script_manager
from core.parser import NaturalLanguageParser
from core.executor import CommandExecutor
from core.logger import AxelaLogger
import time

@dataclass
class ScriptExecutionResult:
    script_id: str
    script_name: str
    success: bool
    total_commands: int
    executed_commands: int
    failed_commands: int
    results: List[Dict[str, Any]]
    error_message: str = ""
    execution_time: float = 0.0


class ScriptExecutor:
    def __init__(self, logger: AxelaLogger, command_executor: CommandExecutor):
        self.logger = logger
        self.executor = command_executor
        self.parser = NaturalLanguageParser()

    async def execute_script(self, script_id: str) -> ScriptExecutionResult:
        script = script_manager.get_script(script_id)
        if not script:
            return ScriptExecutionResult(
                script_id=script_id,
                script_name="Unknown",
                success=False,
                total_commands=0,
                executed_commands=0,
                failed_commands=0,
                results=[],
                error_message=f"Script not found: {script_id}"
            )

        return await self.execute_script_object(script)

    async def execute_script_object(self, script: Script) -> ScriptExecutionResult:
        start_time = time.time()

        self.logger.log_info(f"Executing script: {script.name} (ID: {script.id})")

        results = []
        executed_count = 0
        failed_count = 0
        total_success = True

        script_manager.increment_usage(script.id)

        for i, command in enumerate(script.commands):
            if not command.is_enabled:
                self.logger.log_info(f"Skipping disabled command: {command.text}")
                continue

            try:
                self.logger.log_info(f"Executing command {i+1}/{len(script.commands)}: {command.text}")

                # Scripts always execute hard-coded commands - NO AI
                success, message = await self._execute_hardcoded_command(command.text)

                result = {
                    "command_id": command.id,
                    "command_text": command.text,
                    "command_description": command.description,
                    "order": command.order,
                    "success": success,
                    "message": message,
                    "execution_time": time.time() - start_time
                }

                results.append(result)
                executed_count += 1

                if success:
                    self.logger.log_info(f"Command {i+1} executed successfully")
                else:
                    self.logger.log_error(f"Command {i+1} failed: {message}")
                    failed_count += 1
                    total_success = False

            except Exception as e:
                error_msg = f"Exception executing command: {str(e)}"
                self.logger.log_error(error_msg)

                result = {
                    "command_id": command.id,
                    "command_text": command.text,
                    "command_description": command.description,
                    "order": command.order,
                    "success": False,
                    "message": error_msg,
                    "execution_time": time.time() - start_time
                }

                results.append(result)
                executed_count += 1
                failed_count += 1
                total_success = False

        execution_time = time.time() - start_time

        if total_success:
            self.logger.log_info(f"Script '{script.name}' executed successfully in {execution_time:.2f}s")
        else:
            self.logger.log_warning(f"Script '{script.name}' completed with errors in {execution_time:.2f}s")

        return ScriptExecutionResult(
            script_id=script.id,
            script_name=script.name,
            success=total_success,
            total_commands=len(script.commands),
            executed_commands=executed_count,
            failed_commands=failed_count,
            results=results,
            execution_time=execution_time
        )

    async def _execute_hardcoded_command(self, command_text: str) -> Tuple[bool, str]:
        try:
            commands = self.parser.parse_sequence(command_text)

            if not commands:
                return False, "No valid commands found"

            messages = []
            total_success = True

            for parsed_command in commands:
                result = self.executor.execute(parsed_command)
                messages.append(result.message)
                if not result.success:
                    total_success = False
                    break

            return total_success, "\n".join(messages)

        except Exception as e:
            return False, f"Hardcoded execution error: {str(e)}"

    async def _execute_manual_command(self, command_text: str) -> Tuple[bool, str]:
        try:
            commands = self.parser.parse_sequence(command_text)

            if len(commands) == 1:
                parsed_command = commands[0]
                result = self.executor.execute(parsed_command)
                return result.success, result.message
            else:
                messages = []
                total_success = True

                for parsed_command in commands:
                    result = self.executor.execute(parsed_command)
                    messages.append(result.message)
                    if not result.success:
                        total_success = False
                        break

                return total_success, "\n".join(messages)

        except Exception as e:
            return False, f"Manual execution error: {str(e)}"

    def _take_screenshot(self) -> str:
        try:
            from commands.screenshot import ScreenshotCapture
            screenshot = ScreenshotCapture()
            return screenshot.capture()
        except Exception as e:
            self.logger.log_error(f"Failed to take screenshot: {e}")
            return None

    async def execute_script_commands(self, script_id: str, command_ids: List[str],
                                    mode: str = "ai") -> ScriptExecutionResult:
        script = script_manager.get_script(script_id)
        if not script:
            return ScriptExecutionResult(
                script_id=script_id,
                script_name="Unknown",
                success=False,
                total_commands=0,
                executed_commands=0,
                failed_commands=0,
                results=[],
                error_message=f"Script not found: {script_id}"
            )

        commands_to_execute = [cmd for cmd in script.commands if cmd.id in command_ids]

        if not commands_to_execute:
            return ScriptExecutionResult(
                script_id=script.id,
                script_name=script.name,
                success=False,
                total_commands=len(command_ids),
                executed_commands=0,
                failed_commands=0,
                results=[],
                error_message="No matching commands found"
            )

        temp_script = Script(
            id=f"temp_{script.id}",
            name=f"{script.name} (Selected Commands)",
            prompt=script.prompt,
            commands=commands_to_execute
        )

        return await self.execute_script_object(temp_script, mode)

    def validate_script(self, script: Script) -> List[str]:
        issues = []

        if not script.name.strip():
            issues.append("Script name cannot be empty")

        if not script.prompt.strip():
            issues.append("Script prompt cannot be empty")

        if not script.commands:
            issues.append("Script must have at least one command")

        for i, command in enumerate(script.commands):
            if not command.text.strip():
                issues.append(f"Command {i+1} text cannot be empty")

        return issues

import asyncio
import time
from datetime import datetime
from typing import Optional
from .script_manager import script_manager
from .script_executor import ScriptExecutor
from core.logger import AxelaLogger
from core.executor import CommandExecutor


class ScriptScheduler:
    def __init__(self):
        self.logger = AxelaLogger()
        self.command_executor = CommandExecutor()
        self.executor = ScriptExecutor(self.logger, self.command_executor)
        self.is_running = False
        self.check_interval = 5
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        if self.is_running:
            return

        self.is_running = True
        self.logger.log_info("Script scheduler started")

        # Start the background task
        self._task = asyncio.create_task(self._scheduler_loop())

    async def stop(self):
        if not self.is_running:
            return

        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        self.logger.log_info("Script scheduler stopped")

    async def _scheduler_loop(self):
        while self.is_running:
            try:
                await self._check_and_execute_due_scripts()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.log_error(f"Scheduler error: {e}")
                await asyncio.sleep(self.check_interval)

    async def _check_and_execute_due_scripts(self):
        try:
            due_scripts = script_manager.get_scripts_due_for_execution()

            if due_scripts:
                self.logger.log_info(f"Found {len(due_scripts)} scripts due for execution")

                for script in due_scripts:
                    try:
                        self.logger.log_info(f"Auto-executing recurring script: {script.name}")

                        result = await self.executor.execute_script_object(script)

                        if result.success:
                            script.mark_executed()
                            script_manager._save_scripts()

                            self.logger.log_info(
                                f"Recurring script '{script.name}' executed successfully. "
                                f"Next execution: {script.next_execution}"
                            )
                        else:
                            self.logger.log_error(f"Failed to execute recurring script '{script.name}': {result.message}")

                    except Exception as e:
                        self.logger.log_error(f"Error executing recurring script '{script.name}': {e}")

        except Exception as e:
            self.logger.log_error(f"Error checking due scripts: {e}")

    def get_status(self) -> dict:
        return {
            "is_running": self.is_running,
            "check_interval": self.check_interval,
            "recurring_scripts_count": len(script_manager.get_recurring_scripts()),
            "due_scripts_count": len(script_manager.get_scripts_due_for_execution())
        }


scheduler = ScriptScheduler()

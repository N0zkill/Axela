"""
Logging System for Axela
Provides comprehensive logging and feedback functionality.
"""

import logging
import os
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

from .parser import ParsedCommand


class AxelaLogger:
    def __init__(self, log_dir: str = "logs", log_level: int = logging.INFO):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(exist_ok=True)

        self.logger = logging.getLogger("axela")
        self.logger.setLevel(log_level)

        log_file = self.log_dir / f"axela_{datetime.now().strftime('%Y%m%d')}.log"
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(log_level)

        console_handler = logging.StreamHandler()
        console_handler.setLevel(log_level)

        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        console_formatter = logging.Formatter(
            '%(levelname)s: %(message)s'
        )

        file_handler.setFormatter(file_formatter)
        console_handler.setFormatter(console_formatter)

        if not self.logger.handlers:
            self.logger.addHandler(file_handler)
            self.logger.addHandler(console_handler)

        self.command_history = []
        self.session_start = datetime.now()

        self.stats = {
            "commands_executed": 0,
            "successful_commands": 0,
            "failed_commands": 0,
            "command_types": {},
            "session_start": self.session_start.isoformat()
        }

        self.logger.info("Axela logger initialized")

    def log_command(self, command: ParsedCommand):
        self.logger.info(f"Executing command: {command.raw_text}")
        self.logger.debug(f"Command details - Type: {command.command_type}, "
                         f"Action: {command.action}, Confidence: {command.confidence:.2f}")

        command_entry = {
            "timestamp": datetime.now().isoformat(),
            "raw_text": command.raw_text,
            "command_type": command.command_type.value,
            "action": command.action.value,
            "parameters": command.parameters,
            "confidence": command.confidence
        }
        self.command_history.append(command_entry)

        self.stats["commands_executed"] += 1
        cmd_type = command.command_type.value
        self.stats["command_types"][cmd_type] = self.stats["command_types"].get(cmd_type, 0) + 1

    def log_result(self, result):
        if result.success:
            self.logger.info(f"Command executed successfully: {result.message}")
            self.stats["successful_commands"] += 1
        else:
            self.logger.error(f"Command failed: {result.message}")
            self.stats["failed_commands"] += 1

        if self.command_history:
            self.command_history[-1]["result"] = {
                "success": result.success,
                "message": result.message,
                "data": result.data
            }

    def log_error(self, message: str, exception: Optional[Exception] = None):
        if exception:
            self.logger.error(f"{message}: {str(exception)}", exc_info=True)
        else:
            self.logger.error(message)

    def log_warning(self, message: str):
        self.logger.warning(message)

    def log_info(self, message: str):
        self.logger.info(message)

    def log_debug(self, message: str):
        self.logger.debug(message)

    def log_voice_input(self, text: str, confidence: float):
        self.logger.info(f"Voice input recognized: '{text}' (confidence: {confidence:.2f})")

    def log_voice_output(self, text: str):
        self.logger.info(f"Voice output: '{text}'")

    def log_system_event(self, event_type: str, details: Dict[str, Any]):
        self.logger.info(f"System event - {event_type}: {details}")

    def save_session_log(self, filename: Optional[str] = None):
        if not filename:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"session_{timestamp}.json"

        session_data = {
            "session_info": {
                "start_time": self.session_start.isoformat(),
                "end_time": datetime.now().isoformat(),
                "duration_minutes": (datetime.now() - self.session_start).total_seconds() / 60
            },
            "statistics": self.stats,
            "command_history": self.command_history
        }

        session_file = self.log_dir / filename
        try:
            with open(session_file, 'w', encoding='utf-8') as f:
                json.dump(session_data, f, indent=2, ensure_ascii=False)
            self.logger.info(f"Session log saved to: {session_file}")
            return str(session_file)
        except Exception as e:
            self.logger.error(f"Failed to save session log: {e}")
            return None

    def load_session_log(self, filename: str) -> Optional[Dict]:
        session_file = self.log_dir / filename
        try:
            with open(session_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            self.logger.error(f"Failed to load session log {filename}: {e}")
            return None

    def get_command_history(self, limit: Optional[int] = None) -> List[Dict]:
        if limit:
            return self.command_history[-limit:]
        return self.command_history.copy()

    def get_statistics(self) -> Dict[str, Any]:
        current_stats = self.stats.copy()
        current_stats["session_duration_minutes"] = (
            datetime.now() - self.session_start
        ).total_seconds() / 60

        total_commands = current_stats["commands_executed"]
        if total_commands > 0:
            current_stats["success_rate"] = (
                current_stats["successful_commands"] / total_commands
            ) * 100
        else:
            current_stats["success_rate"] = 0

        return current_stats

    def get_recent_commands(self, count: int = 5) -> List[str]:
        recent = self.command_history[-count:] if count <= len(self.command_history) else self.command_history
        return [cmd["raw_text"] for cmd in recent]

    def search_command_history(self, query: str) -> List[Dict]:
        results = []
        query_lower = query.lower()

        for cmd in self.command_history:
            if (query_lower in cmd["raw_text"].lower() or
                query_lower in cmd["command_type"].lower() or
                query_lower in cmd["action"].lower()):
                results.append(cmd)

        return results

    def export_logs(self, start_date: Optional[str] = None, end_date: Optional[str] = None) -> str:
        return self.save_session_log()

    def clear_logs(self, older_than_days: int = 30):
        cutoff_date = datetime.now().timestamp() - (older_than_days * 24 * 60 * 60)

        for log_file in self.log_dir.glob("*.log"):
            if log_file.stat().st_mtime < cutoff_date:
                try:
                    log_file.unlink()
                    self.logger.info(f"Deleted old log file: {log_file}")
                except Exception as e:
                    self.logger.error(f"Failed to delete log file {log_file}: {e}")

        for json_file in self.log_dir.glob("session_*.json"):
            if json_file.stat().st_mtime < cutoff_date:
                try:
                    json_file.unlink()
                    self.logger.info(f"Deleted old session file: {json_file}")
                except Exception as e:
                    self.logger.error(f"Failed to delete session file {json_file}: {e}")

    def set_log_level(self, level: int):
        self.logger.setLevel(level)
        for handler in self.logger.handlers:
            handler.setLevel(level)
        self.logger.info(f"Log level changed to: {logging.getLevelName(level)}")

    def add_custom_handler(self, handler: logging.Handler):
        self.logger.addHandler(handler)

    def close(self):
        self.logger.info("Closing Axela logger")
        final_stats = self.get_statistics()
        self.logger.info(f"Session summary: {final_stats}")

        self.save_session_log()

        for handler in self.logger.handlers:
            handler.close()

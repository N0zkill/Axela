import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pathlib import Path
from dataclasses import dataclass, asdict
from enum import Enum


class ScriptCategory(Enum):
    GENERAL = "General"
    AUTOMATION = "Automation"
    PRODUCTIVITY = "Productivity"
    SYSTEM = "System"
    WEB = "Web"
    FILE_MANAGEMENT = "File Management"

@dataclass
class ScriptCommand:
    id: str
    text: str
    description: str = ""
    order: int = 0
    is_enabled: bool = True

@dataclass
class Script:
    id: str
    name: str
    prompt: str
    description: str = ""
    commands: List[ScriptCommand] = None
    category: ScriptCategory = ScriptCategory.GENERAL
    is_active: bool = True
    is_favorite: bool = False
    is_recurring: bool = False
    recurring_interval: Optional[str] = None
    recurring_enabled: bool = False
    created_date: str = ""
    updated_date: str = ""
    usage_count: int = 0
    last_executed: Optional[str] = None
    next_execution: Optional[str] = None

    def __post_init__(self):
        if self.commands is None:
            self.commands = []
        if not self.created_date:
            self.created_date = datetime.now().isoformat()
        if not self.updated_date:
            self.updated_date = self.created_date

    def add_command(self, command: ScriptCommand):
        command.order = len(self.commands)
        self.commands.append(command)
        self.updated_date = datetime.now().isoformat()

    def remove_command(self, command_id: str):
        self.commands = [cmd for cmd in self.commands if cmd.id != command_id]
        for i, cmd in enumerate(self.commands):
            cmd.order = i
        self.updated_date = datetime.now().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data['category'] = self.category.value
        data['commands'] = [asdict(cmd) for cmd in self.commands]
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Script':
        if isinstance(data.get('category'), str):
            data['category'] = ScriptCategory(data['category'])

        commands_data = data.get('commands', [])
        commands = [ScriptCommand(**cmd_data) for cmd_data in commands_data]
        data['commands'] = commands

        return cls(**data)

    def calculate_next_execution(self) -> Optional[str]:
        if not self.is_recurring or not self.recurring_enabled or not self.recurring_interval:
            return None

        now = datetime.now()

        interval = self.recurring_interval.lower()

        if interval == "daily":
            next_time = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        elif interval == "hourly":
            next_time = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        elif interval.endswith("s"):
            seconds = int(interval[:-1])
            next_time = now + timedelta(seconds=seconds)
        elif interval.endswith("m"):
            minutes = int(interval[:-1])
            next_time = now + timedelta(minutes=minutes)
        elif interval.endswith("h"):
            hours = int(interval[:-1])
            next_time = now + timedelta(hours=hours)
        elif interval.endswith("d"):
            days = int(interval[:-1])
            next_time = now + timedelta(days=days)
        else:
            return None

        return next_time.isoformat()

    def should_execute_now(self) -> bool:
        if not self.is_recurring or not self.recurring_enabled or not self.next_execution:
            return False

        try:
            next_exec = datetime.fromisoformat(self.next_execution)
            return datetime.now() >= next_exec
        except (ValueError, TypeError):
            return False

    def mark_executed(self):
        self.last_executed = datetime.now().isoformat()
        self.next_execution = self.calculate_next_execution()


class ScriptManager:
    def __init__(self, storage_dir: str = "scripts"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)
        self.scripts_file = self.storage_dir / "scripts.json"
        self.scripts: Dict[str, Script] = {}
        self._load_scripts()

    def _load_scripts(self):
        if self.scripts_file.exists():
            try:
                with open(self.scripts_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for script_data in data.get('scripts', []):
                        script = Script.from_dict(script_data)
                        self.scripts[script.id] = script
            except Exception as e:
                print(f"Error loading scripts: {e}")
                self.scripts = {}

    def _save_scripts(self):
        try:
            data = {
                'scripts': [script.to_dict() for script in self.scripts.values()],
                'last_updated': datetime.now().isoformat()
            }
            with open(self.scripts_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"Error saving scripts: {e}")
            return False

    def create_script(self, name: str, prompt: str, description: str = "",
                     category: ScriptCategory = ScriptCategory.GENERAL,
                     is_recurring: bool = False,
                     recurring_interval: str = None,
                     recurring_enabled: bool = False) -> Script:
        script_id = f"script_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{len(self.scripts)}"

        script = Script(
            id=script_id,
            name=name,
            prompt=prompt,
            description=description,
            category=category,
            is_recurring=is_recurring,
            recurring_interval=recurring_interval,
            recurring_enabled=recurring_enabled
        )

        if is_recurring and recurring_interval and recurring_enabled:
            script.next_execution = script.calculate_next_execution()

        self.scripts[script_id] = script
        self._save_scripts()
        return script

    def get_script(self, script_id: str) -> Optional[Script]:
        return self.scripts.get(script_id)

    def list_scripts(self, sort_by: str = "-created_date") -> List[Script]:
        scripts = list(self.scripts.values())

        if sort_by.startswith('-'):
            reverse = True
            sort_key = sort_by[1:]
        else:
            reverse = False
            sort_key = sort_by

        if sort_key == "created_date":
            scripts.sort(key=lambda s: s.created_date, reverse=reverse)
        elif sort_key == "updated_date":
            scripts.sort(key=lambda s: s.updated_date, reverse=reverse)
        elif sort_key == "name":
            scripts.sort(key=lambda s: s.name.lower(), reverse=reverse)
        elif sort_key == "usage_count":
            scripts.sort(key=lambda s: s.usage_count, reverse=reverse)
        else:
            scripts.sort(key=lambda s: s.created_date, reverse=True)

        return scripts

    def update_script(self, script_id: str, **kwargs) -> Optional[Script]:
        script = self.scripts.get(script_id)
        if not script:
            return None

        for key, value in kwargs.items():
            if hasattr(script, key):
                setattr(script, key, value)

        script.updated_date = datetime.now().isoformat()
        self._save_scripts()
        return script

    def delete_script(self, script_id: str) -> bool:
        if script_id in self.scripts:
            del self.scripts[script_id]
            self._save_scripts()
            return True
        return False

    def increment_usage(self, script_id: str):
        script = self.scripts.get(script_id)
        if script:
            script.usage_count += 1
            script.last_executed = datetime.now().isoformat()
            script.updated_date = datetime.now().isoformat()
            self._save_scripts()

    def add_command_to_script(self, script_id: str, command_text: str,
                             description: str = "") -> bool:
        script = self.scripts.get(script_id)
        if not script:
            return False

        command_id = f"cmd_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        command = ScriptCommand(
            id=command_id,
            text=command_text,
            description=description,
            order=len(script.commands)
        )
        script.add_command(command)
        self._save_scripts()
        return True

    def remove_command_from_script(self, script_id: str, command_id: str) -> bool:
        script = self.scripts.get(script_id)
        if not script:
            return False

        script.remove_command(command_id)
        self._save_scripts()
        return True

    def get_scripts_by_category(self, category: ScriptCategory) -> List[Script]:
        return [script for script in self.scripts.values()
                if script.category == category]

    def get_recurring_scripts(self) -> List[Script]:
        return [script for script in self.scripts.values()
                if script.is_recurring and script.recurring_enabled]

    def get_scripts_due_for_execution(self) -> List[Script]:
        due_scripts = []
        for script in self.get_recurring_scripts():
            if script.should_execute_now():
                due_scripts.append(script)
        return due_scripts

    def enable_recurring(self, script_id: str, interval: str) -> bool:
        script = self.scripts.get(script_id)
        if not script:
            return False

        script.is_recurring = True
        script.recurring_enabled = True
        script.recurring_interval = interval
        script.next_execution = script.calculate_next_execution()
        script.updated_date = datetime.now().isoformat()
        self._save_scripts()
        return True

    def disable_recurring(self, script_id: str) -> bool:
        script = self.scripts.get(script_id)
        if not script:
            return False

        script.recurring_enabled = False
        script.next_execution = None
        script.updated_date = datetime.now().isoformat()
        self._save_scripts()
        return True

    def search_scripts(self, query: str) -> List[Script]:
        query_lower = query.lower()
        results = []

        for script in self.scripts.values():
            if (query_lower in script.name.lower() or
                query_lower in script.prompt.lower() or
                query_lower in script.description.lower()):
                results.append(script)

        return results


script_manager = ScriptManager()

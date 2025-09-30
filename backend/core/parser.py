"""
Natural Language Parser for Axela
Converts human language commands into structured data for execution.
"""

import re
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class CommandType(Enum):
    """Supported command categories"""
    MOUSE = "mouse"
    KEYBOARD = "keyboard"
    SCREENSHOT = "screenshot"
    SYSTEM = "system"
    FILE = "file"
    PROGRAM = "program"
    WEB = "web"
    UTILITY = "utility"
    UNKNOWN = "unknown"


class ActionType(Enum):
    # Mouse actions
    CLICK = "click"
    DOUBLE_CLICK = "double_click"
    RIGHT_CLICK = "right_click"
    DRAG = "drag"
    SCROLL = "scroll"
    MOVE = "move"

    # Keyboard actions
    TYPE = "type"
    KEY_PRESS = "key_press"
    KEY_COMBO = "key_combo"

    # Screenshot actions
    CAPTURE = "capture"
    SAVE = "save"

    # System actions
    SHUTDOWN = "shutdown"
    RESTART = "restart"
    LOGOUT = "logout"
    SLEEP = "sleep"

    # File actions
    OPEN = "open"
    CREATE = "create"
    DELETE = "delete"
    COPY = "copy"
    MOVE_FILE = "move_file"
    RENAME = "rename"

    # Program actions
    START = "start"
    CLOSE = "close"
    MINIMIZE = "minimize"
    MAXIMIZE = "maximize"

    # Web actions
    SEARCH = "search"
    NAVIGATE = "navigate"

    # Utility actions
    WAIT = "wait"
    DELAY = "delay"


@dataclass
class ParsedCommand:
    command_type: CommandType
    action: ActionType
    parameters: Dict[str, any]
    confidence: float
    raw_text: str


class NaturalLanguageParser:
    def __init__(self):
        self.command_patterns = self._initialize_patterns()
        self.context_history = []

    def _initialize_patterns(self) -> Dict[str, List[Tuple[str, CommandType, ActionType]]]:
        return {
            # Mouse patterns
            "mouse": [
                (r"click\s+(?:on\s+)?(.+)", CommandType.MOUSE, ActionType.CLICK),
                (r"double\s*click\s+(?:on\s+)?(.+)", CommandType.MOUSE, ActionType.DOUBLE_CLICK),
                (r"right\s*click\s+(?:on\s+)?(.+)", CommandType.MOUSE, ActionType.RIGHT_CLICK),
                (r"drag\s+(.+?)\s+to\s+(.+)", CommandType.MOUSE, ActionType.DRAG),
                (r"scroll\s+(up|down|left|right)", CommandType.MOUSE, ActionType.SCROLL),
                (r"move\s+(?:mouse\s+)?to\s+(.+)", CommandType.MOUSE, ActionType.MOVE),
            ],

            # Keyboard patterns
            "keyboard": [
                (r"type\s+[\"'](.+?)[\"']", CommandType.KEYBOARD, ActionType.TYPE),
                (r"type\s+(.+)", CommandType.KEYBOARD, ActionType.TYPE),
                (r"press\s+(.+)", CommandType.KEYBOARD, ActionType.KEY_PRESS),
                (r"(?:ctrl|cmd)\s*\+\s*(.+)", CommandType.KEYBOARD, ActionType.KEY_COMBO),
                (r"alt\s*\+\s*(.+)", CommandType.KEYBOARD, ActionType.KEY_COMBO),
                (r"shift\s*\+\s*(.+)", CommandType.KEYBOARD, ActionType.KEY_COMBO),
            ],

            # Screenshot patterns
            "screenshot": [
                (r"(?:take\s+)?(?:a\s+)?screenshot", CommandType.SCREENSHOT, ActionType.CAPTURE),
                (r"capture\s+(?:the\s+)?screen", CommandType.SCREENSHOT, ActionType.CAPTURE),
                (r"save\s+screenshot\s+(?:as\s+)?(.+)", CommandType.SCREENSHOT, ActionType.SAVE),
            ],

            # System patterns
            "system": [
                (r"shutdown|shut\s+down", CommandType.SYSTEM, ActionType.SHUTDOWN),
                (r"restart|reboot", CommandType.SYSTEM, ActionType.RESTART),
                (r"log\s*(?:out|off)", CommandType.SYSTEM, ActionType.LOGOUT),
                (r"sleep|suspend", CommandType.SYSTEM, ActionType.SLEEP),
            ],

            # File patterns
            "file": [
                (r"open\s+(?:file\s+)?(.+)", CommandType.FILE, ActionType.OPEN),
                (r"create\s+(?:file\s+)?(.+)", CommandType.FILE, ActionType.CREATE),
                (r"delete\s+(?:file\s+)?(.+)", CommandType.FILE, ActionType.DELETE),
                (r"copy\s+(.+?)\s+to\s+(.+)", CommandType.FILE, ActionType.COPY),
                (r"move\s+(.+?)\s+to\s+(.+)", CommandType.FILE, ActionType.MOVE_FILE),
                (r"rename\s+(.+?)\s+to\s+(.+)", CommandType.FILE, ActionType.RENAME),
            ],

            # Program patterns
            "program": [
                (r"(?:start|launch|run|open)\s+(.+)", CommandType.PROGRAM, ActionType.START),
                (r"close\s+(.+)", CommandType.PROGRAM, ActionType.CLOSE),
                (r"minimize\s+(.+)", CommandType.PROGRAM, ActionType.MINIMIZE),
                (r"maximize\s+(.+)", CommandType.PROGRAM, ActionType.MAXIMIZE),
            ],

            # Web patterns
            "web": [
                (r"search\s+(?:for\s+)?(.+)", CommandType.WEB, ActionType.SEARCH),
                (r"go\s+to\s+(.+)", CommandType.WEB, ActionType.NAVIGATE),
                (r"navigate\s+to\s+(.+)", CommandType.WEB, ActionType.NAVIGATE),
            ],

            # Utility patterns
            "utility": [
                (r"wait\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)?", CommandType.UTILITY, ActionType.WAIT),
                (r"delay\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)?", CommandType.UTILITY, ActionType.DELAY),
                (r"pause\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)?", CommandType.UTILITY, ActionType.WAIT),
                (r"sleep\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)?", CommandType.UTILITY, ActionType.WAIT),
            ],
        }

    def parse(self, text: str) -> ParsedCommand:
        text = text.lower().strip()

        for category, patterns in self.command_patterns.items():
            for pattern, cmd_type, action_type in patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    parameters = self._extract_parameters(match, action_type)
                    confidence = self._calculate_confidence(text, pattern)

                    return ParsedCommand(
                        command_type=cmd_type,
                        action=action_type,
                        parameters=parameters,
                        confidence=confidence,
                        raw_text=text
                    )

        return ParsedCommand(
            command_type=CommandType.UNKNOWN,
            action=ActionType.CLICK,
            parameters={"text": text},
            confidence=0.0,
            raw_text=text
        )

    def _extract_parameters(self, match: re.Match, action_type: ActionType) -> Dict[str, any]:
        params = {}
        groups = match.groups()

        if action_type in [ActionType.CLICK, ActionType.DOUBLE_CLICK, ActionType.RIGHT_CLICK]:
            params["target"] = groups[0] if groups else ""

        elif action_type == ActionType.DRAG:
            params["source"] = groups[0] if len(groups) > 0 else ""
            params["destination"] = groups[1] if len(groups) > 1 else ""

        elif action_type == ActionType.SCROLL:
            params["direction"] = groups[0] if groups else "down"

        elif action_type == ActionType.MOVE:
            params["target"] = groups[0] if groups else ""

        elif action_type == ActionType.TYPE:
            params["text"] = groups[0] if groups else ""

        elif action_type == ActionType.KEY_PRESS:
            params["key"] = groups[0] if groups else ""

        elif action_type == ActionType.KEY_COMBO:
            full_match = match.group(0)
            params["combo"] = full_match

        elif action_type == ActionType.SAVE:
            params["filename"] = groups[0] if groups else "screenshot.png"

        elif action_type in [ActionType.OPEN, ActionType.CREATE, ActionType.DELETE]:
            params["path"] = groups[0] if groups else ""

        elif action_type in [ActionType.COPY, ActionType.MOVE_FILE, ActionType.RENAME]:
            params["source"] = groups[0] if len(groups) > 0 else ""
            params["destination"] = groups[1] if len(groups) > 1 else ""

        elif action_type in [ActionType.START, ActionType.CLOSE, ActionType.MINIMIZE, ActionType.MAXIMIZE]:
            params["program"] = groups[0] if groups else ""

        elif action_type in [ActionType.SEARCH, ActionType.NAVIGATE]:
            params["query"] = groups[0] if groups else ""

        elif action_type in [ActionType.WAIT, ActionType.DELAY]:
            duration_str = groups[0] if groups else "1"
            try:
                params["duration"] = float(duration_str)
            except ValueError:
                params["duration"] = 1.0

        return params

    def _calculate_confidence(self, text: str, pattern: str) -> float:
        base_confidence = 0.8

        text_words = len(text.split())
        pattern_complexity = len(pattern) / 100.0

        confidence = base_confidence + min(pattern_complexity, 0.2)
        confidence = min(confidence, 1.0)

        return confidence

    def add_context(self, command: ParsedCommand):
        self.context_history.append(command)
        if len(self.context_history) > 5:
            self.context_history.pop(0)

    def get_suggestions(self, partial_text: str) -> List[str]:
        suggestions = []
        text = partial_text.lower()

        starters = [
            "click on", "type", "open", "close", "screenshot",
            "search for", "go to", "press", "drag", "scroll",
            "shutdown", "restart", "copy", "delete", "move"
        ]

        for starter in starters:
            if starter.startswith(text) and starter != text:
                suggestions.append(starter)

        return suggestions[:5]

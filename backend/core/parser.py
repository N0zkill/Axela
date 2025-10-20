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

    def parse_sequence(self, text: str) -> List[ParsedCommand]:
        """Parse potentially chained commands separated by commas/then/and.

        Example: "search for dog, click images, click the first image"
        returns a list of ParsedCommand objects in order.
        """
        if not text or not isinstance(text, str):
            return [self.parse("")]

        # Normalize whitespace
        cleaned = re.sub(r"\s+", " ", text).strip()

        # Split on common chain separators while avoiding splitting inside quotes
        # Simple heuristic: split on comma or the words 'and then', 'then', 'and'
        # We keep order and drop empty segments
        parts: List[str] = []
        last = 0
        in_single = False
        in_double = False
        i = 0
        while i < len(cleaned):
            ch = cleaned[i]
            if ch == "'" and not in_double:
                in_single = not in_single
            elif ch == '"' and not in_single:
                in_double = not in_double

            if not in_single and not in_double:
                # Comma separator
                if ch == ',':
                    segment = cleaned[last:i].strip()
                    if segment:
                        parts.append(segment)
                    last = i + 1
                else:
                    # Word separators: ' and then ', ' then ', ' and '
                    # Check only at word boundaries
                    matched_sep = None
                    for sep in [" and then ", " then ", " and "]:
                        if cleaned.startswith(sep, i):
                            matched_sep = sep
                            break
                    if matched_sep:
                        segment = cleaned[last:i].strip()
                        if segment:
                            parts.append(segment)
                        i += len(matched_sep) - 1
                        last = i + 1
            i += 1

        # Append the final segment
        tail = cleaned[last:].strip()
        if tail:
            parts.append(tail)

        # Fallback to single parse if no separators found
        if len(parts) <= 1:
            return [self.parse(cleaned)]

        commands: List[ParsedCommand] = []
        for segment in parts:
            # Try normal parse first
            cmd = self.parse(segment)
            if cmd.command_type == CommandType.UNKNOWN:
                # Try to expand into a compound plan (e.g., calculator steps)
                expanded = self._expand_compound(segment)
                if expanded:
                    commands.extend(expanded)
                    continue
            # Ensure raw_text reflects the segment
            cmd.raw_text = segment.lower().strip()
            commands.append(cmd)

        return commands

    def _expand_compound(self, text: str) -> List[ParsedCommand]:
        """Expand a natural phrase into multiple concrete commands when possible.

        Focus on simple calculation intents to drive Calculator via keyboard.
        Examples understood:
        - "calculate 1+2+3"
        - "compute 7 * 8"
        - "what is 12 / 3"
        - "add 4 and 5 and 6"
        - "subtract 3 from 10"
        - "multiply 7 by 8"
        - "divide 20 by 5"
        Returns a list of keyboard commands to type the expression and press enter.
        """
        t = text.lower().strip()

        def make_keyboard_sequence(expr: str) -> List[ParsedCommand]:
            expr = expr.strip()
            if not expr:
                return []
            return [
                ParsedCommand(CommandType.KEYBOARD, ActionType.TYPE, {"text": expr}, 0.95, f"type {expr}"),
                ParsedCommand(CommandType.KEYBOARD, ActionType.KEY_PRESS, {"key": "enter"}, 0.9, "press enter"),
            ]

        # calculate/compute/what is <expr>
        m = re.search(r"^(?:calculate|compute|what\s+is)\s+([0-9\s+\-*/().]+)$", t)
        if m:
            expr = re.sub(r"\s+", " ", m.group(1)).strip()
            return make_keyboard_sequence(expr)

        # add <a> and <b> and <c> ...
        m = re.search(r"^add\s+([0-9]+(?:\s*(?:and|,|\+|\splus\s)\s*[0-9]+)+)\s*$", t)
        if m:
            nums = re.split(r"\s*(?:and|,|\+|\splus\s)\s*", m.group(1))
            nums = [n for n in nums if n]
            if len(nums) >= 2:
                expr = " + ".join(nums)
                return make_keyboard_sequence(expr)

        # subtract <a> from <b>
        m = re.search(r"^subtract\s+([0-9]+)\s+from\s+([0-9]+)\s*$", t)
        if m:
            a, b = m.group(1), m.group(2)
            return make_keyboard_sequence(f"{b} - {a}")

        # multiply <a> by <b>
        m = re.search(r"^multiply\s+([0-9]+)\s+by\s+([0-9]+)\s*$", t)
        if m:
            a, b = m.group(1), m.group(2)
            return make_keyboard_sequence(f"{a} * {b}")

        # divide <a> by <b>
        m = re.search(r"^divide\s+([0-9]+)\s+by\s+([0-9]+)\s*$", t)
        if m:
            a, b = m.group(1), m.group(2)
            return make_keyboard_sequence(f"{a} / {b}")

        return []

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

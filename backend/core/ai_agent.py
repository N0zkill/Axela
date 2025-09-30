import os
import json
import time
import base64
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

try:
    from .parser import ParsedCommand, CommandType as ParserCommandType, ActionType as ParserActionType
    PARSER_AVAILABLE = True
except ImportError:
    PARSER_AVAILABLE = False

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / '.env'
    load_dotenv(env_path)
    DOTENV_AVAILABLE = True
except ImportError:
    DOTENV_AVAILABLE = False

try:
    import openai
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    print("OpenAI library not installed. Install with: pip install openai")


class CommandType(Enum):
    MOUSE = "mouse"
    KEYBOARD = "keyboard"
    SCREENSHOT = "screenshot"
    SYSTEM = "system"
    FILE = "file"
    PROGRAM = "program"
    WEB = "web"
    COMPLEX = "complex"


@dataclass
class AIResponse:
    success: bool
    commands: List[ParsedCommand]
    explanation: str
    warnings: List[str]
    requires_confirmation: bool = False


class AIAgent:
    def __init__(self, logger=None):
        self.logger = logger
        self.client = None

        self.model = os.getenv('OPENAI_MODEL', 'gpt-4o')
        self.fast_model = "gpt-3.5-turbo"
        self.max_tokens = int(os.getenv('OPENAI_MAX_TOKENS', '800'))
        self.temperature = float(os.getenv('OPENAI_TEMPERATURE', '0.3'))

        self.system_context = self._build_system_context()

        self._initialize_openai()

    def _initialize_openai(self):
        if not OPENAI_AVAILABLE:
            if self.logger:
                self.logger.log_error("OpenAI library not available")
            return False

        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            if self.logger:
                self.logger.log_error("OPENAI_API_KEY environment variable not set")
            print("OPENAI_API_KEY environment variable not set")
            print("Please set your OpenAI API key: set OPENAI_API_KEY=your_key_here")
            return False

        try:
            client_kwargs = {'api_key': api_key}
            org_id = os.getenv('OPENAI_ORG_ID')
            if org_id:
                client_kwargs['organization'] = org_id

            self.client = OpenAI(**client_kwargs)
            if self.logger:
                self.logger.log_info(f"OpenAI client initialized successfully (model: {self.model})")
            return True
        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Failed to initialize OpenAI client: {e}")
            print(f"Failed to initialize OpenAI client: {e}")
            return False

    def _build_system_context(self) -> str:
        return """You are Axela, an AI assistant that controls computers through natural language commands.

AVAILABLE COMMAND TYPES AND ACTIONS:
1. MOUSE (command_type: "mouse"):
   - click: Click at coordinates or on target
   - double_click: Double-click at coordinates or on target
   - right_click: Right-click at coordinates or on target
   - drag: Drag from one location to another
   - scroll: Scroll in specified direction
   - move: Move mouse to location

2. KEYBOARD (command_type: "keyboard"):
   - type: Type text
   - key_press: Press a single key
   - key_combo: Press key combination

3. SCREENSHOT (command_type: "screenshot"):
   - capture: Take a screenshot
   - save: Save screenshot with specific name

4. SYSTEM (command_type: "system"):
   - shutdown: Shutdown computer
   - restart: Restart computer
   - logout: Log out user
   - sleep: Put computer to sleep

5. FILE (command_type: "file"):
   - open: Open a file or folder
   - create: Create new file or folder
   - delete: Delete file or folder
   - copy: Copy file or folder
   - move_file: Move file to new location
   - rename: Rename file or folder

6. PROGRAM (command_type: "program"):
   - start: Start a program
   - close: Close a program
   - minimize: Minimize window
   - maximize: Maximize window

7. WEB (command_type: "web"):
   - search: Search the web
   - navigate: Navigate to URL

8. UTILITY (command_type: "utility"):
   - wait: Wait for specified duration in seconds
   - delay: Same as wait

SAFETY LEVELS:
- safe: Basic operations (mouse, keyboard, screenshot)
- caution: File operations, program control
- dangerous: System commands, administrative tasks

RESPONSE FORMAT - YOU MUST RESPOND WITH VALID JSON ONLY:
{
    "success": true,
    "commands": [
        {
            "command_type": "mouse",
            "action": "click",
            "parameters": {"target": "Minecraft Official Site"},
            "confidence": 0.95,
            "raw_text": "click on Minecraft Official Site"
        }
    ],
    "explanation": "I'll click on the text 'Minecraft Official Site' that I can see in the screenshot",
    "warnings": [],
    "requires_confirmation": false
}

CRITICAL FOR MOUSE COMMANDS:
You have TWO options for mouse commands:

OPTION 1 - Text-based targeting (PREFERRED when possible):
- Use {"target": "actual text you see"} - specify the EXACT text visible on screen
- For search results: {"target": "The visible title or URL text"}
- For buttons: {"target": "Submit"}, {"target": "Login"}, {"target": "Search"}
- For links: {"target": "Learn more"}, {"target": "Read article"}
- This uses OCR to find the exact text and click it

OPTION 2 - Coordinate-based targeting (fallback):
- Use exact coordinates: {"x": 150, "y": 300}
- Only when text-based targeting won't work
- When you see a screenshot, analyze it and provide specific pixel coordinates
- Click coordinates should be in the center of clickable elements

PREFER text-based targeting as it's much more reliable than coordinates!

CRITICAL: YOUR ENTIRE RESPONSE MUST BE VALID JSON. DO NOT INCLUDE ANY TEXT BEFORE OR AFTER THE JSON.

IMPORTANT RULES:
1. ALWAYS respond with valid JSON only - no other text
2. Break complex tasks into multiple commands
3. Set appropriate safety levels
4. Provide clear descriptions
5. Include warnings for potentially dangerous operations
6. Request confirmation for system-level operations
7. Estimate realistic execution times
8. Use specific coordinates when possible
9. Handle edge cases and provide alternatives
10. Maintain context from previous commands
11. Add wait commands after web navigation (1-2 seconds) and searches (1 second)
12. Add wait commands after clicking buttons or links that trigger page loads (0.5-1 seconds)
13. When you need visual context (like clicking on something), first take a screenshot

TIMING GUIDELINES (REDUCED FOR SPEED):
- After web navigation: wait 1-2 seconds for page load
- After search: wait 1 second for results
- After clicking links/buttons: wait 0.5-1 seconds for response
- After starting programs: wait 1-2 seconds for launch
- After taking screenshots: wait 0.3 seconds for file save
- Between mouse clicks: wait 0.2-0.5 seconds for UI updates

CRITICAL WORKFLOW PATTERN:
For tasks involving search results or dynamic content:
1. Search command
2. Wait command (1 second)
3. Screenshot command (to see current results)
4. Click command using TEXT-BASED targeting: {"target": "Exact visible text from screenshot"}
5. Wait command (0.5 seconds if needed)
6. Final screenshot (if requested)

Example: "search for tee shirts, click first result, take screenshot"
Should generate: [search, wait, screenshot, click with target="Cotton T-Shirts | Amazon.com" (or whatever the first result title actually says), wait, screenshot]

CRITICAL: Look at the screenshot and use the EXACT text you can see, not generic descriptions!

AUTONOMOUS VISUAL CONTEXT:
- When you can see a screenshot, analyze it to find exact pixel coordinates for elements
- Look for buttons, links, text fields, and interactive elements
- Use specific coordinates (x, y) instead of vague targets like "first result"
- For mouse clicks, provide exact coordinates: {"x": 150, "y": 300} instead of {"target": "button"}
- Consider element positions, sizes, and visual appearance
- If an element is not visible, suggest scrolling or waiting first
- IMPORTANT: If you need to click on search results or content that loads after an action, include a screenshot command BEFORE clicking to see the current state

COORDINATE GUIDELINES:
- Buttons and links: Click in the center of the element
- Text fields: Click slightly to the right of the label or in the input area
- Search results: Each result typically has clickable title and URL areas
- Menus: Click on the text of menu items
- Icons: Click in the center of the icon area

COORDINATE SCALING:
- You will receive exact screen resolution and screenshot size information
- Always convert screenshot pixel coordinates to actual screen coordinates
- If screenshot is 1920x1080 and screen is 1920x1080, use coordinates directly
- If screenshot is 960x540 and screen is 1920x1080, multiply coordinates by 2
- Always use the scale factor provided in the visual context

Current system: Windows 10 with dynamic resolution detection"""

    def process_request(self, user_input: str, context: Optional[Dict] = None) -> AIResponse:
        """
        Process user request and generate appropriate commands

        Args:
            user_input: Natural language command from user
            context: Optional context from previous commands

        Returns:
            AIResponse with generated commands
        """
        if not self.client:
            return AIResponse(
                success=False,
                commands=[],
                explanation="AI agent not properly initialized. Check OpenAI API key.",
                warnings=["OpenAI API not available"]
            )

        try:
            # Build the prompt
            prompt = self._build_prompt(user_input, context)

            # Use faster model for text-only requests without context
            model_to_use = self.fast_model if not context else self.model

            # Call OpenAI API
            response = self.client.chat.completions.create(
                model=model_to_use,
                messages=[
                    {"role": "system", "content": self.system_context},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=self.max_tokens,
                temperature=self.temperature
            )

            # Parse response
            ai_response_text = response.choices[0].message.content.strip()

            # Try to extract JSON if there's extra text
            if not ai_response_text.startswith('{'):
                # Look for JSON block
                json_start = ai_response_text.find('{')
                json_end = ai_response_text.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    ai_response_text = ai_response_text[json_start:json_end]

            ai_data = json.loads(ai_response_text)

            # Convert to AIResponse object
            return self._parse_ai_response(ai_data)

        except json.JSONDecodeError as e:
            if self.logger:
                self.logger.log_error(f"Failed to parse AI response: {e}")
            return AIResponse(
                success=False,
                commands=[],
                explanation="Failed to parse AI response. Please try rephrasing your request.",
                warnings=["AI response parsing error"]
            )
        except Exception as e:
            if self.logger:
                self.logger.log_error(f"AI request failed: {e}")
            return AIResponse(
                success=False,
                commands=[],
                explanation=f"AI request failed: {str(e)}",
                warnings=["AI service error"]
            )

    def _build_prompt(self, user_input: str, context: Optional[Dict] = None) -> str:
        """Build prompt for OpenAI API"""
        prompt = f"User Request: {user_input}\n\n"

        if context:
            prompt += f"Context: {json.dumps(context, indent=2)}\n\n"

        prompt += """Please analyze this request and generate the appropriate commands to fulfill it.
Consider the current context and break down complex requests into multiple steps.
Always prioritize safety and ask for confirmation on potentially dangerous operations.

RESPOND ONLY WITH A VALID JSON OBJECT - NO OTHER TEXT. Follow the exact format specified in the system context."""

        return prompt

    def _parse_ai_response(self, ai_data: Dict) -> AIResponse:
        """Parse AI response into AIResponse object"""
        try:
            commands = []
            for cmd_data in ai_data.get('commands', []):
                # Convert to existing ParsedCommand structure
                command = ParsedCommand(
                    command_type=ParserCommandType(cmd_data['command_type'].lower()),
                    action=ParserActionType(cmd_data['action'].lower()),
                    parameters=cmd_data.get('parameters', {}),
                    confidence=cmd_data.get('confidence', 0.8),
                    raw_text=cmd_data.get('raw_text', '')
                )
                commands.append(command)

            return AIResponse(
                success=ai_data.get('success', True),
                commands=commands,
                explanation=ai_data.get('explanation', ''),
                warnings=ai_data.get('warnings', []),
                requires_confirmation=ai_data.get('requires_confirmation', False)
            )

        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Failed to parse AI command data: {e}")
            return AIResponse(
                success=False,
                commands=[],
                explanation="Failed to parse AI-generated commands",
                warnings=["Command parsing error"]
            )

    def generate_follow_up_suggestions(self, completed_commands: List[ParsedCommand]) -> List[str]:
        """Generate follow-up command suggestions based on completed commands"""
        suggestions = []

        for cmd in completed_commands:
            if cmd.command_type == ParserCommandType.SCREENSHOT:
                suggestions.extend([
                    "Edit the screenshot",
                    "Share the screenshot",
                    "Take another screenshot"
                ])
            elif cmd.command_type == ParserCommandType.FILE:
                suggestions.extend([
                    "Open the file",
                    "Backup the file",
                    "Share the file location"
                ])
            elif cmd.command_type == ParserCommandType.PROGRAM:
                suggestions.extend([
                    "Maximize the window",
                    "Switch to another program",
                    "Close all programs"
                ])

        return list(set(suggestions))[:5]  # Return unique suggestions, max 5

    def explain_command(self, command: ParsedCommand) -> str:
        """Generate human-readable explanation of a command"""
        explanations = {
            ParserCommandType.MOUSE: f"Perform {command.action.value} mouse action",
            ParserCommandType.KEYBOARD: f"Perform {command.action.value} keyboard action",
            ParserCommandType.SCREENSHOT: f"Take a {command.action.value} screenshot",
            ParserCommandType.SYSTEM: f"Execute {command.action.value} system command",
            ParserCommandType.FILE: f"Perform {command.action.value} file operation",
            ParserCommandType.PROGRAM: f"Control program: {command.action.value}",
            ParserCommandType.WEB: f"Web action: {command.action.value}"
        }

        base_explanation = explanations.get(command.command_type, f"Execute {command.action.value}")

        if command.parameters:
            param_str = ", ".join([f"{k}={v}" for k, v in command.parameters.items()])
            return f"{base_explanation} with parameters: {param_str}"

        return base_explanation

    def is_available(self) -> bool:
        """Check if AI agent is available for use"""
        return OPENAI_AVAILABLE and self.client is not None

    def get_status(self) -> Dict[str, Any]:
        """Get current status of AI agent"""
        env_path = Path(__file__).parent.parent / '.env'
        return {
            "available": self.is_available(),
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "openai_lib_installed": OPENAI_AVAILABLE,
            "dotenv_available": DOTENV_AVAILABLE,
            "env_file_exists": env_path.exists(),
            "api_key_configured": bool(os.getenv('OPENAI_API_KEY')),
            "org_id_configured": bool(os.getenv('OPENAI_ORG_ID')),
            "client_initialized": self.client is not None
        }

    def set_model(self, model: str):
        """Set the OpenAI model to use"""
        self.model = model
        if self.logger:
            self.logger.log_info(f"AI model changed to: {model}")

    def set_temperature(self, temperature: float):
        """Set the temperature for AI responses (0.0 to 1.0)"""
        self.temperature = max(0.0, min(1.0, temperature))
        if self.logger:
            self.logger.log_info(f"AI temperature set to: {self.temperature}")

    def process_with_visual_context(self, user_input: str, screenshot_path: Optional[str] = None, context: Optional[Dict] = None) -> AIResponse:
        """
        Process user request with visual context from screenshot using GPT-4o Vision

        Args:
            user_input: Natural language command
            screenshot_path: Path to screenshot file for visual context
            context: Optional context from previous commands

        Returns:
            AIResponse with generated commands
        """
        if not self.client:
            return AIResponse(
                success=False,
                commands=[],
                explanation="AI agent not properly initialized. Check OpenAI API key.",
                warnings=["OpenAI API not available"]
            )

        try:
            # Build the prompt
            prompt = self._build_prompt(user_input, context)

            # Prepare messages
            messages = [{"role": "system", "content": self.system_context}]

            if screenshot_path and Path(screenshot_path).exists():
                # Load and encode the screenshot
                image_data = self._encode_image(screenshot_path)
                if image_data:
                    if self.logger:
                        self.logger.log_info(f"Processing command with visual context from: {screenshot_path}")

                    # Get screen resolution and image info
                    screen_info = self._get_screen_info(screenshot_path)

                    # Add visual context to prompt with resolution info
                    visual_prompt = f"""{prompt}

VISUAL CONTEXT: I can see the current screen screenshot.
CRITICAL COORDINATE INFO:
- Screen Resolution: {screen_info['screen_width']}x{screen_info['screen_height']}
- Screenshot Size: {screen_info['image_width']}x{screen_info['image_height']}
- Coordinate Scale: {screen_info['scale_factor']:.2f}x (screenshot pixels to screen pixels)

IMPORTANT: When providing coordinates, use the ACTUAL SCREEN coordinates (not screenshot pixel coordinates).
If the screenshot shows an element at pixel (x,y), multiply by {screen_info['scale_factor']:.2f} to get screen coordinates.

CRITICAL: You are seeing a REAL screenshot of the current screen. Look at it carefully!
- READ the actual text visible on the screen
- For search results: Find the EXACT title text of the first result (e.g., "Minecraft Official Site", "Best Minecraft Builds Guide")
- For buttons: Find the EXACT button text (e.g., "Search", "Submit", "Login")
- For links: Find the EXACT link text (e.g., "Learn More", "Read Full Article")
- Use {{"target": "exact text you see"}} instead of coordinates whenever possible
- Only use coordinates as a last resort when no readable text is available

Analyze the screenshot now to identify the EXACT TEXT of the element you need to click."""

                    messages.append({
                        "role": "user",
                        "content": [
                            {"type": "text", "text": visual_prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}}
                        ]
                    })
                else:
                    # Fallback to text-only if image loading fails
                    messages.append({"role": "user", "content": prompt})
            else:
                # No screenshot, use text-only
                messages.append({"role": "user", "content": prompt})

            # Call OpenAI API with vision support
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
                temperature=self.temperature
            )

            # Parse response
            ai_response_text = response.choices[0].message.content.strip()

            # Try to extract JSON if there's extra text
            if not ai_response_text.startswith('{'):
                json_start = ai_response_text.find('{')
                json_end = ai_response_text.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    ai_response_text = ai_response_text[json_start:json_end]

            ai_data = json.loads(ai_response_text)

            # Convert to AIResponse object
            return self._parse_ai_response(ai_data)

        except json.JSONDecodeError as e:
            if self.logger:
                self.logger.log_error(f"Failed to parse AI response: {e}")
            return AIResponse(
                success=False,
                commands=[],
                explanation="Failed to parse AI response. Please try rephrasing your request.",
                warnings=["AI response parsing error"]
            )
        except Exception as e:
            if self.logger:
                self.logger.log_error(f"AI request failed: {e}")
            return AIResponse(
                success=False,
                commands=[],
                explanation=f"AI request failed: {str(e)}",
                warnings=["AI service error"]
            )

    def _encode_image(self, image_path: str) -> Optional[str]:
        """
        Encode image to base64 for OpenAI Vision API

        Args:
            image_path: Path to image file

        Returns:
            Base64 encoded image string or None if failed
        """
        try:
            with open(image_path, "rb") as image_file:
                return base64.b64encode(image_file.read()).decode('utf-8')
        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Failed to encode image {image_path}: {e}")
            return None

    def _get_screen_info(self, screenshot_path: str) -> Dict[str, Any]:
        """
        Get screen resolution and screenshot scaling information

        Args:
            screenshot_path: Path to screenshot file

        Returns:
            Dictionary with screen and image information
        """
        try:
            # Check if screenshot file exists
            if not Path(screenshot_path).exists():
                raise FileNotFoundError(f"Screenshot file not found: {screenshot_path}")

            # Get actual screen resolution
            import pyautogui
            screen_width, screen_height = pyautogui.size()

            # Get screenshot dimensions
            image_width, image_height = screen_width, screen_height  # Default fallback

            try:
                from PIL import Image
                with Image.open(screenshot_path) as img:
                    image_width, image_height = img.size
                    if self.logger:
                        self.logger.log_info(f"Screenshot loaded: {image_width}x{image_height} pixels")
            except ImportError:
                # Fallback without PIL
                try:
                    import cv2
                    img = cv2.imread(screenshot_path)
                    if img is not None:
                        image_height, image_width = img.shape[:2]
                        if self.logger:
                            self.logger.log_info(f"Screenshot loaded via CV2: {image_width}x{image_height} pixels")
                except ImportError:
                    if self.logger:
                        self.logger.log_warning("Neither PIL nor CV2 available for image reading")

            # Calculate scale factor
            scale_factor_x = screen_width / image_width if image_width > 0 else 1.0
            scale_factor_y = screen_height / image_height if image_height > 0 else 1.0

            # Use the average scale factor or minimum to be safe
            scale_factor = min(scale_factor_x, scale_factor_y)

            return {
                'screen_width': screen_width,
                'screen_height': screen_height,
                'image_width': image_width,
                'image_height': image_height,
                'scale_factor': scale_factor,
                'scale_x': scale_factor_x,
                'scale_y': scale_factor_y
            }

        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Failed to get screen info: {e}")

            # Return default values
            return {
                'screen_width': 1920,
                'screen_height': 1080,
                'image_width': 1920,
                'image_height': 1080,
                'scale_factor': 1.0,
                'scale_x': 1.0,
                'scale_y': 1.0
            }

    def needs_visual_context(self, user_input: str) -> bool:
        """
        Determine if a command likely needs visual context IMMEDIATELY

        This should only return True if we need to see the CURRENT screen state
        before generating commands. For multi-step tasks like "search then click",
        the AI will generate intermediate screenshots as needed.

        Args:
            user_input: Natural language command

        Returns:
            bool: True if visual context is needed immediately
        """
        user_lower = user_input.lower()

        # Only need immediate visual context if:
        # 1. Command starts with visual actions (not search/navigation first)
        # 2. Command refers to something already on screen

        immediate_visual_patterns = [
            r'^(click|select|find|locate)\s+',  # Starts with visual action
            r'^(right\s+click|double\s+click)\s+',
            r'(current|this|visible)\s+(window|screen|page)',  # Refers to current state
            r'(what|where)\s+(is|are)\s+',  # Questions about current state
        ]

        # Don't need immediate visual context if command starts with navigation/search
        if any(user_lower.startswith(pattern) for pattern in [
            'search', 'open', 'navigate', 'go to', 'launch', 'start'
        ]):
            return False

        # Check for immediate visual action patterns
        import re
        return any(re.search(pattern, user_lower) for pattern in immediate_visual_patterns)

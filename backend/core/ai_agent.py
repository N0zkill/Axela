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
    # Load from project root (one level up from backend/)
    env_path = Path(__file__).parent.parent.parent / '.env'
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


@dataclass
class AgentStepResponse:
    success: bool
    commands: List[ParsedCommand]
    reasoning: str
    status: str
    final_response: Optional[str]
    warnings: List[str]


class AIAgent:
    def __init__(self, logger=None):
        self.logger = logger
        self.client = None

        self.model = os.getenv('OPENAI_MODEL', 'gpt-4o')
        self.fast_model = "gpt-4o"
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
   - start: Start a program (parameters: {"program": "notepad"})
   - close: Close a program (parameters: {"program": "notepad"})
   - minimize: Minimize window (parameters: {"program": "notepad"})
   - maximize: Maximize window (parameters: {"program": "notepad"})

7. WEB (command_type: "web"):
   - search: Search the web (parameters: {"query": "search term"})
   - navigate: Navigate to URL (parameters: {"url": "https://example.com"})

8. UTILITY (command_type: "utility"):
   - wait: Wait for specified duration in seconds (parameters: {"duration": 2})
   - delay: Same as wait (parameters: {"duration": 2})

SAFETY LEVELS:
- safe: Basic operations (mouse, keyboard, screenshot)
- caution: File operations, program control
- dangerous: System commands, administrative tasks

RESPONSE FORMAT - YOU MUST RESPOND WITH VALID JSON ONLY:

Example 1 (Program command):
{
    "success": true,
    "commands": [
        {
            "command_type": "program",
            "action": "start",
            "parameters": {"program": "notepad"},
            "confidence": 0.95,
            "raw_text": "open notepad"
        }
    ],
    "explanation": "I'll start the Notepad program",
    "warnings": [],
    "requires_confirmation": false
}

Example 2 (Mouse command):
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

Example 3 (Keyboard command):
{
    "success": true,
    "commands": [
        {
            "command_type": "keyboard",
            "action": "type",
            "parameters": {"text": "hello world"},
            "confidence": 0.95,
            "raw_text": "type hello world"
        }
    ],
    "explanation": "I'll type 'hello world'",
    "warnings": [],
    "requires_confirmation": false
}

CRITICAL FOR MOUSE COMMANDS:
You have THREE options for mouse commands:

OPTION 1 - Visual coordinate targeting (PREFERRED for images/icons/buttons):
- When you see a screenshot, analyze it visually to identify clickable elements
- For images, icons, buttons, OR elements with both an image and text (like document templates, app icons): Use {"x": 150, "y": 300}
- Look for visual cues: button shapes, icons, clickable areas, highlighted elements
- Provide exact pixel coordinates based on what you see in the screenshot
- This is the ONLY way to click on images/icons

OPTION 2 - Text-based targeting (for text-only elements):
- Use {"target": "actual text you see"} - specify the EXACT text visible on screen
- This uses OCR to find the exact text and click it
- Only use this when the element is primarily text (like a link or menu item)

OPTION 3 - Coordinate-based targeting (fallback):
- Use exact coordinates: {"x": 150, "y": 300}
- When text-based targeting won't work
- Click coordinates should be in the center of clickable elements

PRIORITY ORDER:
1. If the element is an Image, Icon, or Tile (even if it has a text label) → Use coordinates (OPTION 1) to click the IMAGE part.
2. If the element is purely Text (like a hyperlink) → Use text target (OPTION 2)
3. Otherwise → Use coordinates (OPTION 3)

PREFER visual coordinates for anything that looks like a button, icon, or thumbnail!

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
9. After clicking or navigating, plan a wait or screenshot to verify that the UI changed before assuming success. Gathering context (like taking a screenshot) is never enough on its own-either use it to plan the next action or to extract the requested data explicitly.
10. Never click or interact with the Windows taskbar/notification area (the masked bottom portion of the screenshot). If you need system controls, explain it rather than touching the OS UI. Treat any text detected in that masked band as unusable.
11. When you detect multiple OCR matches for a target, choose the one closest to relevant UI context (labels, input boxes, etc.) and explicitly reject matches that are far from the working area (especially near the masked bottom band).
12. Before issuing a typing command, add a mouse click (or other focusing action) on the exact input field you intend to edit unless you just clicked that same target in the previous step so the caret is active.
13. Only set status to "complete" when you can explicitly provide the requested result or confirm the final action succeeded. If nothing has changed yet, continue reasoning toward the goal instead of stopping.

CRITICAL TIMING FOR COMPOUND COMMANDS (e.g., "search X and click Y"):
When a command involves navigation/search followed by interaction:
- Execute web search/navigation command
- Wait 1.5-2 seconds for page to load
- Take screenshot to see loaded content
- Wait 0.3 seconds for screenshot to save
- Execute click/interaction command

Example: "search for cats and click first result"
[
  {"command_type": "web", "action": "search", "parameters": {"query": "cats"}},
  {"command_type": "utility", "action": "wait", "parameters": {"duration": 1.5}},
  {"command_type": "screenshot", "action": "capture", "parameters": {}},
  {"command_type": "utility", "action": "wait", "parameters": {"duration": 0.3}},
  {"command_type": "mouse", "action": "click", "parameters": {"target": "visible result title"}}
]

WITHOUT THESE WAITS, THE SCREENSHOT WILL CAPTURE THE OLD PAGE BEFORE RESULTS LOAD!
"""

    def _parse_ai_response(self, ai_data: Dict) -> AIResponse:
        try:
            commands = []
            for cmd_data in ai_data.get('commands', []):
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

    def _build_prompt(self, user_input: str, context: Optional[Dict] = None) -> str:
        prompt = f"User Request: {user_input}\n\n"

        if context:
            prompt += f"Context: {json.dumps(context, indent=2)}\n\n"

        prompt += """Please analyze this request and generate the appropriate commands to fulfill it.
Consider the current context and break down complex requests into multiple steps.
Always prioritize safety and ask for confirmation on potentially dangerous operations.

RESPOND ONLY WITH A VALID JSON OBJECT - NO OTHER TEXT. Follow the exact format specified in the system context."""

        return prompt

    def _build_agent_prompt(self, user_goal: str, step_history: List[Dict[str, Any]]) -> str:
        history_text = "[]"
        stuck_warning = ""
        
        if step_history:
            try:
                history_text = json.dumps(step_history, indent=2)
                
                # Check if we detected stuck state in recent history
                for entry in step_history[-3:]:  # Check last 3 steps
                    if entry.get("stuck_detected"):
                        already_tried = entry.get("already_tried", "")
                        stuck_warning = f"""
⚠️ STUCK DETECTED: You already tried clicking "{already_tried}" and it didn't work.
CRITICAL: Try a DIFFERENT element this time! Look for:
- Different text/buttons that might accomplish the same goal
- Alternative navigation paths
- Different wording (e.g., "Submit" instead of "Done", "OK" instead of "Done")
- Elements in different screen locations
DO NOT click "{already_tried}" again!
"""
                        break
            except Exception:
                history_text = str(step_history)

        return f"""You are operating in AXELA's Agent Mode. Your mission is to complete the following goal:
GOAL: \"{user_goal}\"

{stuck_warning}

These are the steps that have already been executed and their outcomes:
{history_text}

You are about to receive the most recent screenshot for context. Carefully analyze what is currently on screen before deciding on the next action.

RESPONSE REQUIREMENTS:
1. Respond with VALID JSON only.
2. Include the following top-level fields:
   - "success": boolean indicating whether you were able to plan the next action.
   - "status": "continue", "complete", or "failed".
   - "reasoning": natural language explanation referencing what you see.
   - "commands": an array of commands using the standard schema.
   - "final_response": required when status is "complete" or "failed".
3. When status is "continue":
   - Provide EXACTLY ONE actionable command in the "commands" array.
   - That command should represent the very next step to perform.
   - If waiting or another observation is required before acting, output a single wait or screenshot command accordingly.
4. When the goal is finished, set status to "complete", leave "commands" empty, and write a user-facing summary in "final_response".
5. If the goal cannot be completed, set status to "failed" and explain why in "final_response".
6. Prefer text-based targets over coordinates whenever possible.
7. Reference the on-screen elements you observe (button labels, link text, etc.) in "reasoning".
8. If the goal depends on information that might require being signed in, inspect the screenshot for \"Sign in\", \"Log in\", or similar prompts. If access is blocked, explain that clearly instead of clicking unrelated content.
9. When trying to view prices, tickers, balances, or other specific data, look for elements containing the goal keywords (e.g., \"BTC\", \"Bitcoin price\") and prefer clicking those exact labels rather than generic hero graphics. If the relevant element is missing, navigate or search using those keywords and explain your reasoning.
10. After clicking or navigating, plan a wait or screenshot to verify that the UI changed before assuming success. Gathering context (like taking a screenshot) is never enough on its own-either use it to plan the next action or to extract the requested data explicitly.
11. Before issuing a typing command, add a mouse click (or other focusing action) on the exact input field you intend to edit unless you just clicked that same target in the previous step so the caret is active.
12. Only set status to "complete" when you can explicitly provide the requested result (e.g., quote the BTC price) or confirm the final action succeeded. If nothing has changed yet, continue reasoning toward the goal instead of stopping.
"""

    def generate_follow_up_suggestions(self, completed_commands: List[ParsedCommand]) -> List[str]:
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

        return list(set(suggestions))[:5]

    def explain_command(self, command: ParsedCommand) -> str:
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

    def chat_response(self, user_message: str) -> str:
        if not self.client:
            return "I'm sorry, I'm not currently available. Please check my configuration."

        try:
            chat_system_context = """You are AXELA, a helpful AI assistant in chat mode.

Right now you're just having a conversation - the user isn't asking you to control their computer.

Talk like a real person would. Be friendly, natural, and conversational. Skip the corporate speak and just help out however you can - answer questions, give advice, explain things, or shoot the breeze.

Keep things relaxed and genuine. Don't overthink it. If something needs a longer explanation, go for it. If a quick answer works, that's fine too.

You have the ability to control computers when needed, but that's not what's happening right now. If someone asks you to do something on their machine, just let them know they'll need to switch to AI or Manual mode for that.

Use emojis sparingly or not at all - only if it actually fits the vibe of the conversation.

Never use markdown in your responses. You can use bullet points such as - and numbers but never actual markdown.
"""

            response = self.client.chat.completions.create(
                model=self.fast_model,  # Use fast model for chat
                messages=[
                    {"role": "system", "content": chat_system_context},
                    {"role": "user", "content": user_message}
                ],
                max_tokens=300,
                temperature=0.8
            )

            return response.choices[0].message.content.strip()

        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Chat response failed: {e}")
            return f"I'm having trouble responding right now. Error: {str(e)}"

    def is_available(self) -> bool:
        """Check if AI aent is available for use"""
        return OPENAI_AVAILABLE and self.client is not None

    def get_status(self) -> Dict[str, Any]:
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
        self.model = model
        if self.logger:
            self.logger.log_info(f"AI model changed to: {model}")

    def set_temperature(self, temperature: float):
        self.temperature = max(0.0, min(1.0, temperature))
        if self.logger:
            self.logger.log_info(f"AI temperature set to: {self.temperature}")

    def process_request(self, user_input: str, context: Optional[Dict] = None) -> AIResponse:
        """Legacy alias for process_with_visual_context without screenshot"""
        return self.process_with_visual_context(user_input, None, context)

    def process_with_visual_context(self, user_input: str, screenshot_path: Optional[str] = None, context: Optional[Dict] = None) -> AIResponse:
        if not self.client:
            return AIResponse(
                success=False,
                commands=[],
                explanation="AI agent not properly initialized. Check OpenAI API key.",
                warnings=["OpenAI API not available"]
            )

        try:
            prompt = self._build_prompt(user_input, context)

            messages = [{"role": "system", "content": self.system_context}]

            if screenshot_path and Path(screenshot_path).exists():
                image_data = self._encode_image(screenshot_path)
                if image_data:
                    if self.logger:
                        self.logger.log_info(f"Processing command with visual context from: {screenshot_path}")

                    screen_info = self._get_screen_info(screenshot_path)

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
                    messages.append({"role": "user", "content": prompt})
            else:
                messages.append({"role": "user", "content": prompt})

            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
                temperature=self.temperature
            )

            ai_response_text = response.choices[0].message.content.strip()

            if not ai_response_text.startswith('{'):
                json_start = ai_response_text.find('{')
                json_end = ai_response_text.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    ai_response_text = ai_response_text[json_start:json_end]

            ai_data = json.loads(ai_response_text)

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

    def process_agent_step(self,
                           user_goal: str,
                           step_history: List[Dict[str, Any]],
                           screenshot_path: Optional[str] = None) -> AgentStepResponse:
        if not self.client:
            return AgentStepResponse(
                success=False,
                commands=[],
                reasoning="AI agent not properly initialized. Check OpenAI API key.",
                status="failed",
                final_response=None,
                warnings=["OpenAI API not available"]
            )

        try:
            prompt = self._build_agent_prompt(user_goal, step_history)
            messages = [{"role": "system", "content": self.system_context}]

            if screenshot_path and Path(screenshot_path).exists():
                image_data = self._encode_image(screenshot_path)
                if image_data:
                    if self.logger:
                        self.logger.log_info(f"Agent mode step using screenshot: {screenshot_path}")

                    screen_info = self._get_screen_info(screenshot_path)
                    visual_prompt = f"""{prompt}

AGENT MODE VISUAL ANALYSIS:
- Screen Resolution: {screen_info['screen_width']}x{screen_info['screen_height']}
- Screenshot Size: {screen_info['image_width']}x{screen_info['image_height']}
- Provide observations about visible UI elements, labels, and state changes.
- Use ACTUAL SCREEN coordinates (not screenshot pixels) if coordinates are necessary.
- Always mention what you observe on screen in the "reasoning" field before deciding the next action.
"""
                    messages.append({
                        "role": "user",
                        "content": [
                            {"type": "text", "text": visual_prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}}
                        ]
                    })
                else:
                    messages.append({"role": "user", "content": prompt})
            else:
                messages.append({"role": "user", "content": prompt})

            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
                temperature=self.temperature
            )

            ai_response_text = response.choices[0].message.content.strip()

            if not ai_response_text.startswith('{'):
                json_start = ai_response_text.find('{')
                json_end = ai_response_text.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    ai_response_text = ai_response_text[json_start:json_end]

            ai_data = json.loads(ai_response_text)
            parsed = self._parse_ai_response(ai_data)

            status = ai_data.get("status", "continue")
            reasoning = ai_data.get("reasoning") or parsed.explanation
            final_response = ai_data.get("final_response")

            return AgentStepResponse(
                success=parsed.success,
                commands=parsed.commands,
                reasoning=reasoning,
                status=status,
                final_response=final_response,
                warnings=parsed.warnings
            )

        except json.JSONDecodeError as e:
            if self.logger:
                self.logger.log_error(f"Failed to parse agent response: {e}")
            return AgentStepResponse(
                success=False,
                commands=[],
                reasoning="Failed to parse agent response. Please try again.",
                status="failed",
                final_response=None,
                warnings=["Agent mode parsing error"]
            )
        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Agent mode request failed: {e}")
            return AgentStepResponse(
                success=False,
                commands=[],
                reasoning=f"Agent mode request failed: {str(e)}",
                status="failed",
                final_response=None,
                warnings=["Agent mode error"]
            )

    def _encode_image(self, image_path: str) -> Optional[str]:
        try:
            with open(image_path, "rb") as image_file:
                return base64.b64encode(image_file.read()).decode('utf-8')
        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Failed to encode image {image_path}: {e}")
            return None

    def _get_screen_info(self, screenshot_path: str) -> Dict[str, Any]:
        try:

            if not Path(screenshot_path).exists():
                raise FileNotFoundError(f"Screenshot file not found: {screenshot_path}")

            import pyautogui
            screen_width, screen_height = pyautogui.size()

            image_width, image_height = screen_width, screen_height  # Default fallback

            try:
                from PIL import Image
                with Image.open(screenshot_path) as img:
                    image_width, image_height = img.size
                    if self.logger:
                        self.logger.log_info(f"Screenshot loaded: {image_width}x{image_height} pixels")
            except ImportError:
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


            scale_factor_x = screen_width / image_width if image_width > 0 else 1.0
            scale_factor_y = screen_height / image_height if image_height > 0 else 1.0

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

        user_lower = user_input.lower()
        import re
        
        # Check if this is a COMPOUND command (navigation + action)
        # If so, DON'T take screenshot upfront - let AI generate sequence with screenshot in the middle
        compound_patterns = [
            r'search.*and.*(click|select|find)',  # "search for X and click Y"
            r'(open|go to|navigate).*and.*(click|select)',  # "go to X and click Y"
            r'(search|open).*then.*(click|select)',  # "search X then click Y"
        ]
        
        for pattern in compound_patterns:
            if re.search(pattern, user_lower):
                # This is a compound command - AI should generate screenshot in sequence
                return False

        immediate_visual_patterns = [
            r'^(click|select|find|locate)\s+',
            r'^(right\s+click|double\s+click)\s+',
            r'(current|this|visible)\s+(window|screen|page)',
            r'(what|where)\s+(is|are)\s+',
        ]
        
        # Check if command includes click/select actions (standalone, not compound)
        if any(re.search(pattern, user_lower) for pattern in [
            r'^click\s+(on\s+)?(the\s+)?(first|second|third|last|any)',  # Starts with click
            r'^click\s+(on\s+)?.*\b(result|link|button|element|item)',  # Starts with click
            r'^select\s+(the\s+)?(first|second|third)',  # Starts with select
        ]):
            return True

        # Don't need visual context for simple navigation commands without clicks
        if any(user_lower.startswith(pattern) for pattern in [
            'search', 'open', 'navigate', 'go to', 'launch', 'start'
        ]) and not any(keyword in user_lower for keyword in ['click', 'select', 'find on', 'locate on']):
            return False

        return any(re.search(pattern, user_lower) for pattern in immediate_visual_patterns)


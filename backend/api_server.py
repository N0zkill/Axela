#!/usr/bin/env python3
import sys
import os
from pathlib import Path

# Load environment variables FIRST, before any other imports
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / '.env'
    load_dotenv(env_path)
    print(f"[OK] Loaded environment from: {env_path}")
except ImportError:
    print("[WARNING] python-dotenv not installed")
except Exception as e:
    print(f"[WARNING] Error loading .env: {e}")

import asyncio
import time
from datetime import datetime
from typing import Optional, Dict, Any, Tuple, List
from pydantic import BaseModel
import uvicorn
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

try:
    from core.parser import NaturalLanguageParser, ParsedCommand, CommandType, ActionType
    from core.executor import CommandExecutor
    from core.logger import AxelaLogger
    from core.ai_agent import AIAgent
    from core.tts_service import get_tts_service, reinitialize_tts
    from util.config import Config
    from util.helpers import get_system_info
    from scripts import script_manager, ScriptCategory, ScriptCommand, ScriptExecutor, scheduler
    from commands.screenshot import ScreenshotCapture
    import speech_recognition as sr
    import tempfile
    import sounddevice as sd
    import os
    import subprocess
except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure you're running from the backend directory.")
    sys.exit(1)


class CommandRequest(BaseModel):
    command: str
    mode: str = "ai"  # "manual", "ai", or "chat" - default to AI mode


class CommandResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    warnings: Optional[list] = None


class StatusResponse(BaseModel):
    status: str
    ai_available: bool
    commands_executed: int
    success_rate: float


class ConfigResponse(BaseModel):
    config: Dict[str, Any]


class ConfigUpdateRequest(BaseModel):
    section: str
    settings: Dict[str, Any]


class CommandBlock(BaseModel):
    command_type: str
    action: str
    parameters: Dict[str, Any] = {}


class CommandSequenceRequest(BaseModel):
    commands: List[CommandBlock]


class AxelaAPIServer:
    def __init__(self, config_file: str = "config.json"):
        self.config = Config(config_file)
        self.config_file_path = Path(config_file)
        self.logger = AxelaLogger()
        self.parser = NaturalLanguageParser()
        self.executor = CommandExecutor(self.logger)
        self.ai_agent = AIAgent(self.logger)

        self.running = False

        # Mode can be: "manual", "ai", or "chat"
        self.mode = self.config.get_custom_setting("mode", "ai")

        self.commands_executed = 0
        self.successful_commands = 0

        # Initialize TTS service
        self.tts_service = None
        self._initialize_tts()

        self._initialize()
        self.app = self._create_app()

    def _initialize_tts(self):
        """Initialize the TTS service with current config."""
        try:
            voice_config = self.config.get_voice_config()
            # Use reinitialize to create a fresh instance with new config
            self.tts_service = reinitialize_tts(voice_config)
            if self.tts_service.is_available():
                self.logger.log_info(f"TTS Service initialized with engine: {voice_config.get('tts_engine', 'pyttsx3')}")
            else:
                self.logger.log_warning("TTS Service could not be initialized")
        except Exception as e:
            self.logger.log_error(f"Failed to initialize TTS service: {e}")
            import traceback
            traceback.print_exc()
            self.tts_service = None

    def _initialize(self):
        self.logger.log_info("Initializing Axela API Server")
        system_info = get_system_info()
        self.logger.log_info(f"System: {system_info['platform']}")

        perf_config = self.config.get_performance_config()
        if hasattr(self.executor, 'keyboard'):
            self.executor.keyboard.set_typing_speed(perf_config['keyboard_speed'])

        self.logger.log_info("Axela API Server initialized")

    async def _shutdown_handler(self):
        try:
            self.logger.log_info("Starting graceful shutdown...")

            await scheduler.stop()
            self.logger.log_info("Scheduler stopped")

            recurring_scripts = script_manager.get_recurring_scripts()
            if recurring_scripts:
                self.logger.log_info(f"Disabling {len(recurring_scripts)} recurring scripts...")
                for script in recurring_scripts:
                    script_manager.disable_recurring(script.id)
                    self.logger.log_info(f"Disabled recurring execution for script: {script.name}")

            self.logger.log_info("Graceful shutdown completed")

        except Exception as e:
            self.logger.log_error(f"Error during shutdown: {e}")

    def _create_app(self) -> FastAPI:
        app = FastAPI(
            title="Axela API",
            description="AI Computer Control Agent API",
            version="1.0.0"
        )

        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        @app.on_event("startup")
        async def startup_event():
            await scheduler.start()

        @app.on_event("shutdown")
        async def shutdown_event():
            await self._shutdown_handler()

        # API Routes
        @app.get("/")
        async def root():
            return {"message": "Axela API Server is running"}

        @app.get("/status", response_model=StatusResponse)
        async def get_status():
            """Get the current status of the Axela system"""
            success_rate = (self.successful_commands / self.commands_executed * 100) if self.commands_executed > 0 else 0.0

            return StatusResponse(
                status="running" if self.running else "stopped",
                ai_available=self.ai_agent.is_available(),
                commands_executed=self.commands_executed,
                success_rate=success_rate
            )

        @app.post("/execute", response_model=CommandResponse)
        async def execute_command(request: CommandRequest):
            try:
                self.commands_executed += 1
                mode = request.mode  # Use the mode from the request

                print(f"\n>>> Execute Debug: mode='{mode}', command='{request.command}'\n")

                # Chat mode - conversational AI
                if mode == "chat" and self.ai_agent.is_available():
                    chat_response = self.ai_agent.chat_response(request.command)
                    self.successful_commands += 1
                    return CommandResponse(
                        success=True,
                        message=chat_response,
                        data={"mode": "chat"}
                    )

                # AI mode - AI interprets and executes commands
                elif mode == "ai" and self.ai_agent.is_available():
                    success, message = await self._process_ai_command(request.command)

                    if success:
                        self.successful_commands += 1
                        return CommandResponse(
                            success=True,
                            message=message or f"Command executed successfully: {request.command}"
                        )
                    else:
                        return CommandResponse(
                            success=False,
                            message=message or f"Command failed: {request.command}"
                        )

                # Manual mode - parse and execute directly (supports chaining)
                else:
                    commands = self.parser.parse_sequence(request.command)

                    # If sequence produced a single command, keep legacy behavior
                    if len(commands) == 1:
                        parsed_command = commands[0]

                        if not self.config.is_command_allowed(
                            parsed_command.command_type.value,
                            parsed_command.action.value
                        ):
                            return CommandResponse(
                                success=False,
                                message=f"Command not allowed by security policy: {request.command}"
                            )

                        result = self.executor.execute(parsed_command)
                        self.parser.add_context(parsed_command)

                        if result.success:
                            self.successful_commands += 1

                        return CommandResponse(
                            success=result.success,
                            message=result.message,
                            data=result.data
                        )

                    # Sequence execution
                    messages = []
                    total_success = True
                    for idx, parsed_command in enumerate(commands, 1):
                        if not self.config.is_command_allowed(
                            parsed_command.command_type.value,
                            parsed_command.action.value
                        ):
                            total_success = False
                            messages.append(f"Step {idx} blocked: {parsed_command.command_type.value}/{parsed_command.action.value}")
                            break

                        result = self.executor.execute(parsed_command)
                        self.parser.add_context(parsed_command)
                        messages.append(result.message)

                        if not result.success:
                            total_success = False
                            break

                        # context-aware delay between chained steps for UI stability
                        if idx < len(commands):
                            delay = 0.2
                            try:
                                if parsed_command.command_type == CommandType.PROGRAM and parsed_command.action == ActionType.START:
                                    delay = 1.5
                                elif parsed_command.command_type == CommandType.WEB and parsed_command.action in [ActionType.SEARCH, ActionType.NAVIGATE]:
                                    delay = 1.0
                                elif parsed_command.command_type == CommandType.SCREENSHOT:
                                    delay = 0.3
                                elif parsed_command.command_type == CommandType.MOUSE and parsed_command.action in [ActionType.CLICK, ActionType.DOUBLE_CLICK, ActionType.RIGHT_CLICK]:
                                    delay = 0.4
                            except Exception:
                                delay = 0.2
                            time.sleep(delay)

                    if total_success:
                        self.successful_commands += 1

                    return CommandResponse(
                        success=total_success,
                        message="\n".join(messages) if messages else ("Command executed" if total_success else "Command failed"),
                        data={"steps": len(commands)}
                    )

            except Exception as e:
                self.logger.log_error(f"Error executing command: {e}")
                return CommandResponse(
                    success=False,
                    message=f"Error executing command: {str(e)}"
                )

        @app.post("/execute_sequence", response_model=CommandResponse)
        async def execute_sequence(request: CommandSequenceRequest):
            """Execute a sequence of command blocks provided as JSON."""
            try:
                if not request.commands:
                    return CommandResponse(success=False, message="No commands provided")

                total_success = True
                messages = []

                for idx, block in enumerate(request.commands, 1):
                    try:
                        cmd = ParsedCommand(
                            command_type=CommandType(block.command_type.lower()),
                            action=ActionType(block.action.lower()),
                            parameters=block.parameters or {},
                            confidence=1.0,
                            raw_text=f"{block.command_type} {block.action}"
                        )
                    except Exception:
                        total_success = False
                        messages.append(f"Step {idx} invalid command: {block.command_type}/{block.action}")
                        break

                    if not self.config.is_command_allowed(cmd.command_type.value, cmd.action.value):
                        total_success = False
                        messages.append(f"Step {idx} blocked: {cmd.command_type.value}/{cmd.action.value}")
                        break

                    result = self.executor.execute(cmd)
                    messages.append(result.message)
                    if not result.success:
                        total_success = False
                        break

                if total_success:
                    self.successful_commands += 1
                self.commands_executed += 1

                return CommandResponse(
                    success=total_success,
                    message="\n".join(messages) if messages else ("Sequence executed" if total_success else "Sequence failed"),
                    data={"steps": len(request.commands)}
                )

            except Exception as e:
                self.logger.log_error(f"Error executing sequence: {e}")
                return CommandResponse(success=False, message=str(e))

        @app.get("/config", response_model=ConfigResponse)
        async def get_config():
            from dataclasses import asdict

            # Get security data and ensure level is a string
            security_data = asdict(self.config.security)
            if hasattr(self.config.security.level, 'value'):
                security_data['level'] = self.config.security.level.value
            else:
                security_data['level'] = str(self.config.security.level)

            return ConfigResponse(
                config={
                    "mode": self.mode,
                    "voice": asdict(self.config.voice),
                    "security": security_data,
                    "performance": asdict(self.config.performance),
                    "hotkeys": asdict(self.config.hotkeys),
                    "custom": self.config.custom_settings
                }
            )

        @app.put("/config")
        async def update_config(config_update: ConfigUpdateRequest):
            """Update configuration settings"""
            try:
                section = config_update.section
                settings = config_update.settings

                if section == "app":
                    if "mode" in settings:
                        if settings["mode"] in ["manual", "ai", "chat"]:
                            self.mode = settings["mode"]
                            self.config.set_custom_setting("mode", settings["mode"])
                        else:
                            raise ValueError(f"Invalid mode: {settings['mode']}. Must be 'manual', 'ai', or 'chat'")

                elif section == "voice":
                    from util.config import VoiceEngine, TTSEngine
                    for key, value in settings.items():
                        if hasattr(self.config.voice, key):
                            # Convert string enum values to enums
                            if key == "recognition_engine" and isinstance(value, str):
                                value = VoiceEngine(value)
                            elif key == "tts_engine" and isinstance(value, str):
                                value = TTSEngine(value)
                            setattr(self.config.voice, key, value)

                    # Handle voice change without full reinitialization
                    if 'tts_voice' in settings and self.tts_service:
                        try:
                            self.tts_service.set_voice(settings['tts_voice'])
                            # Also update the internal voice_name attribute
                            self.tts_service.voice_name = settings['tts_voice']
                            self.logger.log_info(f"TTS voice changed to: {settings['tts_voice']}")
                        except Exception as e:
                            self.logger.log_error(f"Failed to set TTS voice: {e}")

                    # Reinitialize TTS if settings changed (excluding voice which is handled above)
                    if any(key in settings for key in ['tts_engine', 'tts_rate', 'tts_volume', 'language']):
                        try:
                            self._initialize_tts()
                            self.logger.log_info("TTS service reinitialized with new settings")
                        except Exception as e:
                            self.logger.log_error(f"Failed to reinitialize TTS: {e}")

                elif section == "security":
                    from util.config import SecurityLevel
                    for key, value in settings.items():
                        if key == "level" and isinstance(value, str):
                            self.config.security.level = SecurityLevel(value)
                        elif hasattr(self.config.security, key):
                            setattr(self.config.security, key, value)

                elif section == "performance":
                    for key, value in settings.items():
                        if hasattr(self.config.performance, key):
                            setattr(self.config.performance, key, value)
                            # Apply performance settings immediately
                            if key == "keyboard_speed" and hasattr(self.executor, 'keyboard'):
                                self.executor.keyboard.set_typing_speed(value)

                elif section == "hotkeys":
                    for key, value in settings.items():
                        if hasattr(self.config.hotkeys, key):
                            setattr(self.config.hotkeys, key, value)

                elif section == "custom":
                    for key, value in settings.items():
                        self.config.set_custom_setting(key, value)

                # Save configuration to file
                if self.config.save():
                    return {"success": True, "message": "Configuration updated and saved"}
                else:
                    return {"success": False, "message": "Configuration updated but failed to save to file"}

            except Exception as e:
                self.logger.log_error(f"Error updating config: {e}")
                raise HTTPException(status_code=400, detail=str(e))

        @app.post("/config/reset")
        async def reset_config():
            try:
                self.config.reset_to_defaults()
                self.mode = "ai"  # Reset mode to default
                self.config.set_custom_setting("mode", "ai")

                if self.config.save():
                    return {"success": True, "message": "Configuration reset to defaults"}
                else:
                    return {"success": False, "message": "Failed to save default configuration"}
            except Exception as e:
                self.logger.log_error(f"Error resetting config: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.post("/screenshot")
        async def take_screenshot():
            try:
                screenshot = ScreenshotCapture()
                screenshot_path = screenshot.capture()

                if screenshot_path:
                    return {
                        "success": True,
                        "message": "Screenshot taken",
                        "data": {"path": screenshot_path}
                    }
                else:
                    return {
                        "success": False,
                        "message": "Failed to take screenshot"
                    }
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        @app.post("/speak")
        async def speak_text(request: Dict[str, Any]):
            """Speak text using TTS service."""
            try:
                text = request.get("text", "")
                if not text:
                    return {"success": False, "message": "No text provided"}

                if not self.tts_service:
                    return {"success": False, "message": "TTS service not initialized"}

                if not self.tts_service.is_available():
                    engine_info = self.tts_service.get_engine_info()
                    return {
                        "success": False,
                        "message": f"TTS engine not available. Engine: {engine_info.get('engine', 'unknown')}"
                    }

                blocking = request.get("blocking", False)
                print(f"TTS API: Speaking text (blocking={blocking}): '{text[:100]}'")
                success = self.tts_service.speak(text, blocking=blocking)

                if success:
                    return {"success": True, "message": "Speech initiated"}
                else:
                    return {"success": False, "message": "TTS speak() returned False - check backend logs"}

            except Exception as e:
                self.logger.log_error(f"Error in TTS: {e}")
                import traceback
                traceback.print_exc()
                return {"success": False, "message": f"Exception: {str(e)}"}

        @app.post("/speak/stop")
        async def stop_speech():
            """Stop current speech."""
            try:
                if self.tts_service:
                    self.tts_service.stop()
                    return {"success": True, "message": "Speech stopped"}
                return {"success": False, "message": "TTS service not available"}
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        @app.get("/tts/info")
        async def get_tts_info():
            """Get information about TTS service."""
            try:
                if self.tts_service:
                    info = self.tts_service.get_engine_info()
                    voices = self.tts_service.get_available_voices()
                    return {
                        "success": True,
                        "info": info,
                        "voices": voices[:10] if voices else []  # Limit to 10 voices for response size
                    }
                return {
                    "success": False,
                    "message": "TTS service not available"
                }
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        @app.get("/tts/voices")
        async def get_tts_voices():
            """Get available voices for current TTS engine."""
            try:
                if self.tts_service and self.tts_service.is_available():
                    voices = self.tts_service.get_available_voices()
                    return {
                        "success": True,
                        "voices": voices
                    }
                return {
                    "success": False,
                    "message": "TTS service not available",
                    "voices": []
                }
            except Exception as e:
                self.logger.log_error(f"Error getting TTS voices: {e}")
                return {
                    "success": False,
                    "message": str(e),
                    "voices": []
                }

        @app.get("/audio/devices")
        async def get_audio_devices():
            """Get available audio input devices."""
            try:
                devices = []
                try:
                    device_list = sd.query_devices()

                    # Get the default input device
                    try:
                        default_device = sd.query_devices(kind='input')
                        default_name = default_device['name'] if default_device else None
                    except:
                        default_name = None

                    for i, device in enumerate(device_list):
                        # Only include input devices that are available
                        if device['max_input_channels'] > 0:
                            device_name = device['name']

                            # Filter out common virtual/internal devices
                            skip_keywords = [
                                'Microsoft Sound Mapper',
                                'Primary Sound',
                                'Wave',
                                'CABLE Input',
                                'Line 1',
                                'Stereo Mix',
                                'What U Hear'
                            ]

                            # Skip devices with filter keywords (case insensitive)
                            if any(keyword.lower() in device_name.lower() for keyword in skip_keywords):
                                continue

                            # Only include MME devices on Windows (filters out DirectSound duplicates)
                            hostapi_name = sd.query_hostapis(device['hostapi'])['name']
                            if hostapi_name != 'MME':
                                continue

                            devices.append({
                                "id": str(i),
                                "name": device_name,
                                "channels": device['max_input_channels'],
                                "is_default": device_name == default_name
                            })

                except ImportError:
                    self.logger.log_warning("sounddevice not installed, audio device listing unavailable")
                except Exception as e:
                    self.logger.log_error(f"Error querying audio devices: {e}")

                return {
                    "success": True,
                    "devices": devices
                }
            except Exception as e:
                self.logger.log_error(f"Error getting audio devices: {e}")
                return {
                    "success": False,
                    "message": str(e),
                    "devices": []
                }

        @app.post("/transcribe")
        async def transcribe_audio(audio: UploadFile = File(...)):
            try:
                # Find FFmpeg
                ffmpeg_exe = None
                ffmpeg_paths = [
                    os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0-full_build\bin\ffmpeg.exe"),
                    r"C:\ffmpeg\bin\ffmpeg.exe",
                    r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
                    r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
                    os.path.expandvars(r"%USERPROFILE%\scoop\apps\ffmpeg\current\bin\ffmpeg.exe"),
                ]

                for path in ffmpeg_paths:
                    if os.path.exists(path):
                        ffmpeg_exe = path
                        self.logger.log_info(f"Using FFmpeg at: {path}")
                        break

                if not ffmpeg_exe:
                    # Try using ffmpeg from PATH
                    ffmpeg_exe = "ffmpeg"

                # Save uploaded file temporarily
                with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_input:
                    content = await audio.read()
                    temp_input.write(content)
                    temp_input_path = temp_input.name

                # Convert to WAV format using ffmpeg directly
                temp_wav_path = temp_input_path.replace('.webm', '.wav')

                try:
                    # Convert using ffmpeg subprocess
                    result = subprocess.run(
                        [ffmpeg_exe, '-i', temp_input_path, '-ar', '16000', '-ac', '1', '-y', temp_wav_path],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )

                    if result.returncode != 0:
                        self.logger.log_error(f"FFmpeg error: {result.stderr}")
                        return {
                            "success": False,
                            "message": "Audio conversion failed",
                            "text": ""
                        }

                    # Initialize recognizer
                    recognizer = sr.Recognizer()

                    # Load audio file
                    with sr.AudioFile(temp_wav_path) as source:
                        audio_data = recognizer.record(source)

                    # Transcribe using Google Speech Recognition
                    text = recognizer.recognize_google(audio_data)

                    self.logger.log_info(f"Transcribed: {text}")

                    return {
                        "success": True,
                        "text": text
                    }

                except sr.UnknownValueError:
                    return {
                        "success": False,
                        "message": "Could not understand audio",
                        "text": ""
                    }
                except sr.RequestError as e:
                    return {
                        "success": False,
                        "message": f"Speech recognition service error: {str(e)}",
                        "text": ""
                    }
                finally:
                    # Clean up temp files
                    try:
                        os.unlink(temp_input_path)
                    except:
                        pass
                    try:
                        os.unlink(temp_wav_path)
                    except:
                        pass

            except Exception as e:
                self.logger.log_error(f"Error transcribing audio: {e}")
                import traceback
                traceback.print_exc()
                return {
                    "success": False,
                    "message": str(e),
                    "text": ""
                }

        @app.get("/scripts")
        async def list_scripts(sort_by: str = "-created_date"):
            try:
                scripts = script_manager.list_scripts(sort_by)
                return {
                    "success": True,
                    "scripts": [script.to_dict() for script in scripts]
                }
            except Exception as e:
                self.logger.log_error(f"Error listing scripts: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.get("/scripts/categories")
        async def get_script_categories():
            try:

                categories = [{"value": cat.value, "label": cat.value} for cat in ScriptCategory]

                return {
                    "success": True,
                    "categories": categories
                }
            except Exception as e:
                self.logger.log_error(f"Error getting script categories: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.get("/scripts/command-types")
        async def get_command_types():
            try:
                command_types = {
                    "mouse": {
                        "id": "mouse",
                        "name": "Mouse",
                        "description": "Mouse actions like clicking, scrolling, etc.",
                        "icon": "🖱️",
                        "actions": {
                            "click": {
                                "id": "click",
                                "name": "Click",
                                "description": "Click at a specific location",
                                "parameters": {
                                    "x": {"type": "number", "label": "X Position", "required": True, "min": 0},
                                    "y": {"type": "number", "label": "Y Position", "required": True, "min": 0},
                                    "button": {"type": "select", "label": "Button", "options": ["left", "right", "middle"], "default": "left"}
                                }
                            },
                            "double_click": {
                                "id": "double_click",
                                "name": "Double Click",
                                "description": "Double click at a specific location",
                                "parameters": {
                                    "x": {"type": "number", "label": "X Position", "required": True, "min": 0},
                                    "y": {"type": "number", "label": "Y Position", "required": True, "min": 0},
                                    "button": {"type": "select", "label": "Button", "options": ["left", "right", "middle"], "default": "left"}
                                }
                            },
                            "right_click": {
                                "id": "right_click",
                                "name": "Right Click",
                                "description": "Right click at a specific location",
                                "parameters": {
                                    "x": {"type": "number", "label": "X Position", "required": True, "min": 0},
                                    "y": {"type": "number", "label": "Y Position", "required": True, "min": 0}
                                }
                            },
                            "scroll": {
                                "id": "scroll",
                                "name": "Scroll",
                                "description": "Scroll up or down",
                                "parameters": {
                                    "direction": {"type": "select", "label": "Direction", "options": ["up", "down"], "required": True},
                                    "amount": {"type": "number", "label": "Amount", "required": True, "min": 1, "max": 10, "default": 3}
                                }
                            },
                            "drag": {
                                "id": "drag",
                                "name": "Drag",
                                "description": "Drag from one point to another",
                                "parameters": {
                                    "start_x": {"type": "number", "label": "Start X", "required": True, "min": 0},
                                    "start_y": {"type": "number", "label": "Start Y", "required": True, "min": 0},
                                    "end_x": {"type": "number", "label": "End X", "required": True, "min": 0},
                                    "end_y": {"type": "number", "label": "End Y", "required": True, "min": 0},
                                    "duration": {"type": "number", "label": "Duration (seconds)", "min": 0.1, "max": 5, "default": 1}
                                }
                            }
                        }
                    },
                    "keyboard": {
                        "id": "keyboard",
                        "name": "Keyboard",
                        "description": "Keyboard actions like typing, key combinations",
                        "icon": "⌨️",
                        "actions": {
                            "type": {
                                "id": "type",
                                "name": "Type Text",
                                "description": "Type text at the current cursor position",
                                "parameters": {
                                    "text": {"type": "text", "label": "Text to Type", "required": True, "multiline": True}
                                }
                            },
                            "press_key": {
                                "id": "press_key",
                                "name": "Press Key",
                                "description": "Press a single key or key combination",
                                "parameters": {
                                    "key": {"type": "select", "label": "Key", "options": [
                                        "enter", "space", "tab", "escape", "backspace", "delete",
                                        "ctrl+c", "ctrl+v", "ctrl+a", "ctrl+z", "ctrl+s", "ctrl+n",
                                        "alt+tab", "alt+f4", "win+d", "win+r", "win+l"
                                    ], "required": True}
                                }
                            },
                            "hotkey": {
                                "id": "hotkey",
                                "name": "Custom Hotkey",
                                "description": "Press a custom key combination",
                                "parameters": {
                                    "keys": {"type": "text", "label": "Key Combination (e.g., ctrl+shift+a)", "required": True}
                                }
                            }
                        }
                    },
                    "screenshot": {
                        "id": "screenshot",
                        "name": "Screenshot",
                        "description": "Take screenshots of the screen",
                        "icon": "📸",
                        "actions": {
                            "capture": {
                                "id": "capture",
                                "name": "Take Screenshot",
                                "description": "Capture a screenshot of the entire screen",
                                "parameters": {
                                    "filename": {"type": "text", "label": "Filename (optional)", "placeholder": "screenshot.png"}
                                }
                            },
                            "capture_region": {
                                "id": "capture_region",
                                "name": "Capture Region",
                                "description": "Capture a specific region of the screen",
                                "parameters": {
                                    "x": {"type": "number", "label": "X Position", "required": True, "min": 0},
                                    "y": {"type": "number", "label": "Y Position", "required": True, "min": 0},
                                    "width": {"type": "number", "label": "Width", "required": True, "min": 1},
                                    "height": {"type": "number", "label": "Height", "required": True, "min": 1},
                                    "filename": {"type": "text", "label": "Filename (optional)", "placeholder": "region.png"}
                                }
                            }
                        }
                    },
                    "system": {
                        "id": "system",
                        "name": "System",
                        "description": "System-level actions",
                        "icon": "⚙️",
                        "actions": {
                            "sleep": {
                                "id": "sleep",
                                "name": "Sleep",
                                "description": "Wait for a specified amount of time",
                                "parameters": {
                                    "duration": {"type": "number", "label": "Duration (seconds)", "required": True, "min": 0.1, "max": 60, "default": 1}
                                }
                            },
                            "shutdown": {
                                "id": "shutdown",
                                "name": "Shutdown",
                                "description": "Shutdown the computer",
                                "parameters": {
                                    "delay": {"type": "number", "label": "Delay (seconds)", "min": 0, "max": 300, "default": 0}
                                }
                            },
                            "restart": {
                                "id": "restart",
                                "name": "Restart",
                                "description": "Restart the computer",
                                "parameters": {
                                    "delay": {"type": "number", "label": "Delay (seconds)", "min": 0, "max": 300, "default": 0}
                                }
                            }
                        }
                    },
                    "program": {
                        "id": "program",
                        "name": "Program",
                        "description": "Program and application control",
                        "icon": "💻",
                        "actions": {
                            "start": {
                                "id": "start",
                                "name": "Start Program",
                                "description": "Launch a program or application",
                                "parameters": {
                                    "program": {"type": "text", "label": "Program Name/Path", "required": True, "placeholder": "notepad.exe"}
                                }
                            },
                            "close": {
                                "id": "close",
                                "name": "Close Program",
                                "description": "Close a running program",
                                "parameters": {
                                    "program": {"type": "text", "label": "Program Name", "required": True, "placeholder": "notepad"}
                                }
                            }
                        }
                    },
                    "web": {
                        "id": "web",
                        "name": "Web",
                        "description": "Web browser actions",
                        "icon": "🌐",
                        "actions": {
                            "navigate": {
                                "id": "navigate",
                                "name": "Navigate to URL",
                                "description": "Open a URL in the default browser",
                                "parameters": {
                                    "url": {"type": "text", "label": "URL", "required": True, "placeholder": "https://example.com"}
                                }
                            },
                            "search": {
                                "id": "search",
                                "name": "Search",
                                "description": "Search for something on the web",
                                "parameters": {
                                    "query": {"type": "text", "label": "Search Query", "required": True, "placeholder": "python tutorial"}
                                }
                            }
                        }
                    }
                }

                return {
                    "success": True,
                    "command_types": command_types
                }
            except Exception as e:
                self.logger.log_error(f"Error getting command types: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.get("/scripts/search")
        async def search_scripts(q: str):
            try:

                if not q.strip():
                    raise HTTPException(status_code=400, detail="Search query is required")

                scripts = script_manager.search_scripts(q)

                return {
                    "success": True,
                    "scripts": [script.to_dict() for script in scripts],
                    "query": q
                }
            except HTTPException:
                raise
            except Exception as e:
                self.logger.log_error(f"Error searching scripts: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.get("/scripts/{script_id}")
        async def get_script(script_id: str):
            try:
                script = script_manager.get_script(script_id)
                if not script:
                    raise HTTPException(status_code=404, detail="Script not found")

                return {
                    "success": True,
                    "script": script.to_dict()
                }
            except HTTPException:
                raise
            except Exception as e:
                self.logger.log_error(f"Error getting script: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.post("/scripts")
        async def create_script(request: Dict[str, Any]):
            try:
                name = request.get("name", "").strip()
                prompt = request.get("prompt", "").strip()
                description = request.get("description", "").strip()
                category_str = request.get("category", "General")
                commands_data = request.get("commands", [])

                self.logger.log_info(f"Creating script '{name}' with {len(commands_data)} commands")

                if not name or not prompt:
                    raise HTTPException(status_code=400, detail="Name and prompt are required")

                try:
                    category = ScriptCategory(category_str)
                except ValueError:
                    category = ScriptCategory.GENERAL

                # Handle recurring settings
                is_recurring = request.get("is_recurring", False)
                recurring_interval = request.get("recurring_interval")
                recurring_enabled = False

                script = script_manager.create_script(
                    name, prompt, description, category,
                    is_recurring=is_recurring,
                    recurring_interval=recurring_interval,
                    recurring_enabled=recurring_enabled
                )

                if commands_data:
                    self.logger.log_info(f"Adding {len(commands_data)} commands to script {script.id}")
                    for cmd_data in commands_data:
                        script_manager.add_command_to_script(
                            script.id,
                            cmd_data.get("text", ""),
                            cmd_data.get("description", "")
                        )

                return {
                    "success": True,
                    "script": script.to_dict(),
                    "message": "Script created successfully"
                }
            except HTTPException:
                raise
            except Exception as e:
                self.logger.log_error(f"Error creating script: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.put("/scripts/{script_id}")
        async def update_script(script_id: str, request: Dict[str, Any]):
            try:
                script = script_manager.get_script(script_id)
                if not script:
                    raise HTTPException(status_code=404, detail="Script not found")

                # Prepare update data
                update_data = {}
                if "name" in request:
                    update_data["name"] = request["name"].strip()
                if "prompt" in request:
                    update_data["prompt"] = request["prompt"].strip()
                if "description" in request:
                    update_data["description"] = request["description"].strip()
                if "category" in request:
                    try:
                        update_data["category"] = ScriptCategory(request["category"])
                    except ValueError:
                        update_data["category"] = ScriptCategory.GENERAL
                if "is_active" in request:
                    update_data["is_active"] = bool(request["is_active"])
                if "is_favorite" in request:
                    update_data["is_favorite"] = bool(request["is_favorite"])

                updated_script = script_manager.update_script(script_id, **update_data)

                # Handle recurring settings
                is_recurring = request.get("is_recurring", False)
                recurring_interval = request.get("recurring_interval")

                if is_recurring and recurring_interval:
                    updated_script.is_recurring = True
                    updated_script.recurring_interval = recurring_interval
                    updated_script.recurring_enabled = False
                    updated_script.next_execution = None
                else:
                    updated_script.is_recurring = False
                    updated_script.recurring_enabled = False
                    updated_script.recurring_interval = None
                    updated_script.next_execution = None

                script_manager._save_scripts()

                if "commands" in request:
                    commands_data = request.get("commands", [])
                    self.logger.log_info(f"Updating script {script_id} with {len(commands_data)} commands")

                    new_commands = []
                    for i, cmd_data in enumerate(commands_data):
                        command_id = f"cmd_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
                        command = ScriptCommand(
                            id=command_id,
                            text=cmd_data.get("text", ""),
                            description=cmd_data.get("description", ""),
                            order=i
                        )
                        new_commands.append(command)

                    updated_script.commands = new_commands
                    updated_script.updated_date = datetime.now().isoformat()

                    script_manager._save_scripts()

                    self.logger.log_info(f"Updated script with {len(updated_script.commands)} commands")

                return {
                    "success": True,
                    "script": updated_script.to_dict(),
                    "message": "Script updated successfully"
                }
            except HTTPException:
                raise
            except Exception as e:
                self.logger.log_error(f"Error updating script: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.delete("/scripts/{script_id}")
        async def delete_script(script_id: str):
            try:
                success = script_manager.delete_script(script_id)
                if not success:
                    raise HTTPException(status_code=404, detail="Script not found")

                return {
                    "success": True,
                    "message": "Script deleted successfully"
                }
            except HTTPException:
                raise
            except Exception as e:
                self.logger.log_error(f"Error deleting script: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.post("/scripts/{script_id}/execute")
        async def execute_script(script_id: str, request: Dict[str, Any] = None):
            try:
                script = script_manager.get_script(script_id)
                if not script:
                    raise HTTPException(status_code=404, detail="Script not found")

                script_executor = ScriptExecutor(self.logger, self.executor)

                result = await script_executor.execute_script_object(script)

                return {
                    "success": result.success,
                    "script_id": result.script_id,
                    "script_name": result.script_name,
                    "total_commands": result.total_commands,
                    "executed_commands": result.executed_commands,
                    "failed_commands": result.failed_commands,
                    "execution_time": result.execution_time,
                    "results": result.results,
                    "message": f"Script executed: {result.executed_commands}/{result.total_commands} commands successful"
                }
            except HTTPException:
                raise
            except Exception as e:
                self.logger.log_error(f"Error executing script: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.post("/scripts/{script_id}/commands")
        async def add_command_to_script(script_id: str, request: Dict[str, Any]):
            try:

                command_text = request.get("text", "").strip()
                description = request.get("description", "").strip()

                if not command_text:
                    raise HTTPException(status_code=400, detail="Command text is required")

                success = script_manager.add_command_to_script(script_id, command_text, description)
                if not success:
                    raise HTTPException(status_code=404, detail="Script not found")

                script = script_manager.get_script(script_id)
                return {
                    "success": True,
                    "script": script.to_dict(),
                    "message": "Command added successfully"
                }
            except HTTPException:
                raise
            except Exception as e:
                self.logger.log_error(f"Error adding command to script: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.delete("/scripts/{script_id}/commands/{command_id}")
        async def remove_command_from_script(script_id: str, command_id: str):
            try:

                success = script_manager.remove_command_from_script(script_id, command_id)
                if not success:
                    raise HTTPException(status_code=404, detail="Script or command not found")

                # Return updated script
                script = script_manager.get_script(script_id)
                return {
                    "success": True,
                    "script": script.to_dict(),
                    "message": "Command removed successfully"
                }
            except HTTPException:
                raise
            except Exception as e:
                self.logger.log_error(f"Error removing command from script: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.get("/scripts/search")
        async def search_scripts(q: str):
            try:

                if not q.strip():
                    raise HTTPException(status_code=400, detail="Search query is required")

                scripts = script_manager.search_scripts(q)

                return {
                    "success": True,
                    "scripts": [script.to_dict() for script in scripts],
                    "query": q
                }
            except HTTPException:
                raise
            except Exception as e:
                self.logger.log_error(f"Error searching scripts: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.post("/scripts/{script_id}/recurring/enable")
        async def enable_recurring_script(script_id: str, request: Dict[str, Any]):
            try:
                interval = request.get("interval", "").strip()
                if not interval:
                    raise HTTPException(status_code=400, detail="Interval is required")

                success = script_manager.enable_recurring(script_id, interval)
                if not success:
                    raise HTTPException(status_code=404, detail="Script not found")

                script = script_manager.get_script(script_id)
                self.logger.log_info(f"Enabled recurring for script {script_id} with interval {interval}")

                return {
                    "success": True,
                    "script": script.to_dict(),
                    "message": f"Recurring execution enabled with interval: {interval}"
                }
            except HTTPException:
                raise
            except Exception as e:
                self.logger.log_error(f"Error enabling recurring script: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.post("/scripts/{script_id}/recurring/disable")
        async def disable_recurring_script(script_id: str):
            try:
                success = script_manager.disable_recurring(script_id)
                if not success:
                    raise HTTPException(status_code=404, detail="Script not found")

                script = script_manager.get_script(script_id)
                self.logger.log_info(f"Disabled recurring for script {script_id}")

                return {
                    "success": True,
                    "script": script.to_dict(),
                    "message": "Recurring execution disabled"
                }
            except HTTPException:
                raise
            except Exception as e:
                self.logger.log_error(f"Error disabling recurring script: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.get("/scripts/recurring")
        async def get_recurring_scripts():
            try:
                recurring_scripts = script_manager.get_recurring_scripts()
                return {
                    "success": True,
                    "scripts": [script.to_dict() for script in recurring_scripts],
                    "count": len(recurring_scripts)
                }
            except Exception as e:
                self.logger.log_error(f"Error getting recurring scripts: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.get("/scripts/recurring/due")
        async def get_due_scripts():
            try:
                due_scripts = script_manager.get_scripts_due_for_execution()
                return {
                    "success": True,
                    "scripts": [script.to_dict() for script in due_scripts],
                    "count": len(due_scripts)
                }
            except Exception as e:
                self.logger.log_error(f"Error getting due scripts: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.get("/scheduler/status")
        async def get_scheduler_status():
            try:
                status = scheduler.get_status()
                return {
                    "success": True,
                    "status": status
                }
            except Exception as e:
                self.logger.log_error(f"Error getting scheduler status: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.post("/scheduler/start")
        async def start_scheduler():
            try:
                await scheduler.start()
                return {
                    "success": True,
                    "message": "Scheduler started"
                }
            except Exception as e:
                self.logger.log_error(f"Error starting scheduler: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @app.post("/scheduler/stop")
        async def stop_scheduler():
            try:
                await scheduler.stop()
                return {
                    "success": True,
                    "message": "Scheduler stopped"
                }
            except Exception as e:
                self.logger.log_error(f"Error stopping scheduler: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        return app

    async def _process_ai_command(self, text: str) -> Tuple[bool, str]:
        try:
            screenshot_path = None
            if self.ai_agent.needs_visual_context(text):
                screenshot_path = self._take_screenshot()

            if screenshot_path:
                ai_response = self.ai_agent.process_with_visual_context(text, screenshot_path)
            else:
                ai_response = self.ai_agent.process_request(text)

            if not ai_response.success:
                return False, ai_response.explanation

            # Log AI command generation for analytics
            self.logger.log_info(f"AI generated {len(ai_response.commands)} commands")

            total_success = True
            messages = []
            for parsed_command in ai_response.commands:
                if not self.config.is_command_allowed(
                    parsed_command.command_type.value,
                    parsed_command.action.value
                ):
                    total_success = False
                    messages.append(f"Command not allowed: {parsed_command.command_type.value}")
                    break

                result = self.executor.execute(parsed_command)
                if not result.success:
                    total_success = False
                    messages.append(result.message)
                    break
                else:
                    messages.append(result.message)

            final_message = ai_response.explanation + "\n" + "\n".join(messages) if messages else ai_response.explanation
            return total_success, final_message

        except Exception as e:
            self.logger.log_error(f"Error in AI command processing: {e}")
            return False, str(e)

    def _take_screenshot(self) -> Optional[str]:
        try:
            from commands.screenshot import ScreenshotCapture
            screenshot = ScreenshotCapture()
            return screenshot.capture()
        except Exception as e:
            self.logger.log_error(f"Failed to take screenshot: {e}")
            return None

    def start_server(self, host: str = "127.0.0.1", port: int = 8000):
        self.running = True
        self.logger.log_info(f"Starting Axela API Server on {host}:{port}")

        uvicorn.run(
            self.app,
            host=host,
            port=port,
            log_level="info"
        )


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Axela API Server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--config", default="config.json", help="Config file path")

    args = parser.parse_args()

    server = AxelaAPIServer(args.config)
    server.start_server(args.host, args.port)


if __name__ == "__main__":
    main()

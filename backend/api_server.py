#!/usr/bin/env python3
import sys
import os
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from pydantic import BaseModel
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

try:
    from core.parser import NaturalLanguageParser
    from core.executor import CommandExecutor
    from core.logger import AxelaLogger
    from core.ai_agent import AIAgent
    from core.tts_service import get_tts_service, reinitialize_tts
    from util.config import Config
    from util.helpers import get_system_info
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

                # Manual mode - parse and execute directly
                else:
                    parsed_command = self.parser.parse(request.command)

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

            except Exception as e:
                self.logger.log_error(f"Error executing command: {e}")
                return CommandResponse(
                    success=False,
                    message=f"Error executing command: {str(e)}"
                )

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
                from commands.screenshot import ScreenshotCapture
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

            # Debug: Log what the AI generated
            self.logger.log_info(f"AI generated {len(ai_response.commands)} commands")
            for i, cmd in enumerate(ai_response.commands):
                self.logger.log_info(f"Command {i+1}: type={cmd.command_type.value}, action={cmd.action.value}, params={cmd.parameters}")

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

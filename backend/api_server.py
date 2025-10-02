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

        self._initialize()
        self.app = self._create_app()

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
                    for key, value in settings.items():
                        if hasattr(self.config.voice, key):
                            setattr(self.config.voice, key, value)

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

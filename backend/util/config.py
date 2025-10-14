import json
import os
from pathlib import Path
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from enum import Enum


class VoiceEngine(Enum):
    WINDOWS_SPEECH = "windows_speech"
    GOOGLE = "google"
    SPHINX = "sphinx"
    AZURE = "azure"


class TTSEngine(Enum):
    WINDOWS_TTS = "windows_tts"
    OPENAI_TTS = "openai_tts"


class SecurityLevel(Enum):
    UNRESTRICTED = "unrestricted"
    MODERATE = "moderate"
    STRICT = "strict"
    SAFE_MODE = "safe_mode"


@dataclass
class VoiceSettings:
    enabled: bool = True
    recognition_engine: VoiceEngine = VoiceEngine.WINDOWS_SPEECH
    tts_engine: TTSEngine = TTSEngine.WINDOWS_TTS
    tts_voice: Optional[str] = None  # Voice ID/name for the TTS engine
    activation_phrase: str = "hey axela"
    voice_threshold: float = 0.7
    tts_rate: int = 200
    tts_volume: float = 0.8
    language: str = "en-US"
    microphone_device: Optional[str] = None
    speaker_device: Optional[str] = None


@dataclass
class SecuritySettings:
    level: SecurityLevel = SecurityLevel.MODERATE
    require_confirmation: List[str] = None
    blocked_commands: List[str] = None
    allowed_file_operations: List[str] = None
    max_file_size_mb: int = 100
    enable_logging: bool = True
    log_sensitive_data: bool = False

    def __post_init__(self):
        if self.require_confirmation is None:
            self.require_confirmation = [
                "shutdown", "restart", "delete", "format", "registry"
            ]
        if self.blocked_commands is None:
            self.blocked_commands = []
        if self.allowed_file_operations is None:
            self.allowed_file_operations = [
                "read", "write", "copy", "move", "rename"
            ]


@dataclass
class PerformanceSettings:
    mouse_speed: float = 1.0
    keyboard_speed: float = 0.05
    screenshot_quality: int = 95
    max_command_history: int = 1000
    auto_cleanup_days: int = 30
    enable_caching: bool = True
    parallel_processing: bool = True
    max_threads: int = 4


@dataclass
class HotkeySettings:
    toggle_voice: str = "ctrl+alt+v"
    emergency_stop: str = "ctrl+alt+x"
    minimize_to_tray: str = "ctrl+alt+m"
    screenshot: str = "ctrl+alt+s"
    repeat_last: str = "ctrl+alt+r"
    command_history: str = "ctrl+alt+h"


class Config:
    def __init__(self, config_file: str = "config.json"):
        self.config_file = Path(config_file)
        self.config_dir = self.config_file.parent
        self.config_dir.mkdir(exist_ok=True)

        self.voice = VoiceSettings()
        self.security = SecuritySettings()
        self.performance = PerformanceSettings()
        self.hotkeys = HotkeySettings()

        self.custom_settings: Dict[str, Any] = {}

        self.load()

    def load(self) -> bool:
        try:
            if self.config_file.exists():
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                if 'voice' in data:
                    voice_data = data['voice'].copy()
                    # Convert string enum values to enums
                    if 'recognition_engine' in voice_data and isinstance(voice_data['recognition_engine'], str):
                        voice_data['recognition_engine'] = VoiceEngine(voice_data['recognition_engine'])
                    if 'tts_engine' in voice_data and isinstance(voice_data['tts_engine'], str):
                        voice_data['tts_engine'] = TTSEngine(voice_data['tts_engine'])
                    self.voice = VoiceSettings(**voice_data)
                    
                if 'security' in data:
                    security_data = data['security'].copy()
                    # Convert string enum values to enums
                    if 'level' in security_data and isinstance(security_data['level'], str):
                        security_data['level'] = SecurityLevel(security_data['level'])
                    self.security = SecuritySettings(**security_data)
                    
                if 'performance' in data:
                    self.performance = PerformanceSettings(**data['performance'])
                if 'hotkeys' in data:
                    self.hotkeys = HotkeySettings(**data['hotkeys'])
                if 'custom' in data:
                    self.custom_settings = data['custom']

                return True
        except Exception as e:
            print(f"Error loading config: {e}")
            import traceback
            traceback.print_exc()

        return False

    def save(self) -> bool:
        try:
            data = {
                'voice': asdict(self.voice),
                'security': asdict(self.security),
                'performance': asdict(self.performance),
                'hotkeys': asdict(self.hotkeys),
                'custom': self.custom_settings
            }

            if hasattr(self.voice.recognition_engine, 'value'):
                data['voice']['recognition_engine'] = self.voice.recognition_engine.value
            if hasattr(self.voice.tts_engine, 'value'):
                data['voice']['tts_engine'] = self.voice.tts_engine.value
            if hasattr(self.security.level, 'value'):
                data['security']['level'] = self.security.level.value

            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            return True
        except Exception as e:
            print(f"Error saving config: {e}")
            return False

    def reset_to_defaults(self):
        self.voice = VoiceSettings()
        self.security = SecuritySettings()
        self.performance = PerformanceSettings()
        self.hotkeys = HotkeySettings()
        self.custom_settings = {}

    def backup_config(self, backup_name: Optional[str] = None) -> str:
        try:
            if not backup_name:
                from datetime import datetime
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_name = f"config_backup_{timestamp}.json"

            backup_path = self.config_dir / backup_name

            if self.config_file.exists():
                import shutil
                shutil.copy2(self.config_file, backup_path)
                return str(backup_path)

        except Exception as e:
            print(f"Error creating backup: {e}")

        return ""

    def restore_config(self, backup_path: str) -> bool:
        try:
            backup_file = Path(backup_path)
            if backup_file.exists():
                import shutil
                shutil.copy2(backup_file, self.config_file)
                return self.load()
        except Exception as e:
            print(f"Error restoring config: {e}")

        return False

    def get_custom_setting(self, key: str, default: Any = None) -> Any:
        return self.custom_settings.get(key, default)

    def set_custom_setting(self, key: str, value: Any):
        self.custom_settings[key] = value

    def remove_custom_setting(self, key: str) -> bool:
        if key in self.custom_settings:
            del self.custom_settings[key]
            return True
        return False

    def get_all_hotkeys(self) -> Dict[str, str]:
        return asdict(self.hotkeys)

    def set_hotkey(self, action: str, hotkey: str) -> bool:
        try:
            if hasattr(self.hotkeys, action):
                setattr(self.hotkeys, action, hotkey)
                return True
        except Exception as e:
            print(f"Error setting hotkey: {e}")

        return False

    def is_command_allowed(self, command_type: str, command_action: str) -> bool:
        if self.security.level == SecurityLevel.SAFE_MODE:
            safe_commands = ["mouse", "keyboard", "screenshot"]
            if command_type not in safe_commands:
                return False

        elif self.security.level == SecurityLevel.STRICT:
            restricted_types = ["system", "file"]
            if command_type in restricted_types:
                return False

        if command_action in self.security.blocked_commands:
            return False

        return True

    def requires_confirmation(self, command_action: str) -> bool:
        return command_action in self.security.require_confirmation

    def get_voice_config(self) -> Dict[str, Any]:
        return {
            'engine': self.voice.recognition_engine.value,
            'tts_engine': self.voice.tts_engine.value,
            'tts_voice': self.voice.tts_voice,
            'activation_phrase': self.voice.activation_phrase,
            'threshold': self.voice.voice_threshold,
            'language': self.voice.language,
            'tts_rate': self.voice.tts_rate,
            'tts_volume': self.voice.tts_volume,
            'microphone': self.voice.microphone_device,
            'speaker': self.voice.speaker_device
        }

    def get_performance_config(self) -> Dict[str, Any]:
        return {
            'mouse_speed': self.performance.mouse_speed,
            'keyboard_speed': self.performance.keyboard_speed,
            'screenshot_quality': self.performance.screenshot_quality,
            'max_history': self.performance.max_command_history,
            'cleanup_days': self.performance.auto_cleanup_days,
            'caching': self.performance.enable_caching,
            'parallel': self.performance.parallel_processing,
            'max_threads': self.performance.max_threads
        }

    def export_settings(self, export_path: str, include_custom: bool = True) -> bool:
        try:
            export_data = {
                'voice': asdict(self.voice),
                'security': asdict(self.security),
                'performance': asdict(self.performance),
                'hotkeys': asdict(self.hotkeys)
            }

            if include_custom:
                export_data['custom'] = self.custom_settings

            export_data['voice']['recognition_engine'] = self.voice.recognition_engine.value
            export_data['voice']['tts_engine'] = self.voice.tts_engine.value
            export_data['security']['level'] = self.security.level.value

            with open(export_path, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, indent=2, ensure_ascii=False)

            return True
        except Exception as e:
            print(f"Error exporting settings: {e}")
            return False

    def import_settings(self, import_path: str, merge: bool = False) -> bool:
        try:
            with open(import_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            if not merge:
                self.reset_to_defaults()

            if 'voice' in data:
                voice_data = data['voice'].copy()
                # Convert string enum values to enums
                if 'recognition_engine' in voice_data and isinstance(voice_data['recognition_engine'], str):
                    voice_data['recognition_engine'] = VoiceEngine(voice_data['recognition_engine'])
                if 'tts_engine' in voice_data and isinstance(voice_data['tts_engine'], str):
                    voice_data['tts_engine'] = TTSEngine(voice_data['tts_engine'])
                self.voice = VoiceSettings(**voice_data)
                
            if 'security' in data:
                security_data = data['security'].copy()
                if 'level' in security_data and isinstance(security_data['level'], str):
                    security_data['level'] = SecurityLevel(security_data['level'])
                self.security = SecuritySettings(**security_data)
                
            if 'performance' in data:
                self.performance = PerformanceSettings(**data['performance'])
            if 'hotkeys' in data:
                self.hotkeys = HotkeySettings(**data['hotkeys'])
            if 'custom' in data:
                if merge:
                    self.custom_settings.update(data['custom'])
                else:
                    self.custom_settings = data['custom']

            return True
        except Exception as e:
            print(f"Error importing settings: {e}")
            return False

    def validate_settings(self) -> List[str]:
        issues = []

        if self.voice.voice_threshold < 0 or self.voice.voice_threshold > 1:
            issues.append("Voice threshold must be between 0 and 1")

        if self.voice.tts_rate < 50 or self.voice.tts_rate > 500:
            issues.append("TTS rate should be between 50 and 500")

        if self.voice.tts_volume < 0 or self.voice.tts_volume > 1:
            issues.append("TTS volume must be between 0 and 1")

        if self.performance.max_threads < 1:
            issues.append("Max threads must be at least 1")

        if self.performance.screenshot_quality < 1 or self.performance.screenshot_quality > 100:
            issues.append("Screenshot quality must be between 1 and 100")


        if self.security.max_file_size_mb < 1:
            issues.append("Max file size must be at least 1 MB")

        return issues

    def get_config_summary(self) -> Dict[str, Any]:
        return {
            'voice_enabled': self.voice.enabled,
            'security_level': self.security.level.value,
            'hotkeys_count': len(asdict(self.hotkeys)),
            'custom_settings_count': len(self.custom_settings),
            'config_file': str(self.config_file),
            'last_modified': self.config_file.stat().st_mtime if self.config_file.exists() else None
        }

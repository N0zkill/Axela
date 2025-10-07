#!/usr/bin/env python3
"""
Text-to-Speech Service for Axela
Supports multiple TTS engines: pyttsx3, gTTS, Windows TTS, Azure TTS
"""

import os
import sys
import threading
import tempfile
import time
from pathlib import Path
from typing import Optional, Dict, Any
from enum import Enum

# Windows COM threading support
if sys.platform == "win32":
    try:
        import pythoncom
        PYTHONCOM_AVAILABLE = True
    except ImportError:
        PYTHONCOM_AVAILABLE = False
else:
    PYTHONCOM_AVAILABLE = False

# Removed pyttsx3 and gTTS - using Windows TTS and OpenAI TTS only

# pygame is used by OpenAI TTS for audio playback
try:
    import pygame
    PYGAME_AVAILABLE = True
    print("[OK] Pygame available for audio playback")
except ImportError:
    PYGAME_AVAILABLE = False
    print("[!] Pygame not available. Install with: pip install pygame")

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
    print("[OK] OpenAI TTS available")
except ImportError:
    OPENAI_AVAILABLE = False
    print("[!] OpenAI TTS not available. Install with: pip install openai")

# Windows-specific TTS
if sys.platform == "win32":
    try:
        import win32com.client
        WINDOWS_TTS_AVAILABLE = True
        print("[OK] Windows TTS (SAPI) available")
    except ImportError:
        WINDOWS_TTS_AVAILABLE = False
        print("[!] Windows TTS not available. Install with: pip install pywin32")
else:
    WINDOWS_TTS_AVAILABLE = False
    print(f"[!] Windows TTS not available on {sys.platform}")


class TTSEngine(Enum):
    WINDOWS_TTS = "windows_tts"
    OPENAI_TTS = "openai_tts"


class TTSService:
    """
    Text-to-Speech service that supports multiple engines.
    Automatically falls back to available engines if preferred engine is unavailable.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize TTS service with configuration.
        
        Args:
            config: Dictionary with TTS settings:
                - engine: TTSEngine enum value (default: auto-detect)
                - rate: Speech rate in words per minute (default: 200)
                - volume: Volume level 0.0-1.0 (default: 0.8)
                - language: Language code (default: "en-US")
        """
        self.config = config or {}
        self.engine_type = self._determine_engine()
        self.rate = self.config.get('tts_rate', 200)
        self.volume = self.config.get('tts_volume', 0.8)
        self.language = self.config.get('language', 'en-US')
        self.voice_name = self.config.get('tts_voice', None)
        
        self.engine = None
        self.is_speaking = False
        self._lock = threading.Lock()
        
        self._initialize_engine()

    def _determine_engine(self) -> TTSEngine:
        """Determine which TTS engine to use based on availability and config."""
        preferred_engine = self.config.get('tts_engine', 'windows_tts')
        
        # Try to use preferred engine
        if preferred_engine == 'windows_tts' and WINDOWS_TTS_AVAILABLE:
            return TTSEngine.WINDOWS_TTS
        elif preferred_engine == 'openai_tts' and OPENAI_AVAILABLE and PYGAME_AVAILABLE:
            return TTSEngine.OPENAI_TTS
        
        # Fallback to any available engine
        if WINDOWS_TTS_AVAILABLE:
            return TTSEngine.WINDOWS_TTS
        elif OPENAI_AVAILABLE and PYGAME_AVAILABLE:
            return TTSEngine.OPENAI_TTS
        
        raise RuntimeError("No TTS engine available. Please install pywin32 for Windows TTS or openai+pygame for OpenAI TTS.")

    def _initialize_engine(self):
        """Initialize the TTS engine based on engine_type."""
        try:
            print(f"Initializing TTS engine: {self.engine_type.value}")
            print(f"TTS Config: rate={self.rate}, volume={self.volume}, language={self.language}")
            
            if self.engine_type == TTSEngine.WINDOWS_TTS:
                self._initialize_windows_tts()
            elif self.engine_type == TTSEngine.OPENAI_TTS:
                self._initialize_openai_tts()
            else:
                raise ValueError(f"Unsupported TTS engine: {self.engine_type}")
                
            print(f"[OK] TTS Service successfully initialized with engine: {self.engine_type.value}")
        except Exception as e:
            print(f"[ERROR] Failed to initialize TTS engine {self.engine_type.value}: {e}")
            import traceback
            traceback.print_exc()
            self.engine = None

    def _initialize_windows_tts(self):
        """Initialize Windows SAPI TTS engine."""
        if not WINDOWS_TTS_AVAILABLE:
            raise RuntimeError("Windows TTS is not available")
        
        try:
            self.engine = win32com.client.Dispatch("SAPI.SpVoice")
            
            # Set voice if specified
            if self.voice_name is not None:
                try:
                    voices = self.engine.GetVoices()
                    voice_index = int(self.voice_name)
                    if 0 <= voice_index < voices.Count:
                        self.engine.Voice = voices.Item(voice_index)
                        print(f"Windows TTS voice set to index {voice_index}: {voices.Item(voice_index).GetDescription()}")
                except (ValueError, Exception) as e:
                    print(f"Warning: Could not set voice {self.voice_name}: {e}")
            
            # SAPI rate range is -10 to 10, where 0 is normal
            # Convert from words/min (50-500) to SAPI range
            # 200 wpm = 0 (normal), 50 wpm = -10 (slowest), 500 wpm = 10 (fastest)
            sapi_rate = max(-10, min(10, int((self.rate - 200) / 30)))
            self.engine.Rate = sapi_rate
            self.engine.Volume = int(self.volume * 100)
            print(f"Windows TTS initialized: rate={sapi_rate} (from {self.rate} wpm), volume={self.engine.Volume}")
        except Exception as e:
            print(f"Failed to initialize Windows TTS: {e}")
            import traceback
            traceback.print_exc()
            raise

    def _initialize_openai_tts(self):
        """Initialize OpenAI TTS."""
        if not OPENAI_AVAILABLE:
            raise RuntimeError("OpenAI TTS is not available")
        if not PYGAME_AVAILABLE:
            raise RuntimeError("Pygame is required for OpenAI TTS audio playback")
        
        # Load API key from environment or config
        import os
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            # Try loading from .env file
            try:
                from dotenv import load_dotenv
                load_dotenv()
                api_key = os.getenv('OPENAI_API_KEY')
            except:
                pass
        
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not found in environment variables")
        
        self.engine = OpenAI(api_key=api_key)
        
        # Initialize pygame mixer for audio playback
        if not pygame.mixer.get_init():
            pygame.mixer.init()
        
        # Set voice from config or use default
        if self.voice_name:
            print(f"OpenAI TTS initialized with configured voice: {self.voice_name}")
        else:
            self.voice_name = "alloy"  # Default OpenAI voice
            print(f"OpenAI TTS initialized with default voice: {self.voice_name}")

    def speak(self, text: str, blocking: bool = False) -> bool:
        """
        Speak the given text using the configured TTS engine.
        
        Args:
            text: Text to speak
            blocking: If True, wait for speech to complete before returning
        
        Returns:
            True if speech was initiated successfully, False otherwise
        """
        if not text or not text.strip():
            return False
        
        if not self.engine:
            print("TTS engine not initialized")
            return False
        
        try:
            if blocking:
                return self._speak_blocking(text)
            else:
                # Speak in a separate thread to avoid blocking
                thread = threading.Thread(target=self._speak_blocking, args=(text,))
                thread.daemon = True
                thread.start()
                return True
        except Exception as e:
            print(f"Error during speech: {e}")
            return False

    def _speak_blocking(self, text: str) -> bool:
        """Internal method to speak text (blocking)."""
        with self._lock:
            if self.is_speaking:
                print("TTS already speaking, skipping...")
                return False
            
            self.is_speaking = True
            
            try:
                print(f"Speaking with {self.engine_type.value}: '{text[:50]}...'")
                
                if self.engine_type == TTSEngine.WINDOWS_TTS:
                    # Windows COM objects need to be created in the same thread they're used
                    # So we create a new instance for this thread
                    if PYTHONCOM_AVAILABLE:
                        pythoncom.CoInitialize()
                    
                    try:
                        # Create a thread-local Windows TTS engine
                        import win32com.client
                        thread_engine = win32com.client.Dispatch("SAPI.SpVoice")
                        
                        # Apply current settings
                        if self.voice_name is not None:
                            try:
                                voices = thread_engine.GetVoices()
                                voice_index = int(self.voice_name)
                                if 0 <= voice_index < voices.Count:
                                    thread_engine.Voice = voices.Item(voice_index)
                            except Exception as ve:
                                print(f"Warning: Could not set voice in thread: {ve}")
                        
                        sapi_rate = max(-10, min(10, int((self.rate - 200) / 30)))
                        thread_engine.Rate = sapi_rate
                        thread_engine.Volume = int(self.volume * 100)
                        
                        print(f"Windows TTS speaking with rate={sapi_rate}, volume={thread_engine.Volume}")
                        thread_engine.Speak(text)
                        print("Windows TTS speech completed")
                    finally:
                        # Uninitialize COM for this thread
                        if PYTHONCOM_AVAILABLE:
                            pythoncom.CoUninitialize()
                    
                elif self.engine_type == TTSEngine.OPENAI_TTS:
                    # Create audio using OpenAI TTS
                    print(f"[OpenAI TTS] Using voice: {self.voice_name}")
                    print(f"Creating OpenAI TTS audio with voice '{self.voice_name}'...")
                    
                    # Map speed from WPM to OpenAI speed (0.25 to 4.0, default 1.0)
                    # 200 wpm = 1.0, adjust accordingly
                    openai_speed = max(0.25, min(4.0, self.rate / 200.0))
                    print(f"[OpenAI TTS] Speed: {openai_speed} (from {self.rate} wpm)")
                    
                    response = self.engine.audio.speech.create(
                        model="tts-1",  # or "tts-1-hd" for higher quality
                        voice=self.voice_name,
                        input=text,
                        speed=openai_speed
                    )
                    
                    # Create unique temporary file with proper cleanup
                    temp_fd, temp_path = tempfile.mkstemp(suffix='.mp3', prefix='axela_tts_')
                    temp_file = Path(temp_path)
                    os.close(temp_fd)  # Close the file descriptor
                    
                    try:
                        # Save to temporary file
                        response.stream_to_file(str(temp_file))
                        
                        # Play audio
                        print("Playing OpenAI TTS audio...")
                        if not pygame.mixer.get_init():
                            pygame.mixer.init()
                        
                        # Stop any previous playback
                        pygame.mixer.music.stop()
                        pygame.mixer.music.unload()
                        
                        # Small delay to ensure file is released
                        time.sleep(0.1)
                        
                        pygame.mixer.music.load(str(temp_file))
                        pygame.mixer.music.set_volume(self.volume)
                        pygame.mixer.music.play()
                        
                        while pygame.mixer.music.get_busy():
                            pygame.time.Clock().tick(10)
                        
                        print("OpenAI TTS playback completed")
                    finally:
                        # Clean up - ensure playback stopped and file released
                        try:
                            pygame.mixer.music.stop()
                            pygame.mixer.music.unload()
                            time.sleep(0.1)  # Give time for file to be released
                            if temp_file.exists():
                                temp_file.unlink()
                        except Exception as cleanup_error:
                            print(f"Warning: Could not clean up temp file: {cleanup_error}")
                
                return True
                
            except Exception as e:
                print(f"[ERROR] Failed to speak text with {self.engine_type.value}: {e}")
                import traceback
                traceback.print_exc()
                return False
            finally:
                self.is_speaking = False

    def stop(self):
        """Stop current speech."""
        try:
            if self.engine_type == TTSEngine.OPENAI_TTS:
                pygame.mixer.music.stop()
            # Windows TTS doesn't have a stop method in basic implementation
        except Exception as e:
            print(f"Error stopping speech: {e}")
        finally:
            self.is_speaking = False

    def set_rate(self, rate: int):
        """Set speech rate (words per minute)."""
        self.rate = rate
        try:
            if self.engine_type == TTSEngine.WINDOWS_TTS:
                sapi_rate = max(-10, min(10, int((rate - 200) / 30)))
                self.engine.Rate = sapi_rate
        except Exception as e:
            print(f"Error setting rate: {e}")

    def set_volume(self, volume: float):
        """Set speech volume (0.0 to 1.0)."""
        self.volume = max(0.0, min(1.0, volume))
        try:
            if self.engine_type == TTSEngine.WINDOWS_TTS:
                self.engine.Volume = int(self.volume * 100)
            elif self.engine_type == TTSEngine.OPENAI_TTS:
                if pygame.mixer.get_init():
                    pygame.mixer.music.set_volume(self.volume)
        except Exception as e:
            print(f"Error setting volume: {e}")

    def get_available_voices(self) -> list:
        """Get list of available voices."""
        try:
            if self.engine_type == TTSEngine.WINDOWS_TTS:
                voices = self.engine.GetVoices()
                available_voices = []
                for i, voice in enumerate(voices):
                    voice_name = voice.GetDescription()
                    # Filter out Zira
                    if "Zira" not in voice_name:
                        available_voices.append({"id": str(i), "name": voice_name})
                return available_voices
            elif self.engine_type == TTSEngine.OPENAI_TTS:
                # OpenAI TTS voices
                return [
                    {"id": "alloy", "name": "Alloy", "description": "Neutral and balanced"},
                    {"id": "echo", "name": "Echo", "description": "Male, clear and articulate"},
                    {"id": "fable", "name": "Fable", "description": "British accent, warm"},
                    {"id": "onyx", "name": "Onyx", "description": "Deep, authoritative"},
                    {"id": "nova", "name": "Nova", "description": "Female, energetic"},
                    {"id": "shimmer", "name": "Shimmer", "description": "Female, soft and warm"}
                ]
        except Exception as e:
            print(f"Error getting voices: {e}")
        return []

    def set_voice(self, voice_id: str):
        """Set the voice to use."""
        try:
            if self.engine_type == TTSEngine.WINDOWS_TTS:
                voices = self.engine.GetVoices()
                if 0 <= int(voice_id) < voices.Count:
                    self.engine.Voice = voices.Item(int(voice_id))
            elif self.engine_type == TTSEngine.OPENAI_TTS:
                # OpenAI voices are set by voice_name
                self.voice_name = voice_id
                print(f"OpenAI voice set to: {voice_id}")
        except Exception as e:
            print(f"Error setting voice: {e}")

    def is_available(self) -> bool:
        """Check if TTS engine is available and initialized."""
        return self.engine is not None

    def get_engine_info(self) -> Dict[str, Any]:
        """Get information about the current TTS engine."""
        return {
            "engine": self.engine_type.value if self.engine_type else None,
            "available": self.is_available(),
            "rate": self.rate,
            "volume": self.volume,
            "language": self.language,
            "voice": self.voice_name,
            "is_speaking": self.is_speaking
        }


# Singleton instance for global access
_tts_instance: Optional[TTSService] = None


def get_tts_service(config: Optional[Dict[str, Any]] = None) -> TTSService:
    """
    Get or create the global TTS service instance.
    
    Args:
        config: Configuration dictionary (only used on first call)
    
    Returns:
        TTSService instance
    """
    global _tts_instance
    if _tts_instance is None:
        _tts_instance = TTSService(config)
    return _tts_instance


def reinitialize_tts(config: Dict[str, Any]) -> TTSService:
    """
    Reinitialize the TTS service with new configuration.
    
    Args:
        config: New configuration dictionary
    
    Returns:
        New TTSService instance
    """
    global _tts_instance
    if _tts_instance:
        try:
            _tts_instance.stop()
        except Exception as e:
            print(f"Error stopping old TTS instance: {e}")
    _tts_instance = TTSService(config)
    return _tts_instance


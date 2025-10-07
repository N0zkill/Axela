#!/usr/bin/env python3
"""
Simple TTS Test Script
Run this to test if TTS is working independently from the API
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from core.tts_service import TTSService, WINDOWS_TTS_AVAILABLE, OPENAI_AVAILABLE, PYGAME_AVAILABLE
from util.config import Config

def main():
    print("\n" + "="*60)
    print("TTS Test Script")
    print("="*60)
    
    # Show available engines
    print("\nAvailable TTS Engines:")
    print(f"  Windows TTS: {'[YES]' if WINDOWS_TTS_AVAILABLE else '[NO]'}")
    print(f"  OpenAI TTS:  {'[YES]' if OPENAI_AVAILABLE else '[NO]'}")
    print(f"\nAudio Playback:")
    print(f"  Pygame:      {'[YES]' if PYGAME_AVAILABLE else '[NO]'} (required for OpenAI TTS)")
    
    # Load config
    print("\nLoading configuration from config.json...")
    config = Config("config.json")
    voice_config = config.get_voice_config()
    
    print(f"  TTS Engine: {voice_config['tts_engine']}")
    print(f"  TTS Rate:   {voice_config['tts_rate']} wpm")
    print(f"  TTS Volume: {voice_config['tts_volume']}")
    print(f"  Language:   {voice_config['language']}")
    
    # Initialize TTS
    print("\nInitializing TTS service...")
    try:
        tts = TTSService(voice_config)
        
        if not tts.is_available():
            print("[ERROR] TTS service failed to initialize!")
            engine_info = tts.get_engine_info()
            print(f"  Engine info: {engine_info}")
            return
        
        print("[OK] TTS service initialized successfully!")
        engine_info = tts.get_engine_info()
        print(f"  Engine: {engine_info['engine']}")
        print(f"  Rate: {engine_info['rate']}")
        print(f"  Volume: {engine_info['volume']}")
        
        # Test speech
        test_text = "Hello! This is a test of the text to speech system."
        print(f"\nSpeaking test text: '{test_text}'")
        print("(This should block until speech completes...)")
        
        success = tts.speak(test_text, blocking=True)
        
        if success:
            print("[OK] Speech completed successfully!")
        else:
            print("[ERROR] Speech failed!")
        
        print("\nTest completed!")
        
    except Exception as e:
        print(f"[ERROR] Error during TTS test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()


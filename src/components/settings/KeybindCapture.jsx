import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Keyboard, X } from "lucide-react";

export default function KeybindCapture({ value, onChange, placeholder = "Click to set..." }) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [pressedKeys, setPressedKeys] = useState(new Set());
  const captureRef = useRef(null);

  const formatKeybind = (keybind) => {
    if (!keybind) return placeholder;
    
    // Convert to display format
    return keybind
      .split('+')
      .map(key => {
        const lower = key.toLowerCase();
        if (lower === 'control' || lower === 'ctrl') return 'Ctrl';
        if (lower === 'alt') return 'Alt';
        if (lower === 'shift') return 'Shift';
        if (lower === 'meta' || lower === 'cmd' || lower === 'command') return 'Cmd';
        return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
      })
      .join(' + ');
  };

  useEffect(() => {
    if (!isCapturing) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const keys = [];
      
      // Add modifiers
      if (e.ctrlKey || e.metaKey) keys.push('ctrl');
      if (e.altKey) keys.push('alt');
      if (e.shiftKey) keys.push('shift');
      
      // Add the main key (not a modifier)
      const key = e.key.toLowerCase();
      if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
        // Map special keys
        let mappedKey = key;
        if (key === ' ') mappedKey = 'space';
        else if (key === 'escape') mappedKey = 'esc';
        else if (key === 'arrowup') mappedKey = 'up';
        else if (key === 'arrowdown') mappedKey = 'down';
        else if (key === 'arrowleft') mappedKey = 'left';
        else if (key === 'arrowright') mappedKey = 'right';
        
        keys.push(mappedKey);
      }

      // Only set if we have at least one key
      if (keys.length > 0) {
        setPressedKeys(new Set(keys));
      }
    };

    const handleKeyUp = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Finalize the keybind when user releases the key
      if (pressedKeys.size > 0) {
        const keybind = Array.from(pressedKeys).join('+');
        onChange(keybind);
        setIsCapturing(false);
        setPressedKeys(new Set());
      }
    };

    const handleMouseDown = (e) => {
      // Detect mouse buttons
      e.preventDefault();
      e.stopPropagation();

      const keys = [];
      
      // Add modifiers
      if (e.ctrlKey || e.metaKey) keys.push('ctrl');
      if (e.altKey) keys.push('alt');
      if (e.shiftKey) keys.push('shift');
      
      // Add mouse button
      let button;
      switch (e.button) {
        case 0: button = 'mouse1'; break; // Left click
        case 1: button = 'mouse3'; break; // Middle click
        case 2: button = 'mouse2'; break; // Right click
        case 3: button = 'mouse4'; break; // Back button
        case 4: button = 'mouse5'; break; // Forward button
        default: button = `mouse${e.button}`;
      }
      
      keys.push(button);
      
      const keybind = keys.join('+');
      onChange(keybind);
      setIsCapturing(false);
      setPressedKeys(new Set());
    };

    const handleClickOutside = (e) => {
      if (captureRef.current && !captureRef.current.contains(e.target)) {
        setIsCapturing(false);
        setPressedKeys(new Set());
      }
    };

    // Prevent context menu when capturing
    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('contextmenu', handleContextMenu, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [isCapturing, pressedKeys, onChange]);

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setIsCapturing(false);
  };

  const handleStartCapture = () => {
    setIsCapturing(true);
    setPressedKeys(new Set());
  };

  return (
    <div ref={captureRef} className="relative">
      <div
        onClick={handleStartCapture}
        className={`w-full px-3 py-2 bg-stone-800/50 border rounded-md text-sm cursor-pointer transition-all ${
          isCapturing
            ? 'border-orange-500 ring-2 ring-orange-500/50 bg-orange-500/10'
            : 'border-stone-700/50 hover:border-stone-600'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Keyboard className={`w-4 h-4 flex-shrink-0 ${
              isCapturing ? 'text-orange-400 animate-pulse' : 'text-stone-500'
            }`} />
            <span className={`truncate ${
              isCapturing
                ? 'text-orange-300 font-medium'
                : value
                ? 'text-stone-100'
                : 'text-stone-500'
            }`}>
              {isCapturing
                ? pressedKeys.size > 0
                  ? formatKeybind(Array.from(pressedKeys).join('+'))
                  : 'Press any key or mouse button...'
                : formatKeybind(value)}
            </span>
          </div>
          
          {value && !isCapturing && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0 hover:bg-stone-700/50"
              onClick={handleClear}
            >
              <X className="w-3 h-3 text-stone-400 hover:text-red-400" />
            </Button>
          )}
        </div>
      </div>

      {isCapturing && (
        <div className="absolute -top-12 left-0 right-0 bg-orange-600 text-white px-3 py-1.5 rounded-md text-xs font-medium text-center animate-pulse z-10">
          Press any key or mouse button...
        </div>
      )}
    </div>
  );
}


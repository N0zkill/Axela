import React, { useRef, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';

const presetColors = [
  "#2563EB", // Default Blue
  "#DB2777", // Pink
  "#4F46E5", // Indigo
  "#7C3AED", // Purple
  "#059669", // Green
  "#EA580C", // Orange
  "#DC2626", // Red
  "#57534E", // Stone
];

export default function CustomColorPicker({ color, onChange }) {
  const colorWheelRef = useRef(null);

  const handleColorWheelClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const x = e.clientX - rect.left - centerX;
    const y = e.clientY - rect.top - centerY;
    
    const distance = Math.sqrt(x * x + y * y);
    const radius = Math.min(centerX, centerY) - 10;
    
    if (distance <= radius) {
      // Convert to polar coordinates
      let angle = Math.atan2(y, x);
      if (angle < 0) angle += 2 * Math.PI;
      
      const hue = (angle * 180) / Math.PI;
      const saturation = Math.min(100, (distance / radius) * 100);
      const lightness = 50;
      
      // Convert HSL to hex
      const hslToHex = (h, s, l) => {
        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = n => {
          const k = (n + h / 30) % 12;
          const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
          return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
      };
      
      const newColor = hslToHex(hue, saturation, lightness);
      onChange(newColor);
    }
  }, [onChange]);

  const handleHexChange = (e) => {
    let value = e.target.value;
    if (!value.startsWith('#')) {
      value = '#' + value;
    }
    if (/^#[0-9A-F]{6}$/i.test(value)) {
      onChange(value);
    }
  };
  
  return (
    <div className="space-y-4">
      <div>
        <Label>Color Wheel</Label>
        <div className="flex justify-center mt-3">
          <div
            ref={colorWheelRef}
            onClick={handleColorWheelClick}
            className="w-32 h-32 rounded-full cursor-crosshair border-2 border-border relative"
            style={{
              background: `conic-gradient(
                hsl(0, 100%, 50%),
                hsl(60, 100%, 50%),
                hsl(120, 100%, 50%),
                hsl(180, 100%, 50%),
                hsl(240, 100%, 50%),
                hsl(300, 100%, 50%),
                hsl(360, 100%, 50%)
              ), radial-gradient(circle, transparent 30%, rgba(255,255,255,0.2) 70%)`
            }}
          >
            <div className="absolute inset-2 rounded-full bg-gradient-radial from-white/80 via-transparent to-transparent pointer-events-none" />
            <div 
              className="absolute w-3 h-3 border-2 border-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ 
                backgroundColor: color,
                left: '50%',
                top: '50%'
              }}
            />
          </div>
        </div>
      </div>

      <div>
        <Label>Preset Colors</Label>
        <div className="grid grid-cols-8 gap-2 mt-2">
          {presetColors.map((preset) => (
            <motion.div
              key={preset}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onChange(preset)}
              className="w-full h-6 rounded-md cursor-pointer border-2 transition-all"
              style={{ 
                backgroundColor: preset,
                borderColor: color.toUpperCase() === preset.toUpperCase() ? 'var(--foreground)' : 'var(--border)'
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <Label>Custom Color (Hex)</Label>
        <div className="flex items-center gap-2 mt-2">
          <div
            className="w-8 h-8 rounded-md border flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <Input
            value={color}
            onChange={(e) => onChange(e.target.value)}
            onBlur={handleHexChange}
            className="font-mono text-sm"
            maxLength="7"
          />
        </div>
      </div>
    </div>
  );
}
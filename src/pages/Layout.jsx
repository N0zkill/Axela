

import React, { useEffect } from "react";
import { Bot } from "lucide-react";
import { UserSettings } from "@/api/entities";

export default function Layout({ children, currentPageName }) {

  useEffect(() => {
    const applyTheme = (theme, primaryColor = "#2563EB") => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');

      if (theme === 'auto') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(theme);
      }

      // Convert hex to HSL for CSS variables
      const hexToHsl = (hex) => {
        // Remove # if present
        const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;

        // Parse r, g, b values
        const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
        const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
        const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
          h = s = 0; // achromatic
        } else {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
            default: h = 0; break; // Should not happen
          }
          h /= 6;
        }

        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
      };

      const [h, s, l] = hexToHsl(primaryColor);
      root.style.setProperty('--primary', `${h} ${s}% ${l}%`);
      root.style.setProperty('--ring', `${h} ${s}% ${l}%`);
      root.style.setProperty('--border', `${h} ${s}% ${Math.max(l - 20, 20)}%`);
      root.style.setProperty('--input', `${h} ${s}% ${Math.max(l - 20, 20)}%`);
    };

    const loadTheme = async () => {
      try {
        const settings = await UserSettings.list();
        if (settings.length > 0) {
          applyTheme(settings[0].theme || "auto", settings[0].primary_color || "#2563EB");
        } else {
          applyTheme("auto", "#2563EB");
        }
      } catch (error) {
        console.error("Error loading theme:", error);
        applyTheme("auto", "#2563EB"); // Apply default theme and color on error
      }
    };
    
    loadTheme();

    // Also listen for changes from other tabs/windows
    window.addEventListener('storage', loadTheme);
    return () => window.removeEventListener('storage', loadTheme);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="bg-card/80 backdrop-blur-md border-b sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center space-x-3">
                <div
                  className="w-9 h-9"
                  style={{
                    backgroundColor: 'var(--primary)',
                    maskImage: 'url(https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68bb7d774c1a51020f9908ee/11226bbe3_image.png)',
                    maskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskImage: 'url(https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68bb7d774c1a51020f9908ee/11226bbe3_image.png)',
                    WebkitMaskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                  }}
                />
                <div>
                  <h1 className="text-xl font-bold text-foreground">AXELA</h1>
                  <p className="text-xs text-primary">AI Personal Assistant</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className="px-3 py-1 bg-secondary rounded-full">
                  <span className="text-xs text-primary font-medium">Online</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 max-w-7xl mx-auto w-full">
          <div className="text-foreground h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}


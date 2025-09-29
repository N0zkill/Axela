
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserSettings } from "@/api/entities";
import { Mic, Palette, User as UserIcon, History } from "lucide-react";
import { motion } from "framer-motion";
import PrivacySettingsModal from "./PrivacySettingsModal";
import CustomColorPicker from "./CustomColorPicker";


export default function SettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  
  const applyTheme = useCallback((theme, primaryColor = "#2563EB") => {
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
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;

      if (max === min) {
        h = s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
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
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const defaultSettings = {
          theme: "auto",
          primary_color: "#2563EB",
          voice_enabled: true,
          voice_language: "en-US",
          assistant_personality: "friendly",
          auto_speak_responses: false,
          notifications_enabled: true,
          conversation_history_days: 30,
          script_creation_threshold: 5
      };

      let userSettings = await UserSettings.list();
      let currentSettings;
      if (userSettings.length > 0) {
        currentSettings = { ...defaultSettings, ...userSettings[0] };
      } else {
        // Create default settings if none exist
        currentSettings = await UserSettings.create(defaultSettings);
      }
      setSettings(currentSettings);
      applyTheme(currentSettings.theme, currentSettings.primary_color);
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  }, [applyTheme]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleInstantSave = useCallback(async (key, value) => {
    if (!settings) return;

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    if (key === 'theme' || key === 'primary_color') {
      applyTheme(
        key === 'theme' ? value : newSettings.theme,
        key === 'primary_color' ? value : newSettings.primary_color
      );
    }

    try {
      await UserSettings.update(settings.id, { [key]: value });
    } catch (error) {
      console.error(`Error saving setting ${key}:`, error);
      // Optionally revert state on error
      setSettings(settings);
      if (key === 'theme' || key === 'primary_color') {
        applyTheme(settings.theme, settings.primary_color);
      }
    }
  }, [settings, applyTheme]);

  const handlePrivacySave = async (privacySettings) => {
    if (!settings) return;
    const updatedSettings = { ...settings, ...privacySettings };
     try {
      await UserSettings.update(settings.id, privacySettings);
      setSettings(updatedSettings); // Update main state after successful save
    } catch (error) {
      console.error("Error saving privacy settings:", error);
    }
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (settings?.theme === 'auto') {
        applyTheme('auto', settings.primary_color);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings, applyTheme]);

  if (!settings) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-4xl mx-auto p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40 scrollbar-thumb-rounded-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-primary">Customize your AXELA experience</p>
        </motion.div>

        <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
          {/* Appearance Settings */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <Card className="bg-card h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Palette className="w-5 h-5 text-primary" /> Appearance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Theme</Label>
                  <Select value={settings.theme} onValueChange={(value) => handleInstantSave("theme", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">☀️ Light</SelectItem>
                      <SelectItem value="dark">🌙 Dark</SelectItem>
                      <SelectItem value="auto">🖥️ System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <CustomColorPicker
                    color={settings.primary_color}
                    onChange={(newColor) => handleInstantSave("primary_color", newColor)}
                />
              </CardContent>
            </Card>
          </motion.div>

          {/* Voice Settings */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <Card className="bg-card h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Mic className="w-5 h-5 text-primary" /> Voice & Audio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable Voice Input</Label>
                  <Switch checked={settings.voice_enabled} onCheckedChange={(checked) => handleInstantSave("voice_enabled", checked)} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Auto-speak Responses</Label>
                  <Switch checked={settings.auto_speak_responses} onCheckedChange={(checked) => handleInstantSave("auto_speak_responses", checked)} />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Assistant Personality */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <Card className="bg-card h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><UserIcon className="w-5 h-5 text-primary" /> Personality</CardTitle>
              </CardHeader>
              <CardContent>
                <Label>Assistant Style</Label>
                <Select value={settings.assistant_personality} onValueChange={(value) => handleInstantSave("assistant_personality", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="creative">Creative</SelectItem>
                    <SelectItem value="concise">Concise</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </motion.div>
          
          {/* Privacy & Data */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
            <Card className="bg-card">
               <CardHeader>
                <CardTitle className="flex items-center gap-2"><History className="w-5 h-5 text-primary" /> Privacy & Data</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col justify-center items-center py-6">
                 <p className="text-sm text-muted-foreground mb-4 text-center">Manage conversation history and notification settings.</p>
                 <Button onClick={() => setIsPrivacyModalOpen(true)} className="bg-primary hover:bg-primary/90">
                   Manage Privacy & Data
                 </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
        
        {/* Bottom spacer */}
        <div className="h-8"></div>
      </div>
      
      <PrivacySettingsModal
        open={isPrivacyModalOpen}
        onOpenChange={setIsPrivacyModalOpen}
        initialSettings={settings}
        onSave={handlePrivacySave}
      />
    </>
  );
}

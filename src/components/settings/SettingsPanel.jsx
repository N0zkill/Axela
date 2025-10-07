import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { MessageSquare, Shield, Zap, Mic, Save, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

export default function SettingsPanel({ axelaAPI }) {
  const [config, setConfig] = useState(null);
  const [originalConfig, setOriginalConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/config');
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        setOriginalConfig(JSON.parse(JSON.stringify(data.config))); // Deep copy
        setHasUnsavedChanges(false);
        // Load available voices for current engine
        loadVoices();
      }
    } catch (error) {
      console.error("Error loading config:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVoices = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/tts/voices');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.voices) {
          setAvailableVoices(data.voices);
        }
      }
    } catch (error) {
      console.error("Error loading voices:", error);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Update local config state (doesn't save to backend yet)
  const updateLocalSetting = (section, settings) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], ...settings }
    }));
    setHasUnsavedChanges(true);
  };

  // Save all pending changes to backend
  const saveAllChanges = async () => {
    setSaving(true);
    try {
      // Save each section that has changes
      const sections = ['mode', 'voice', 'security', 'performance', 'hotkeys', 'custom'];
      
      for (const section of sections) {
        if (section === 'mode') {
          // Handle mode separately as it's in custom settings
          if (config.mode !== originalConfig.mode) {
            await fetch('http://127.0.0.1:8000/config', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ section: 'app', settings: { mode: config.mode } })
            });
          }
        } else if (JSON.stringify(config[section]) !== JSON.stringify(originalConfig[section])) {
          await fetch('http://127.0.0.1:8000/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section, settings: config[section] })
          });
        }
      }

      // Reload config to ensure sync
      await loadConfig();

      // Notify other components
      window.dispatchEvent(new CustomEvent('axela-config-changed', {
        detail: { section: 'all', settings: config }
      }));
      
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = async () => {
    setSaving(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/config/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        await loadConfig();

        window.dispatchEvent(new CustomEvent('axela-config-changed', {
          detail: { section: 'all', settings: {} }
        }));
      }
    } catch (error) {
      console.error('Error restoring defaults:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 px-8 py-6 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <p className="text-stone-400">Configure AXELA's behavior and preferences</p>
      </motion.div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Chat Mode Settings */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-stone-900/50 border-stone-800/50 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <MessageSquare className="w-5 h-5 text-orange-400" />
                Chat Mode
              </CardTitle>
              <CardDescription className="text-stone-400">
                Control how AXELA interprets your messages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-stone-400 mb-3">Choose how AXELA processes your input:</p>

              <div
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  config.mode === "manual"
                    ? "bg-orange-500/10 border-orange-500/50"
                    : "bg-stone-800/30 border-stone-700/30 hover:border-stone-600/50"
                }`}
                onClick={() => {
                  setConfig(prev => ({ ...prev, mode: "manual" }));
                  setHasUnsavedChanges(true);
                }}
              >
                <div className="mt-0.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    config.mode === "manual" ? "border-orange-500" : "border-stone-600"
                  }`}>
                    {config.mode === "manual" && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                  </div>
                </div>
                <div className="flex-1">
                  <Label className="text-stone-200 cursor-pointer">Manual Mode</Label>
                  <p className="text-xs text-stone-500 mt-1">
                    Type exact commands yourself - no AI assistance
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  config.mode === "ai"
                    ? "bg-orange-500/10 border-orange-500/50"
                    : "bg-stone-800/30 border-stone-700/30 hover:border-stone-600/50"
                }`}
                onClick={() => {
                  setConfig(prev => ({ ...prev, mode: "ai" }));
                  setHasUnsavedChanges(true);
                }}
              >
                <div className="mt-0.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    config.mode === "ai" ? "border-orange-500" : "border-stone-600"
                  }`}>
                    {config.mode === "ai" && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                  </div>
                </div>
                <div className="flex-1">
                  <Label className="text-stone-200 cursor-pointer">AI Mode</Label>
                  <p className="text-xs text-stone-500 mt-1">
                    AI interprets and executes commands intelligently
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  config.mode === "chat"
                    ? "bg-orange-500/10 border-orange-500/50"
                    : "bg-stone-800/30 border-stone-700/30 hover:border-stone-600/50"
                }`}
                onClick={() => {
                  setConfig(prev => ({ ...prev, mode: "chat" }));
                  setHasUnsavedChanges(true);
                }}
              >
                <div className="mt-0.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    config.mode === "chat" ? "border-orange-500" : "border-stone-600"
                  }`}>
                    {config.mode === "chat" && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                  </div>
                </div>
                <div className="flex-1">
                  <Label className="text-stone-200 cursor-pointer">Chat Mode</Label>
                  <p className="text-xs text-stone-500 mt-1">
                    Chat conversationally - no command execution
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Security Settings */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-stone-900/50 border-stone-800/50 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Shield className="w-5 h-5 text-orange-400" />
                Security
              </CardTitle>
              <CardDescription className="text-stone-400">
                Control what AXELA can do on your system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-stone-200">Security Level</Label>
                <Select
                  value={config.security?.level || "moderate"}
                  onValueChange={(value) => updateLocalSetting("security", { level: value })}
                >
                  <SelectTrigger className="bg-stone-800/50 border-stone-700/50 text-stone-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="unrestricted">Unrestricted</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="strict">Strict</SelectItem>
                    <SelectItem value="safe_mode">Safe Mode</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-stone-500 mt-2">
                  {config.security?.level === "safe_mode" && "Only basic commands allowed"}
                  {config.security?.level === "strict" && "System and file operations restricted"}
                  {config.security?.level === "moderate" && "Balanced security and functionality"}
                  {config.security?.level === "unrestricted" && "All commands allowed"}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-stone-200">Enable Logging</Label>
                  <p className="text-xs text-stone-500">Log all commands and activities</p>
                </div>
                <Switch
                  checked={config.security?.enable_logging !== false}
                  onCheckedChange={(checked) => updateLocalSetting("security", { enable_logging: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Voice Settings */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <Card className="bg-stone-900/50 border-stone-800/50 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Mic className="w-5 h-5 text-orange-400" />
                Voice & TTS
              </CardTitle>
              <CardDescription className="text-stone-400">
                Voice recognition and text-to-speech settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-stone-200">Enable Voice Input</Label>
                  <p className="text-xs text-stone-500">Enable voice recognition</p>
                </div>
                <Switch
                  checked={config.voice?.enabled !== false}
                  onCheckedChange={(checked) => updateLocalSetting("voice", { enabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-stone-200">Auto-Speak Responses</Label>
                  <p className="text-xs text-stone-500">Automatically speak assistant replies</p>
                </div>
                <Switch
                  checked={config.custom?.auto_speak_responses === true}
                  onCheckedChange={(checked) => updateLocalSetting("custom", { auto_speak_responses: checked })}
                />
              </div>
              <div>
                <Label className="text-stone-200">TTS Engine</Label>
                <Select
                  value={config.voice?.tts_engine || "windows_tts"}
                  onValueChange={async (value) => {
                    updateLocalSetting("voice", { tts_engine: value });
                    // Save just the TTS engine change immediately so we can load new voices
                    try {
                      await fetch('http://127.0.0.1:8000/config', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ section: 'voice', settings: { tts_engine: value } })
                      });
                      // Reload voices for the new engine
                      setTimeout(() => loadVoices(), 500);
                    } catch (error) {
                      console.error("Error updating TTS engine:", error);
                    }
                  }}
                >
                  <SelectTrigger className="bg-stone-800/50 border-stone-700/50 text-stone-100 mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="windows_tts">Windows TTS</SelectItem>
                    <SelectItem value="openai_tts">OpenAI TTS (Realistic AI Voices)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-stone-500 mt-1">
                  {config.voice?.tts_engine === "windows_tts" && "Windows native TTS (David voice)"}
                  {config.voice?.tts_engine === "openai_tts" && "Realistic AI voices powered by OpenAI"}
                </p>
              </div>
              {availableVoices.length > 0 && (
                <div>
                  <Label className="text-stone-200">Voice</Label>
                  <Select
                    value={config.voice?.tts_voice || availableVoices[0]?.id}
                    onValueChange={(value) => updateLocalSetting("voice", { tts_voice: value })}
                  >
                    <SelectTrigger className="bg-stone-800/50 border-stone-700/50 text-stone-100 mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-stone-800 border-stone-700">
                      {availableVoices.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name}{voice.description ? ` - ${voice.description}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-stone-500 mt-1">
                    Select a voice for the TTS engine
                  </p>
                </div>
              )}
              <div>
                <Label className="text-stone-200">TTS Volume</Label>
                <Slider
                  value={[config.voice?.tts_volume * 100 || 80]}
                  onValueChange={([value]) => updateLocalSetting("voice", { tts_volume: value / 100 })}
                  max={100}
                  step={1}
                  className="mt-2"
                />
                <p className="text-xs text-stone-500 mt-1">
                  {Math.round(config.voice?.tts_volume * 100 || 80)}%
                </p>
              </div>
              <div>
                <Label className="text-stone-200">TTS Speed</Label>
                <Slider
                  value={[config.voice?.tts_rate || 200]}
                  onValueChange={([value]) => updateLocalSetting("voice", { tts_rate: value })}
                  min={50}
                  max={500}
                  step={10}
                  className="mt-2"
                />
                <p className="text-xs text-stone-500 mt-1">
                  {config.voice?.tts_rate || 200} words/min
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Performance Settings */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
          <Card className="bg-stone-900/50 border-stone-800/50 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Zap className="w-5 h-5 text-orange-400" />
                Performance
              </CardTitle>
              <CardDescription className="text-stone-400">
                Optimize speed and resource usage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-stone-200">Mouse Speed</Label>
                <Slider
                  value={[config.performance?.mouse_speed || 1.0]}
                  onValueChange={([value]) => updateLocalSetting("performance", { mouse_speed: value })}
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  className="mt-2"
                />
                <p className="text-xs text-stone-500 mt-1">
                  {config.performance?.mouse_speed?.toFixed(1) || "1.0"}x
                </p>
              </div>
              <div>
                <Label className="text-stone-200">Keyboard Speed</Label>
                <Slider
                  value={[(config.performance?.keyboard_speed || 0.05) * 1000]}
                  onValueChange={([value]) => updateLocalSetting("performance", { keyboard_speed: value / 1000 })}
                  min={10}
                  max={200}
                  step={5}
                  className="mt-2"
                />
                <p className="text-xs text-stone-500 mt-1">
                  {Math.round((config.performance?.keyboard_speed || 0.05) * 1000)}ms delay
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-stone-200">Enable Caching</Label>
                  <p className="text-xs text-stone-500">Cache frequent operations</p>
                </div>
                <Switch
                  checked={config.performance?.enable_caching !== false}
                  onCheckedChange={(checked) => updateLocalSetting("performance", { enable_caching: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex gap-3 justify-center pt-4"
      >
        <Button
          onClick={saveAllChanges}
          disabled={saving || !hasUnsavedChanges}
          className={`${
            hasUnsavedChanges 
              ? 'bg-orange-500 hover:bg-orange-600' 
              : 'bg-stone-700'
          } text-white shadow-lg ${hasUnsavedChanges ? 'shadow-orange-500/20' : ''} border-0 px-8 h-11`}
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : hasUnsavedChanges ? "Save Changes" : "No Changes"}
        </Button>
        <Button
          onClick={handleRestoreDefaults}
          disabled={saving}
          variant="outline"
          className="border-stone-700 hover:bg-stone-800 text-stone-300 px-6 h-11"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Restore Defaults
        </Button>
      </motion.div>
    </div>
  );
}
import React, { useState, useEffect, useCallback } from "react";
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/config');
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
      }
    } catch (error) {
      console.error("Error loading config:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updateSetting = async (section, settings) => {
    try {
      const response = await fetch('http://127.0.0.1:8000/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, settings })
      });

      if (response.ok) {
        // Reload config to get the updated state
        await loadConfig();

        // Notify other components that config has changed
        window.dispatchEvent(new CustomEvent('axela-config-changed', {
          detail: { section, settings }
        }));
      }
    } catch (error) {
      console.error(`Error updating ${section}:`, error);
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
                onClick={() => updateSetting("app", { mode: "manual" })}
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
                onClick={() => updateSetting("app", { mode: "ai" })}
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
                onClick={() => updateSetting("app", { mode: "chat" })}
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
                  onValueChange={(value) => updateSetting("security", { level: value })}
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
                  onCheckedChange={(checked) => updateSetting("security", { enable_logging: checked })}
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
                <Label className="text-stone-200">Enable Voice Input</Label>
                <Switch
                  checked={config.voice?.enabled !== false}
                  onCheckedChange={(checked) => updateSetting("voice", { enabled: checked })}
                />
              </div>
              <div>
                <Label className="text-stone-200">TTS Volume</Label>
                <Slider
                  value={[config.voice?.tts_volume * 100 || 80]}
                  onValueChange={([value]) => updateSetting("voice", { tts_volume: value / 100 })}
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
                  onValueChange={([value]) => updateSetting("voice", { tts_rate: value })}
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
                  onValueChange={([value]) => updateSetting("performance", { mouse_speed: value })}
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
                  onValueChange={([value]) => updateSetting("performance", { keyboard_speed: value / 1000 })}
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
                  onCheckedChange={(checked) => updateSetting("performance", { enable_caching: checked })}
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
          onClick={handleRestoreDefaults}
          disabled={saving}
          variant="outline"
          className="border-orange-700 hover:bg-orange-900/30 text-orange-400"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          {saving ? "Restoring..." : "Restore Default Settings"}
        </Button>
      </motion.div>
    </div>
  );
}
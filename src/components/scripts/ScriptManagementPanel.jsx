
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserSettings, Script } from "@/api/entities";
import { FileText, Trash2, SlidersHorizontal, Info, Plus, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ScriptManagementPanel() {
  const [settings, setSettings] = useState(null);
  const [scripts, setScripts] = useState([]);
  const [newScript, setNewScript] = useState({ name: "", prompt: "" });
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [userSettings, savedScripts] = await Promise.all([
        UserSettings.list(),
        Script.list('-created_date')
      ]);

      if (userSettings.length > 0) {
        setSettings(userSettings[0]);
      } else {
        const newSettings = await UserSettings.create({});
        setSettings(newSettings);
      }
      setScripts(savedScripts);
    } catch (error) {
      console.error("Error loading script management data:", error);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleThresholdChange = async (value) => {
    if (!settings) return;
    const newThreshold = value[0];
    const newSettings = { ...settings, script_creation_threshold: newThreshold };
    setSettings(newSettings);
    try {
      await UserSettings.update(settings.id, { script_creation_threshold: newThreshold });
    } catch (error) {
      console.error("Error saving script threshold:", error);
      setSettings(settings);
    }
  };

  const deleteScript = async (scriptId) => {
    try {
      await Script.delete(scriptId);
      setScripts(prev => prev.filter(s => s.id !== scriptId));
    } catch (error) {
      console.error("Error deleting script:", error);
    }
  };

  const handleSaveScript = async () => {
    if (!newScript.name.trim() || !newScript.prompt.trim()) return;
    
    setIsSaving(true);
    try {
      const savedScript = await Script.create({
        name: newScript.name.trim(),
        prompt: newScript.prompt.trim(),
        usage_count: 1
      });
      
      setScripts(prev => [savedScript, ...prev]);
      setNewScript({ name: "", prompt: "" });
    } catch (error) {
      console.error("Error saving script:", error);
    }
    setIsSaving(false);
  };

  if (!settings) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40 scrollbar-thumb-rounded-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-3xl font-bold mb-2">Script Management</h1>
        <p className="text-primary">Automate your frequent queries</p>
      </motion.div>

      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Create New Script
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="script-name">Script Name</Label>
                  <Input
                    id="script-name"
                    placeholder="Enter script name..."
                    value={newScript.name}
                    onChange={(e) => setNewScript(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="script-prompt">Script Content</Label>
                  <Textarea
                    id="script-prompt"
                    placeholder="Enter your script content or prompt..."
                    className="min-h-[80px] resize-none"
                    value={newScript.prompt}
                    onChange={(e) => setNewScript(prev => ({ ...prev, prompt: e.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={handleSaveScript}
                  disabled={!newScript.name.trim() || !newScript.prompt.trim() || isSaving}
                  className="bg-primary hover:bg-primary/90"
                >
                  {isSaving ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Save className="w-4 h-4 mr-2" />
                    </motion.div>
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Script
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-primary" />
                  Auto-Creation Threshold
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Label htmlFor="threshold-slider">
                  Save a query as a script after it's used
                </Label>
                <div className="px-3 py-2 bg-muted rounded-md">
                  <Slider
                    id="threshold-slider"
                    value={[settings.script_creation_threshold]}
                    onValueChange={handleThresholdChange}
                    max={20}
                    min={2}
                    step={1}
                  />
                </div>
                <div className="text-center font-bold text-lg text-primary mt-2">
                  {settings.script_creation_threshold} times
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground p-3 bg-secondary rounded-lg">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>This feature is in development. Setting a threshold will enable automatic script creation in a future update.</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Saved Scripts ({scripts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ScrollArea className="flex-1 max-h-96 pr-4 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40 scrollbar-thumb-rounded-full">
                  <AnimatePresence>
                    {scripts.length > 0 ? (
                      <div className="space-y-2">
                        {scripts.map((script) => (
                          <motion.div
                            key={script.id}
                            layout
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="flex flex-col p-3 bg-secondary rounded-lg group"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-medium text-foreground truncate pr-2" title={script.name}>
                                {script.name}
                              </p>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                                onClick={() => deleteScript(script.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2" title={script.prompt}>
                              {script.prompt}
                            </p>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-center text-muted-foreground p-4">
                        <p>No scripts saved yet. Create one using the form or they will appear here once auto-created.</p>
                      </div>
                    )}
                  </AnimatePresence>
                </ScrollArea>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

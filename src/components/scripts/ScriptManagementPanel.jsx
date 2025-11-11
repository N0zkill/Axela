
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserSettings, Script } from "@/api/entities";
import { FileText, Trash2, SlidersHorizontal, Info, Plus, Save, Play, Search, RefreshCw, PlusCircle, Edit, Square } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import CommandBlock from "./CommandBlock";
import { generateCommandText } from "@/api/commandBlocks";
import { useAuth } from "@/contexts/AuthContext";
import { useAxelaAPI } from "@/hooks/useAxelaAPI";

export default function ScriptManagementPanel() {
  const { user } = useAuth();
  const axelaAPI = useAxelaAPI();
  const [settings, setSettings] = useState(null);
  const [scripts, setScripts] = useState([]);
  const [newScript, setNewScript] = useState({ name: "", description: "", category: "General" });
  const [commandBlocks, setCommandBlocks] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingScriptId, setExecutingScriptId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categories, setCategories] = useState([]);
  const [executionResults, setExecutionResults] = useState({});
  const [editingScript, setEditingScript] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.id) {
      console.error("Cannot load scripts: user not authenticated");
      return;
    }

    try {
      const [userSettings, savedScripts, scriptCategories] = await Promise.all([
        UserSettings.list(),
        Script.list(user.id, '-created_date'),
        Script.getCategories()
      ]);

      if (userSettings.length > 0) {
        setSettings(userSettings[0]);
      } else {
        const newSettings = await UserSettings.create({});
        setSettings(newSettings);
      }
      setScripts(savedScripts);
      setCategories(scriptCategories);
    } catch (error) {
      console.error("Error loading script management data:", error);
    }
  }, [user?.id]);

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

  const parseCommandText = (commandText) => {

    // Mouse commands
    if (commandText.includes('click at')) {
      const match = commandText.match(/click at (\d+), (\d+)/);
      if (match) {
        return {
          commandType: 'mouse',
          action: 'click',
          parameters: {
            x: parseInt(match[1]),
            y: parseInt(match[2]),
            button: 'left'
          }
        };
      }
    }

    if (commandText.includes('double click at')) {
      const match = commandText.match(/double click at (\d+), (\d+)/);
      if (match) {
        return {
          commandType: 'mouse',
          action: 'double_click',
          parameters: {
            x: parseInt(match[1]),
            y: parseInt(match[2]),
            button: 'left'
          }
        };
      }
    }

    if (commandText.includes('right click at')) {
      const match = commandText.match(/right click at (\d+), (\d+)/);
      if (match) {
        return {
          commandType: 'mouse',
          action: 'right_click',
          parameters: {
            x: parseInt(match[1]),
            y: parseInt(match[2]),
            button: 'right'
          }
        };
      }
    }

    if (commandText.includes('scroll')) {
      const match = commandText.match(/scroll (up|down) (\d+) times/);
      if (match) {
        return {
          commandType: 'mouse',
          action: 'scroll',
          parameters: {
            direction: match[1],
            amount: parseInt(match[2])
          }
        };
      }
    }

    if (commandText.includes('drag from')) {
      const match = commandText.match(/drag from (\d+), (\d+) to (\d+), (\d+)/);
      if (match) {
        return {
          commandType: 'mouse',
          action: 'drag',
          parameters: {
            start_x: parseInt(match[1]),
            start_y: parseInt(match[2]),
            end_x: parseInt(match[3]),
            end_y: parseInt(match[4])
          }
        };
      }
    }

    // Keyboard commands
    if (commandText.includes('type "')) {
      const match = commandText.match(/type "([^"]+)"/);
      if (match) {
        return {
          commandType: 'keyboard',
          action: 'type',
          parameters: {
            text: match[1]
          }
        };
      }
    }

    if (commandText.includes('press ') && !commandText.includes('press ')) {
      const match = commandText.match(/press ([^"]+)/);
      if (match) {
        return {
          commandType: 'keyboard',
          action: 'press_key',
          parameters: {
            key: match[1]
          }
        };
      }
    }

    // Screenshot commands
    if (commandText.includes('take screenshot')) {
      const match = commandText.match(/take screenshot(?: and save as (.+))?/);
      if (match) {
        return {
          commandType: 'screenshot',
          action: 'capture',
          parameters: {
            filename: match[1] || ''
          }
        };
      }
    }

    if (commandText.includes('capture region')) {
      const match = commandText.match(/capture region at (\d+), (\d+) \((\d+)x(\d+)\)(?: and save as (.+))?/);
      if (match) {
        return {
          commandType: 'screenshot',
          action: 'capture_region',
          parameters: {
            x: parseInt(match[1]),
            y: parseInt(match[2]),
            width: parseInt(match[3]),
            height: parseInt(match[4]),
            filename: match[5] || ''
          }
        };
      }
    }

    // System commands
    if (commandText.includes('wait ') && commandText.includes(' seconds')) {
      const match = commandText.match(/wait ([\d.]+) seconds/);
      if (match) {
        return {
          commandType: 'system',
          action: 'sleep',
          parameters: {
            duration: parseFloat(match[1])
          }
        };
      }
    }

    if (commandText.includes('shutdown computer')) {
      const match = commandText.match(/shutdown computer(?: in (\d+) seconds)?/);
      if (match) {
        return {
          commandType: 'system',
          action: 'shutdown',
          parameters: {
            delay: match[1] ? parseInt(match[1]) : 0
          }
        };
      }
    }

    if (commandText.includes('restart computer')) {
      const match = commandText.match(/restart computer(?: in (\d+) seconds)?/);
      if (match) {
        return {
          commandType: 'system',
          action: 'restart',
          parameters: {
            delay: match[1] ? parseInt(match[1]) : 0
          }
        };
      }
    }

    // Program commands
    if (commandText.includes('start ')) {
      const match = commandText.match(/start (.+)/);
      if (match) {
        return {
          commandType: 'program',
          action: 'start',
          parameters: {
            program: match[1]
          }
        };
      }
    }

    if (commandText.includes('close ')) {
      const match = commandText.match(/close (.+)/);
      if (match) {
        return {
          commandType: 'program',
          action: 'close',
          parameters: {
            program: match[1]
          }
        };
      }
    }

    // Web commands
    if (commandText.includes('search for')) {
      const match = commandText.match(/search for "([^"]+)"/);
      if (match) {
        return {
          commandType: 'web',
          action: 'search',
          parameters: {
            query: match[1]
          }
        };
      }
    }

    if (commandText.includes('go to')) {
      const match = commandText.match(/go to (.+)/);
      if (match) {
        return {
          commandType: 'web',
          action: 'navigate',
          parameters: {
            url: match[1]
          }
        };
      }
    }

    // Default fallback
    return {
      commandType: '',
      action: '',
      parameters: {}
    };
  };

  const editScript = (script) => {
    setEditingScript(script);
    setIsEditing(true);

    let recurringValue = 1;
    let recurringUnit = 'hours';
    if (script.is_recurring && script.recurring_interval) {
      const parsed = parseInterval(script.recurring_interval);
      recurringValue = parsed.value;
      recurringUnit = parsed.unit;
    }

    setNewScript({
      name: script.name,
      description: script.description,
      category: script.category,
      isRecurring: script.is_recurring || false,
      recurringValue: recurringValue,
      recurringUnit: recurringUnit
    });

    if (script.commands && script.commands.length > 0) {
      const loadedBlocks = script.commands.map(cmd => {
        const parsed = parseCommandText(cmd.text);
        return {
          id: cmd.id,
          commandType: parsed.commandType,
          action: parsed.action,
          parameters: parsed.parameters
        };
      });
      setCommandBlocks(loadedBlocks);
    } else {
      setCommandBlocks([]);
    }

    // Auto-scroll to the editing section
    setTimeout(() => {
      const editingSection = document.querySelector('[data-editing-section]');
      if (editingSection) {
        editingSection.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }, 100);
  };

  const cancelEdit = () => {
    setEditingScript(null);
    setIsEditing(false);
    setNewScript({ name: "", description: "", category: "General" });
    setCommandBlocks([]);
  };

  const parseInterval = (interval) => {
    if (!interval) return { value: 1, unit: 'hours' };

    const match = interval.match(/^(\d+)([smhd])$/);
    if (match) {
      const value = parseInt(match[1]);
      const unitMap = { s: 'seconds', m: 'minutes', h: 'hours', d: 'days' };
      return { value, unit: unitMap[match[2]] || 'hours' };
    }

    return { value: 1, unit: 'hours' };
  };

  const addCommandBlock = () => {
    const newBlock = {
      id: Date.now().toString(),
      commandType: '',
      action: '',
      parameters: {}
    };
    setCommandBlocks(prev => [...prev, newBlock]);
  };

  const updateCommandBlock = (index, updatedBlock) => {
    setCommandBlocks(prev => {
      const updated = prev.map((block, i) =>
        i === index ? { ...block, ...updatedBlock } : block
      );
      return updated;
    });
  };

  const deleteCommandBlock = (index) => {
    setCommandBlocks(prev => prev.filter((_, i) => i !== index));
  };

  const moveCommandBlock = (index, direction) => {
    const newBlocks = [...commandBlocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex >= 0 && targetIndex < newBlocks.length) {
      [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
      setCommandBlocks(newBlocks);
    }
  };

  const generateScriptPrompt = () => {
    const prompt = commandBlocks
      .filter(block => block.commandType && block.action)
      .map(block => generateCommandText(block.commandType, block.action, block.parameters))
      .join('; ');
    return prompt;
  };

  const handleSaveScript = async () => {
    if (!newScript.name.trim() || commandBlocks.length === 0) {
      return;
    }

    setIsSaving(true);
    try {
      const scriptPrompt = generateScriptPrompt();
      if (!scriptPrompt.trim()) {
        alert('Please add at least one valid command block');
        setIsSaving(false);
        return;
      }

      const scriptData = {
        name: newScript.name.trim(),
        prompt: scriptPrompt,
        description: newScript.description.trim(),
        category: newScript.category,
        is_recurring: newScript.isRecurring || false,
        recurring_interval: newScript.isRecurring && newScript.recurringValue && newScript.recurringUnit
          ? `${newScript.recurringValue}${newScript.recurringUnit.charAt(0)}`
          : null,
        recurring_enabled: false,
        commands: commandBlocks.map(block => ({
          id: block.id,
          text: generateCommandText(block.commandType, block.action, block.parameters),
          description: `${block.commandType} ${block.action}`,
          order: commandBlocks.indexOf(block),
          isEnabled: true
        }))
      };


      if (!user?.id) {
        console.error("Cannot save script: user not authenticated");
        setIsSaving(false);
        return;
      }

      let savedScript;
      if (isEditing && editingScript) {
        // Update existing script
        savedScript = await Script.update(editingScript.id, scriptData);
        setScripts(prev => prev.map(s => s.id === editingScript.id ? savedScript : s));
        cancelEdit();
      } else {
        // Create new script
        savedScript = await Script.create(user.id, scriptData);
        setScripts(prev => [savedScript, ...prev]);
        setNewScript({ name: "", description: "", category: "General" });
        setCommandBlocks([]);
      }
    } catch (error) {
      console.error("Error saving script:", error);
    }
    setIsSaving(false);
  };

  const executeScript = async (scriptId) => {
    setIsExecuting(true);
    setExecutingScriptId(scriptId);

    try {
      const script = scripts.find(s => s.id === scriptId);

      if (!script) {
        throw new Error("Script not found");
      }

      // If it's a recurring script, enable recurring execution
      if (script && script.is_recurring) {
        await Script.enableRecurring(scriptId, script.recurring_interval);
      }

      const result = await script.execute(axelaAPI, user?.id);

      setExecutionResults(prev => ({
        ...prev,
        [scriptId]: result
      }));

      // Refresh scripts to update usage count
      await loadData();
    } catch (error) {
      console.error("Error executing script:", error);
      setExecutionResults(prev => ({
        ...prev,
        [scriptId]: { success: false, message: error.message }
      }));
    }

    setIsExecuting(false);
    setExecutingScriptId(null);
  };

  const stopRecurringScript = async (scriptId) => {
    try {
      await Script.disableRecurring(scriptId);
      await loadData(); // Refresh to update the UI
    } catch (error) {
      console.error("Error stopping recurring script:", error);
    }
  };

  const searchScripts = async () => {
    if (!user?.id) {
      console.error("Cannot search scripts: user not authenticated");
      return;
    }

    if (!searchQuery.trim()) {
      await loadData();
      return;
    }

    try {
      const results = await Script.search(user.id, searchQuery);
      setScripts(results);
    } catch (error) {
      console.error("Error searching scripts:", error);
    }
  };

  const refreshScripts = async () => {
    await loadData();
  };

  if (!settings) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-4xl font-bold mb-3 text-orange-400">
          Script Builder
        </h1>
        <p className="text-lg text-stone-400 max-w-2xl mx-auto">
          Create powerful automation scripts using visual command blocks. No coding required.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Script Creation Panel */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="xl:col-span-2 space-y-6"
        >
          <Card className={`border border-stone-800/50 shadow-lg bg-stone-900/50 backdrop-blur-xl ${isEditing ? 'ring-2 ring-orange-500/50 shadow-orange-500/20' : ''}`} data-editing-section>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-xl text-white">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <Plus className="w-5 h-5 text-orange-400" />
                </div>
{isEditing ? 'Edit Script' : 'Create New Script'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Script Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="script-name" className="text-sm font-medium">Script Name</Label>
                  <Input
                    id="script-name"
                    placeholder="My awesome script..."
                    value={newScript.name}
                    onChange={(e) => setNewScript(prev => ({ ...prev, name: e.target.value }))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="script-category" className="text-sm font-medium">Category</Label>
                  <Select value={newScript.category} onValueChange={(value) => setNewScript(prev => ({ ...prev, category: value }))}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="script-description" className="text-sm font-medium">Description</Label>
                <Textarea
                  id="script-description"
                  placeholder="Describe what this script does..."
                  className="min-h-[80px] resize-none"
                  value={newScript.description}
                  onChange={(e) => setNewScript(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              {/* Command Blocks */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold text-white">Command Blocks</Label>
                  <Button
                    onClick={addCommandBlock}
                    className="bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 border-0"
                  >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Add Command
                  </Button>
                </div>

                {commandBlocks.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-stone-700/50 rounded-xl bg-stone-800/30">
                    <div className="space-y-3">
                      <div className="w-16 h-16 mx-auto bg-stone-800/50 rounded-full flex items-center justify-center">
                        <PlusCircle className="w-8 h-8 text-stone-400" />
                      </div>
                      <div>
                        <p className="font-medium text-stone-300">No commands yet</p>
                        <p className="text-sm text-stone-500">Start building your script by adding command blocks</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <AnimatePresence>
                      {commandBlocks.map((block, index) => (
                        <CommandBlock
                          key={block.id}
                          block={block}
                          index={index}
                          onUpdate={updateCommandBlock}
                          onDelete={deleteCommandBlock}
                          onMoveUp={(idx) => moveCommandBlock(idx, 'up')}
                          onMoveDown={(idx) => moveCommandBlock(idx, 'down')}
                          isFirst={index === 0}
                          isLast={index === commandBlocks.length - 1}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {/* Generated Script Preview */}
                {commandBlocks.length > 0 && (
                  <Card className="bg-orange-500/10 border-orange-500/30">
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-orange-400">Generated Script</Label>
                        <div className="p-3 bg-stone-800/50 rounded-lg border border-stone-700/50 font-mono text-sm text-stone-200">
                          {generateScriptPrompt() || 'Add command blocks to generate script...'}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recurring Options */}
                <Card className="bg-blue-500/10 border-blue-500/30">
                  <CardContent className="p-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-blue-400">Recurring Execution</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="isRecurring"
                            checked={newScript.isRecurring || false}
                            onChange={(e) => setNewScript(prev => ({ ...prev, isRecurring: e.target.checked }))}
                            className="w-4 h-4 text-blue-600 bg-stone-800 border-stone-600 rounded focus:ring-blue-500 focus:ring-2"
                          />
                          <Label htmlFor="isRecurring" className="text-sm text-stone-300">Enable</Label>
                        </div>
                      </div>

                      {newScript.isRecurring && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-sm font-medium text-blue-400">Value</Label>
                              <Input
                                type="number"
                                min="1"
                                max="999"
                                value={newScript.recurringValue || 1}
                                onChange={(e) => setNewScript(prev => ({
                                  ...prev,
                                  recurringValue: parseInt(e.target.value) || 1
                                }))}
                                placeholder="1"
                                className="h-10 text-left"
                              />
                            </div>
                            <div>
                              <Label className="text-sm font-medium text-blue-400">Unit</Label>
                              <Select
                                value={newScript.recurringUnit || 'hours'}
                                onValueChange={(value) => setNewScript(prev => ({ ...prev, recurringUnit: value }))}
                              >
                                <SelectTrigger className="h-10 text-left">
                                  <SelectValue placeholder="Select unit" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="seconds">Seconds</SelectItem>
                                  <SelectItem value="minutes">Minutes</SelectItem>
                                  <SelectItem value="hours">Hours</SelectItem>
                                  <SelectItem value="days">Days</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="text-xs text-blue-300/70">
                            Script will automatically execute every {newScript.recurringValue || 1} {newScript.recurringUnit || 'hours'}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Save Button */}
              <div className="flex justify-end gap-3 pt-4 border-t border-stone-800/50">
                {isEditing && (
                  <Button
                    onClick={cancelEdit}
                    variant="outline"
                    className="border-stone-700 hover:border-orange-500/50 hover:bg-orange-500/10 text-stone-300 hover:text-orange-400"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={handleSaveScript}
                  disabled={!newScript.name.trim() || commandBlocks.length === 0 || isSaving}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-8 h-11 shadow-lg shadow-orange-500/20 border-0"
                  size="lg"
                >
                  {isSaving ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="mr-2"
                    >
                      <Save className="w-4 h-4" />
                    </motion.div>
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {isEditing ? 'Update Script' : 'Save Script'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {/* Scripts List */}
          <Card className="border border-stone-800/50 shadow-lg bg-stone-900/50 backdrop-blur-xl">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3 text-lg text-white">
                  <div className="p-2 bg-orange-500/20 rounded-lg">
                    <FileText className="w-4 h-4 text-orange-400" />
                  </div>
                  Saved Scripts
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshScripts}
                  className="h-8 border-stone-700 hover:border-orange-500/50 hover:bg-orange-500/10 text-stone-300 hover:text-orange-400"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Search scripts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9"
                />
                <Button
                  variant="outline"
                  onClick={searchScripts}
                  className="h-9 px-3 border-stone-700 hover:border-orange-500/50 hover:bg-orange-500/10 text-stone-300 hover:text-orange-400"
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="p-4 space-y-3">
                  {scripts.length > 0 ? (
                    <AnimatePresence>
                      {scripts.map((script) => (
                        <motion.div
                          key={script.id}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className={`group p-4 bg-stone-800/30 rounded-lg border border-stone-700/50 hover:border-orange-500/30 transition-all duration-200 hover:shadow-sm ${editingScript && editingScript.id === script.id ? 'ring-2 ring-orange-500/50 bg-orange-500/10' : ''}`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-white truncate" title={script.name}>
                                  {script.name}
                                </h3>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="secondary" className="text-xs bg-stone-700/50 text-stone-300 border-stone-600">
                                    {script.category}
                                  </Badge>
                                  {script.is_recurring && script.recurring_enabled && (
                                    <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/50">
                                      🔄 {(() => {
                                        const { value, unit } = parseInterval(script.recurring_interval);
                                        return `${value} ${unit}`;
                                      })()}
                                    </Badge>
                                  )}
                                  <span className="text-xs text-stone-400">
                                    Used {script.usage_count} times
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-8 w-8 p-0 ${
                                    script.is_recurring && script.recurring_enabled && script.next_execution
                                      ? "text-red-600 hover:text-red-700 hover:bg-red-50"
                                      : "text-green-600 hover:text-green-700 hover:bg-green-50"
                                  }`}
                                  onClick={() =>
                                    script.is_recurring && script.recurring_enabled && script.next_execution
                                      ? stopRecurringScript(script.id)
                                      : executeScript(script.id)
                                  }
                                  disabled={isExecuting && executingScriptId === script.id}
                                >
                                  {isExecuting && executingScriptId === script.id ? (
                                    <motion.div
                                      animate={{ rotate: 360 }}
                                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                    >
                                      <RefreshCw className="w-4 h-4" />
                                    </motion.div>
                                  ) : script.is_recurring && script.recurring_enabled && script.next_execution ? (
                                    <Square className="w-4 h-4" />
                                  ) : (
                                    <Play className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                  onClick={() => editScript(script)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  onClick={() => deleteScript(script.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            <p className="text-sm text-stone-400 line-clamp-2" title={script.prompt}>
                              {script.prompt}
                            </p>

                            {script.description && (
                              <p className="text-xs text-stone-500 line-clamp-1" title={script.description}>
                                {script.description}
                              </p>
                            )}

                            {executionResults[script.id] && (
                              <div className={`p-2 rounded-md text-xs border ${
                                executionResults[script.id].success
                                  ? 'bg-green-500/10 text-green-400 border-green-500/30'
                                  : 'bg-red-500/10 text-red-400 border-red-500/30'
                              }`}>
                                {executionResults[script.id].success ? (
                                  <div className="flex items-center gap-1">
                                    <span>✅</span>
                                    <span>Executed successfully</span>
                                    {executionResults[script.id].execution_time && (
                                      <span className="ml-auto">({executionResults[script.id].execution_time.toFixed(2)}s)</span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span>❌</span>
                                    <span>Failed: {executionResults[script.id].message}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  ) : (
                    <div className="text-center py-8 text-stone-400">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No scripts yet</p>
                      <p className="text-sm">Create your first script to get started</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Settings Panel */}
          <Card className="border border-stone-800/50 shadow-lg bg-stone-900/50 backdrop-blur-xl">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg text-white">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <SlidersHorizontal className="w-4 h-4 text-orange-400" />
                </div>
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium text-white">
                  Auto-Creation Threshold
                </Label>
                <div className="px-3 py-2 bg-stone-800/50 rounded-lg">
                  <Slider
                    value={[settings.script_creation_threshold]}
                    onValueChange={handleThresholdChange}
                    max={20}
                    min={2}
                    step={1}
                    className="w-full"
                  />
                </div>
                <div className="text-center">
                  <Badge variant="outline" className="text-sm bg-stone-700/50 text-stone-300 border-stone-600">
                    {settings.script_creation_threshold} times
                  </Badge>
                </div>
                <div className="flex items-start gap-2 text-xs text-stone-400 p-3 bg-stone-800/30 rounded-lg">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Automatically save frequently used commands as scripts</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

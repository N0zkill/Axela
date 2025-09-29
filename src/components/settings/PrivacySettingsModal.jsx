import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Save, Loader2 } from "lucide-react";

export default function PrivacySettingsModal({ open, onOpenChange, initialSettings, onSave }) {
  const [localSettings, setLocalSettings] = useState(initialSettings);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (initialSettings) {
      setLocalSettings(initialSettings);
    }
  }, [initialSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(localSettings);
    setIsSaving(false);
    onOpenChange(false);
  };
  
  if (!localSettings) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>Privacy & Data</DialogTitle>
          <DialogDescription>
            Manage how your data is stored and used.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="history-slider">Keep conversation history for</Label>
            <div className="px-3 py-2 bg-muted rounded-md">
              <Slider
                id="history-slider"
                value={[localSettings.conversation_history_days]}
                onValueChange={(value) => setLocalSettings(prev => ({...prev, conversation_history_days: value[0]}))}
                max={90}
                min={1}
                step={1}
                className="w-full"
              />
              <div className="text-center text-sm mt-2">
                {localSettings.conversation_history_days} days
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="notifications-switch">Notifications</Label>
            <Switch
              id="notifications-switch"
              checked={localSettings.notifications_enabled}
              onCheckedChange={(checked) => setLocalSettings(prev => ({...prev, notifications_enabled: checked}))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
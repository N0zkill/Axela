export class UserSettings {
  constructor(data = {}) {
    this.theme = data.theme || 'dark';
    this.aiMode = data.aiMode !== undefined ? data.aiMode : true;
    this.voiceEnabled = data.voiceEnabled !== undefined ? data.voiceEnabled : false;
    this.notifications = data.notifications !== undefined ? data.notifications : true;
    this.autoMinimize = data.autoMinimize !== undefined ? data.autoMinimize : false;
    this.keyboardSpeed = data.keyboardSpeed || 0.05;
    this.mouseSpeed = data.mouseSpeed || 1.0;
    this.securityLevel = data.securityLevel || 'safe_mode';
    this.customColors = data.customColors || {};
    this.privacyMode = data.privacyMode !== undefined ? data.privacyMode : false;
  }

  async save() {
    if (window.electronAPI?.setSetting) {
      await window.electronAPI.setSetting('userSettings', this);
    }
    return this;
  }

  static async load() {
    if (window.electronAPI?.getSetting) {
      const data = await window.electronAPI.getSetting('userSettings') || {};
      return new UserSettings(data);
    }
    return new UserSettings();
  }

  toJSON() {
    return {
      theme: this.theme,
      aiMode: this.aiMode,
      voiceEnabled: this.voiceEnabled,
      notifications: this.notifications,
      autoMinimize: this.autoMinimize,
      keyboardSpeed: this.keyboardSpeed,
      mouseSpeed: this.mouseSpeed,
      securityLevel: this.securityLevel,
      customColors: this.customColors,
      privacyMode: this.privacyMode
    };
  }
}

export class Conversation {
  constructor(data = {}) {
    this.id = data.id || Date.now().toString();
    this.title = data.title || 'New Conversation';
    this.messages = data.messages || [];
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.isActive = data.isActive !== undefined ? data.isActive : false;
  }

  addMessage(message) {
    this.messages.push({
      id: Date.now().toString(),
      content: message.content,
      role: message.role || 'user',
      timestamp: new Date().toISOString(),
      success: message.success,
      data: message.data
    });
    this.updatedAt = new Date().toISOString();
    return this;
  }

  getLastMessage() {
    return this.messages[this.messages.length - 1] || null;
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      messages: this.messages,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isActive: this.isActive
    };
  }

  static fromJSON(data) {
    return new Conversation(data);
  }
}

export class Script {
  constructor(data = {}) {
    this.id = data.id || Date.now().toString();
    this.name = data.name || 'Untitled Script';
    this.description = data.description || '';
    this.commands = data.commands || [];
    this.category = data.category || 'General';
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.isFavorite = data.isFavorite !== undefined ? data.isFavorite : false;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.executionCount = data.executionCount || 0;
    this.lastExecuted = data.lastExecuted || null;
  }

  addCommand(command) {
    this.commands.push({
      id: Date.now().toString(),
      text: command.text,
      description: command.description || '',
      order: this.commands.length,
      isEnabled: command.isEnabled !== undefined ? command.isEnabled : true
    });
    this.updatedAt = new Date().toISOString();
    return this;
  }

  removeCommand(commandId) {
    this.commands = this.commands.filter(cmd => cmd.id !== commandId);
    this.updatedAt = new Date().toISOString();
    return this;
  }

  async execute(axelaAPI) {
    this.executionCount++;
    this.lastExecuted = new Date().toISOString();
    this.updatedAt = new Date().toISOString();

    const results = [];

    for (const command of this.commands) {
      if (!command.isEnabled) continue;

      try {
        const result = await axelaAPI.executeCommand(command.text);
        results.push({
          command: command.text,
          success: result.success,
          message: result.message,
          data: result.data
        });
      } catch (error) {
        results.push({
          command: command.text,
          success: false,
          message: error.message
        });
      }
    }

    return {
      scriptId: this.id,
      scriptName: this.name,
      totalCommands: this.commands.length,
      executedCommands: results.length,
      results: results,
      success: results.every(r => r.success)
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      commands: this.commands,
      category: this.category,
      isActive: this.isActive,
      isFavorite: this.isFavorite,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      executionCount: this.executionCount,
      lastExecuted: this.lastExecuted
    };
  }

  static fromJSON(data) {
    return new Script(data);
  }
}

export default {
  UserSettings,
  Conversation,
  Script
};

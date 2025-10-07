let settingsStore = [];
let settingsIdCounter = 1;

export class UserSettings {
  constructor(data = {}) {
    this.id = data.id || settingsIdCounter++;
    this.theme = data.theme || 'dark';
    this.primary_color = data.primary_color || '#2563EB';
    this.voice_enabled = data.voice_enabled !== undefined ? data.voice_enabled : true;
    this.voice_language = data.voice_language || 'en-US';
    this.assistant_personality = data.assistant_personality || 'friendly';
    this.auto_speak_responses = data.auto_speak_responses !== undefined ? data.auto_speak_responses : false;
    this.notifications_enabled = data.notifications_enabled !== undefined ? data.notifications_enabled : true;
    this.conversation_history_days = data.conversation_history_days || 30;
    this.script_creation_threshold = data.script_creation_threshold || 5;

    this.aiMode = data.aiMode !== undefined ? data.aiMode : true;
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
    const index = settingsStore.findIndex(s => s.id === this.id);
    if (index !== -1) {
      settingsStore[index] = this;
    } else {
      settingsStore.push(this);
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

  static async list() {
    if (window.electronAPI?.getSetting) {
      const data = await window.electronAPI.getSetting('userSettings');
      if (data) return [new UserSettings(data)];
    }
    return settingsStore.length > 0 ? [...settingsStore] : [];
  }

  static async create(data) {
    const newSettings = new UserSettings(data);
    await newSettings.save();
    return newSettings;
  }

  static async update(id, data) {
    const index = settingsStore.findIndex(s => s.id === id);
    if (index !== -1) {
      Object.assign(settingsStore[index], data);
      await settingsStore[index].save();
      return settingsStore[index];
    }
    return null;
  }

  static async delete(id) {
    settingsStore = settingsStore.filter(s => s.id !== id);
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      theme: this.theme,
      primary_color: this.primary_color,
      voice_enabled: this.voice_enabled,
      voice_language: this.voice_language,
      assistant_personality: this.assistant_personality,
      auto_speak_responses: this.auto_speak_responses,
      notifications_enabled: this.notifications_enabled,
      conversation_history_days: this.conversation_history_days,
      script_creation_threshold: this.script_creation_threshold,
      aiMode: this.aiMode,
      autoMinimize: this.autoMinimize,
      keyboardSpeed: this.keyboardSpeed,
      mouseSpeed: this.mouseSpeed,
      securityLevel: this.securityLevel,
      customColors: this.customColors,
      privacyMode: this.privacyMode
    };
  }
}

let conversationsStore = [];
let conversationIdCounter = 1;

export class Conversation {
  constructor(data = {}) {
    this.id = data.id || conversationIdCounter++;
    this.title = data.title || 'New Conversation';
    this.messages = data.messages || [];
    this.created_date = data.created_date || data.createdAt || new Date().toISOString();
    this.updated_date = data.updated_date || data.updatedAt || new Date().toISOString();
    this.isActive = data.isActive !== undefined ? data.isActive : false;
  }

  addMessage(message) {
    this.messages.push({
      id: Date.now().toString(),
      content: message.content,
      sender: message.sender || message.role || 'user',
      role: message.role || message.sender || 'user',
      timestamp: new Date().toISOString(),
      type: message.type || 'text',
      success: message.success,
      data: message.data
    });
    this.updated_date = new Date().toISOString();
    return this;
  }

  getLastMessage() {
    return this.messages[this.messages.length - 1] || null;
  }

  static async list(sortBy = '-updated_date') {
    return [...conversationsStore].sort((a, b) => {
      if (sortBy.startsWith('-')) {
        return new Date(b.updated_date) - new Date(a.updated_date);
      }
      return new Date(a.updated_date) - new Date(b.updated_date);
    });
  }

  static async create(data) {
    const newConv = new Conversation(data);
    conversationsStore.unshift(newConv);
    return newConv;
  }

  static async update(id, data) {
    const index = conversationsStore.findIndex(c => c.id === id);
    if (index !== -1) {
      Object.assign(conversationsStore[index], data);
      conversationsStore[index].updated_date = new Date().toISOString();
      return conversationsStore[index];
    }
    return null;
  }

  static async delete(id) {
    conversationsStore = conversationsStore.filter(c => c.id !== id);
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      messages: this.messages,
      created_date: this.created_date,
      updated_date: this.updated_date,
      createdAt: this.created_date,
      updatedAt: this.updated_date,
      isActive: this.isActive
    };
  }

  static fromJSON(data) {
    return new Conversation(data);
  }
}

let scriptsStore = [];
let scriptIdCounter = 1;

export class Script {
  constructor(data = {}) {
    this.id = data.id || scriptIdCounter++;
    this.name = data.name || 'Untitled Script';
    this.prompt = data.prompt || data.description || '';
    this.description = data.description || data.prompt || '';
    this.commands = data.commands || [];
    this.category = data.category || 'General';
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.isFavorite = data.isFavorite !== undefined ? data.isFavorite : false;
    this.created_date = data.created_date || data.createdAt || new Date().toISOString();
    this.updated_date = data.updated_date || data.updatedAt || new Date().toISOString();
    this.usage_count = data.usage_count || data.executionCount || 0;
    this.executionCount = data.executionCount || data.usage_count || 0;
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
    this.updated_date = new Date().toISOString();
    return this;
  }

  removeCommand(commandId) {
    this.commands = this.commands.filter(cmd => cmd.id !== commandId);
    this.updated_date = new Date().toISOString();
    return this;
  }

  async execute(axelaAPI) {
    this.executionCount++;
    this.usage_count = this.executionCount;
    this.lastExecuted = new Date().toISOString();
    this.updated_date = new Date().toISOString();

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

  static async list(sortBy = '-created_date') {
    return [...scriptsStore].sort((a, b) => {
      if (sortBy.startsWith('-')) {
        return new Date(b.created_date) - new Date(a.created_date);
      }
      return new Date(a.created_date) - new Date(b.created_date);
    });
  }

  static async create(data) {
    const newScript = new Script(data);
    scriptsStore.unshift(newScript);
    return newScript;
  }

  static async update(id, data) {
    const index = scriptsStore.findIndex(s => s.id === id);
    if (index !== -1) {
      Object.assign(scriptsStore[index], data);
      scriptsStore[index].updated_date = new Date().toISOString();
      return scriptsStore[index];
    }
    return null;
  }

  static async delete(id) {
    scriptsStore = scriptsStore.filter(s => s.id !== id);
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      prompt: this.prompt,
      description: this.description,
      commands: this.commands,
      category: this.category,
      isActive: this.isActive,
      isFavorite: this.isFavorite,
      created_date: this.created_date,
      updated_date: this.updated_date,
      createdAt: this.created_date,
      updatedAt: this.updated_date,
      usage_count: this.usage_count,
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

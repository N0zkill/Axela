import { resolveCommand } from './commandAliases';


export const ExecuteCommand = async (axelaAPI, command, options = {}) => {
  try {
    const resolvedCommand = resolveCommand(command);
    console.log(`Command resolved: "${command}" -> "${resolvedCommand}"`);

    const mode = options.mode || (options.aiMode !== false ? "ai" : "manual");
    return await axelaAPI.executeCommand(resolvedCommand, mode);
  } catch (error) {
    console.error('Command execution error:', error);
    throw error;
  }
};

export const InvokeLLM = async (axelaAPI, messagesOrPrompt, options = {}) => {
  try {
    let command;

    if (Array.isArray(messagesOrPrompt)) {
      const lastMessage = messagesOrPrompt[messagesOrPrompt.length - 1];
      if (!lastMessage || (lastMessage.role !== 'user' && lastMessage.sender !== 'user')) {
        throw new Error('No user message to process');
      }
      command = lastMessage.content;
    } else if (typeof messagesOrPrompt === 'object' && messagesOrPrompt.prompt) {
      command = messagesOrPrompt.prompt;
    } else {
      command = messagesOrPrompt;
    }

    const resolvedCommand = resolveCommand(command);
    const result = await axelaAPI.executeCommand(resolvedCommand, "chat");

    return {
      success: result.success,
      message: {
        id: Date.now().toString(),
        role: 'assistant',
        sender: 'assistant',
        content: result.message || result.response || '',
        timestamp: new Date().toISOString(),
        data: result.data
      },
      usage: {
        prompt_tokens: command.length,
        completion_tokens: (result.message || result.response || '').length,
        total_tokens: command.length + (result.message || result.response || '').length
      }
    };
  } catch (error) {
    console.error('LLM invocation error:', error);
    return {
      success: false,
      message: {
        id: Date.now().toString(),
        role: 'assistant',
        sender: 'assistant',
        content: `I encountered an error: ${error.message}`,
        timestamp: new Date().toISOString(),
        error: true
      }
    };
  }
};

export const GetSystemStatus = async (axelaAPI) => {
  try {
    return await axelaAPI.getStatus();
  } catch (error) {
    console.error('Status check error:', error);
    throw error;
  }
};

export const TakeScreenshot = async (axelaAPI) => {
  try {
    return await axelaAPI.takeScreenshot();
  } catch (error) {
    console.error('Screenshot error:', error);
    throw error;
  }
};

export const FileOperations = {
  openDialog: async (options = {}) => {
    if (window.electronAPI?.showOpenDialog) {
      return await window.electronAPI.showOpenDialog(options);
    }
    throw new Error('File operations not available in this environment');
  },

  saveDialog: async (options = {}) => {
    if (window.electronAPI?.showSaveDialog) {
      return await window.electronAPI.showSaveDialog(options);
    }
    throw new Error('File operations not available in this environment');
  }
};

export const AppControls = {
  minimize: async () => {
    if (window.electronAPI?.appMinimize) {
      return await window.electronAPI.appMinimize();
    }
  },

  maximize: async () => {
    if (window.electronAPI?.appMaximize) {
      return await window.electronAPI.appMaximize();
    }
  },

  quit: async () => {
    if (window.electronAPI?.appQuit) {
      return await window.electronAPI.appQuit();
    }
  }
};

export const ConfigManager = {
  get: async (axelaAPI) => {
    try {
      return await axelaAPI.getConfig();
    } catch (error) {
      console.error('Config get error:', error);
      throw error;
    }
  },

  update: async (axelaAPI, configUpdate) => {
    try {
      return await axelaAPI.updateConfig(configUpdate);
    } catch (error) {
      console.error('Config update error:', error);
      throw error;
    }
  }
};

export default {
  InvokeLLM,
  ExecuteCommand,
  GetSystemStatus,
  TakeScreenshot,
  FileOperations,
  AppControls,
  ConfigManager
};

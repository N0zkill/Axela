import { useAxelaAPI } from '../hooks/useAxelaAPI';

export const InvokeLLM = async (messages, options = {}) => {

  try {
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error('No user message to process');
    }

    const axelaAPI = useAxelaAPI();
    const result = await axelaAPI.executeCommand(lastMessage.content, true);

    return {
      success: result.success,
      message: {
        id: Date.now().toString(),
        role: 'assistant',
        content: result.message,
        timestamp: new Date().toISOString(),
        data: result.data
      },
      usage: {
        prompt_tokens: lastMessage.content.length,
        completion_tokens: result.message.length,
        total_tokens: lastMessage.content.length + result.message.length
      }
    };

  } catch (error) {
    console.error('LLM invocation error:', error);
    return {
      success: false,
      message: {
        id: Date.now().toString(),
        role: 'assistant',
        content: `I encountered an error: ${error.message}`,
        timestamp: new Date().toISOString(),
        error: true
      }
    };
  }
};

export const ExecuteCommand = async (command, options = {}) => {
  try {
    const axelaAPI = useAxelaAPI();
    return await axelaAPI.executeCommand(command, options.aiMode !== false);
  } catch (error) {
    console.error('Command execution error:', error);
    throw error;
  }
};

export const GetSystemStatus = async () => {
  try {
    const axelaAPI = useAxelaAPI();
    return await axelaAPI.getStatus();
  } catch (error) {
    console.error('Status check error:', error);
    throw error;
  }
};

export const TakeScreenshot = async () => {
  try {
    const axelaAPI = useAxelaAPI();
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
  get: async () => {
    try {
      const axelaAPI = useAxelaAPI();
      return await axelaAPI.getConfig();
    } catch (error) {
      console.error('Config get error:', error);
      throw error;
    }
  },

  update: async (configUpdate) => {
    try {
      const axelaAPI = useAxelaAPI();
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

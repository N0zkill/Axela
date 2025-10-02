import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = 'http://127.0.0.1:8000';

export const useAxelaAPI = () => {
  const [status, setStatus] = useState({
    connected: false,
    ai_available: false,
    commands_executed: 0,
    success_rate: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check if we're running in Electron
  const isElectron = typeof window.electronAPI !== 'undefined';

  // API call wrapper
  const apiCall = useCallback(async (endpoint, options = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      console.error('API call error:', err);
      throw err;
    }
  }, []);

  // Get current status
  const getStatus = useCallback(async () => {
    try {
      const data = await apiCall('/status');
      setStatus({
        connected: true,
        ai_available: data.ai_available,
        commands_executed: data.commands_executed,
        success_rate: data.success_rate
      });
      setError(null);
      return data;
    } catch (err) {
      setStatus(prev => ({ ...prev, connected: false }));
      setError(err.message);
      throw err;
    }
  }, [apiCall]);

  // Execute a command
  const executeCommand = useCallback(async (command, mode = "ai") => {
    setLoading(true);
    setError(null);

    try {
      let result;

      console.log(`>>> Executing command with mode: "${mode}"`);

      if (isElectron) {
        // Use Electron IPC - pass both command and mode
        result = await window.electronAPI.sendCommand(command, mode);
      } else {
        // Use direct API call
        const payload = {
          command,
          mode  // "manual", "ai", or "chat"
        };
        console.log('>>> Payload:', payload);
        result = await apiCall('/execute', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      setLoading(false);

      // Refresh status after command execution
      await getStatus();

      return result;
    } catch (err) {
      setLoading(false);
      setError(err.message);
      throw err;
    }
  }, [isElectron, apiCall, getStatus]);

  // Get configuration
  const getConfig = useCallback(async () => {
    try {
      return await apiCall('/config');
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [apiCall]);

  // Update configuration
  const updateConfig = useCallback(async (configUpdate) => {
    try {
      return await apiCall('/config', {
        method: 'POST',
        body: JSON.stringify(configUpdate)
      });
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [apiCall]);

  // Take a screenshot
  const takeScreenshot = useCallback(async () => {
    try {
      return await apiCall('/screenshot', {
        method: 'POST'
      });
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [apiCall]);

  // Electron-specific functions
  const electronAPI = {
    getSetting: isElectron ? window.electronAPI.getSetting : null,
    setSetting: isElectron ? window.electronAPI.setSetting : null,
    showOpenDialog: isElectron ? window.electronAPI.showOpenDialog : null,
    showSaveDialog: isElectron ? window.electronAPI.showSaveDialog : null,
    appQuit: isElectron ? window.electronAPI.appQuit : null,
    appMinimize: isElectron ? window.electronAPI.appMinimize : null,
    appMaximize: isElectron ? window.electronAPI.appMaximize : null,
  };

  // Auto-refresh status periodically
  useEffect(() => {
    getStatus(); // Initial status check

    const interval = setInterval(() => {
      getStatus().catch(() => {
        // Silently handle errors in background status checks
      });
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [getStatus]);

  // Listen for backend logs if in Electron
  useEffect(() => {
    if (isElectron && window.electronAPI.onBackendLog) {
      const handleBackendLog = (data) => {
        console.log('Backend:', data);
      };

      const handleBackendError = (data) => {
        console.error('Backend Error:', data);
        setError(data);
      };

      window.electronAPI.onBackendLog(handleBackendLog);
      window.electronAPI.onBackendError(handleBackendError);

      return () => {
        if (window.electronAPI.removeAllListeners) {
          window.electronAPI.removeAllListeners('backend-log');
          window.electronAPI.removeAllListeners('backend-error');
        }
      };
    }
  }, [isElectron]);

  return {
    status,
    loading,
    error,
    isElectron,

    // API methods
    executeCommand,
    getStatus,
    getConfig,
    updateConfig,
    takeScreenshot,

    // Electron-specific methods
    electronAPI,

    // Utility methods
    clearError: () => setError(null),
  };
};

export default useAxelaAPI;

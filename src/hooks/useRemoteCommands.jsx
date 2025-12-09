import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAxelaAPI } from './useAxelaAPI';
import {
  subscribeToRemoteCommands,
  executeRemoteCommand,
  getPendingCommands,
} from '@/lib/remoteCommandService';

export function useRemoteCommands(options = {}) {
  const {
    enabled = true,
    onCommandReceived,
    onCommandExecuted,
    onError,
  } = options;

  const { isAuthenticated, user } = useAuth();
  const axelaAPI = useAxelaAPI();
  const unsubscribeRef = useRef(null);
  const isProcessingRef = useRef(false);

  const processCommand = async (command) => {
    if (isProcessingRef.current) {
      console.log('[RemoteCommands] Already processing a command, queuing...');
      return;
    }

    isProcessingRef.current = true;

    try {
      if (onCommandReceived) {
        onCommandReceived(command);
      }

      const result = await executeRemoteCommand(command, axelaAPI);

      if (onCommandExecuted) {
        onCommandExecuted(command, result);
      }

      console.log('[RemoteCommands] Command executed successfully:', result);
    } catch (error) {
      console.error('[RemoteCommands] Error processing command:', error);
      if (onError) {
        onError(error, command);
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  const handleError = (error, command = null) => {
    console.error('[RemoteCommands] Error:', error, command);
    if (onError) {
      onError(error, command);
    }
  };

  useEffect(() => {
    if (!enabled || !isAuthenticated || !user) {
      return;
    }

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    getPendingCommands().then((pendingCommands) => {
      if (pendingCommands.length > 0) {
        console.log(
          `[RemoteCommands] Found ${pendingCommands.length} pending commands`
        );
        pendingCommands.forEach((command) => {
          processCommand(command).catch((error) => {
            handleError(error, command);
          });
        });
      }
    });

    console.log('[RemoteCommands] Setting up realtime subscription');
    unsubscribeRef.current = subscribeToRemoteCommands(
      processCommand,
      handleError
    );

    // Cleanup on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [enabled, isAuthenticated, user]);

  return {
    isSubscribed: unsubscribeRef.current !== null,
  };
}


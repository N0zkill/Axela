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
  const processedCommandIdsRef = useRef(new Set()); // Track processed commands per hook instance

  const processCommand = async (command) => {
    // Deduplication: Check if we've already processed this command
    if (processedCommandIdsRef.current.has(command.id)) {
      console.log('[RemoteCommands] Command already processed by this hook, ignoring:', command.id);
      return;
    }

    if (isProcessingRef.current) {
      console.log('[RemoteCommands] Already processing a command, queuing...');
      return;
    }

    // Check if command is still pending (atomic check-and-update to prevent race conditions)
    // This prevents both polling and realtime from processing the same command
    try {
      const { supabase } = await import('@/lib/supabaseClient');

      // Try to atomically update status from 'pending' to 'executing'
      // This will fail if another process already updated it
      const { data: updateData, error: updateError } = await supabase
        .from('remote_commands')
        .update({
          status: 'executing',
          executed_at: new Date().toISOString()
        })
        .eq('id', command.id)
        .eq('status', 'pending') // Only update if still pending
        .select()
        .single();

      if (updateError || !updateData) {
        // Command was already picked up by another process (polling or realtime)
        console.log('[RemoteCommands] Command already being processed by another instance, ignoring:', command.id);
        processedCommandIdsRef.current.add(command.id); // Mark as processed to avoid checking again
        return;
      }

      console.log('[RemoteCommands] Successfully claimed command for processing:', command.id);
    } catch (checkError) {
      console.warn('[RemoteCommands] Could not atomically claim command, proceeding anyway:', checkError);
    }

    // Mark as being processed in memory
    processedCommandIdsRef.current.add(command.id);
    isProcessingRef.current = true;

    // Clean up old processed IDs (keep last 100)
    if (processedCommandIdsRef.current.size > 100) {
      const firstId = processedCommandIdsRef.current.values().next().value;
      processedCommandIdsRef.current.delete(firstId);
    }

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
      // Remove from processed set on error so it can be retried
      processedCommandIdsRef.current.delete(command.id);
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

    // Clean up previous subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Clear processed commands when user changes
    processedCommandIdsRef.current.clear();

    // Only process pending commands once on mount, not on every user change
    // Use user.id instead of user object to prevent unnecessary re-runs
    const userId = user.id;

    // Process pending commands on mount
    getPendingCommands().then((pendingCommands) => {
      if (pendingCommands.length > 0) {
        console.log(
          `[RemoteCommands] Found ${pendingCommands.length} pending commands`
        );
        // Filter out already processed commands
        const unprocessedCommands = pendingCommands.filter(
          (cmd) => !processedCommandIdsRef.current.has(cmd.id)
        );
        unprocessedCommands.forEach((command) => {
          processCommand(command).catch((error) => {
            handleError(error, command);
          });
        });
      }
    });

    console.log('[RemoteCommands] Setting up realtime subscription');
    const unsubscribe = subscribeToRemoteCommands(
      processCommand,
      handleError
    );
    unsubscribeRef.current = unsubscribe;

    // Polling fallback: Check for new commands every 5 seconds as backup
    // This ensures commands are received even if realtime fails
    const pollInterval = setInterval(() => {
      getPendingCommands().then((pendingCommands) => {
        if (pendingCommands.length > 0) {
          const unprocessedCommands = pendingCommands.filter(
            (cmd) => !processedCommandIdsRef.current.has(cmd.id)
          );
          if (unprocessedCommands.length > 0) {
            console.log(`[RemoteCommands] Polling found ${unprocessedCommands.length} new pending commands`);
            unprocessedCommands.forEach((command) => {
              processCommand(command).catch((error) => {
                handleError(error, command);
              });
            });
          }
        }
      }).catch((error) => {
        console.error('[RemoteCommands] Error polling for commands:', error);
      });
    }, 5000); // Poll every 5 seconds

    // Log subscription status after a short delay to verify it's working
    setTimeout(() => {
      console.log('[RemoteCommands] Subscription check - unsubscribe ref:', !!unsubscribeRef.current);
    }, 2000);

    // Cleanup on unmount
    return () => {
      clearInterval(pollInterval);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [enabled, isAuthenticated, user?.id]); // Use user.id instead of user object

  return {
    isSubscribed: unsubscribeRef.current !== null,
  };
}


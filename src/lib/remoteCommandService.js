/**
 * Remote Command Service
 * Handles receiving commands from mobile devices via Supabase Realtime
 */

import { supabase } from './supabaseClient';
import { getDesktopInstanceId } from './desktopInstanceService';
import { getScript } from './scriptService';
import { Script } from '@/api/entities';

/**
 * Subscribe to remote commands for the current user
 * @param {Function} onCommand - Callback when a new command is received
 * @param {Function} onError - Callback for errors
 * @returns {Function} Unsubscribe function
 */
// Track processed command IDs to prevent duplicates
const processedCommandIds = new Set();

export function subscribeToRemoteCommands(onCommand, onError) {
  // Get current user
  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  };

  let subscription = null;
  let isSubscribed = false;
  let subscriptionPromise = null;

  const setupSubscription = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        console.warn('[RemoteCommands] No authenticated user, skipping subscription');
        return null;
      }

      const instanceId = getDesktopInstanceId();
      console.log('[RemoteCommands] Setting up realtime subscription for user:', user.id, 'instance:', instanceId);

      // Subscribe to INSERT events on remote_commands table
      // Filter: commands for this user AND (no desktop_instance_id OR desktop_instance_id matches this instance)
      subscription = supabase
        .channel(`remote_commands_${instanceId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'remote_commands',
            filter: `user_id=eq.${user.id}`,
          },
          async (payload) => {
            const command = payload.new;
            console.log('[RemoteCommands] New command received via realtime:', command);

            // Deduplication: Check if we've already processed this command
            if (processedCommandIds.has(command.id)) {
              console.log('[RemoteCommands] Command already processed, ignoring:', command.id);
              return;
            }

            // Check if command is targeted to this instance or no specific instance
            const isTargetedToThisInstance =
              !command.desktop_instance_id ||
              command.desktop_instance_id === instanceId;

            if (!isTargetedToThisInstance) {
              console.log('[RemoteCommands] Command targeted to different instance, ignoring');
              return;
            }

            // Only process pending commands
            if (command.status === 'pending') {
              // Check again if already processed (race condition protection)
              if (processedCommandIds.has(command.id)) {
                console.log('[RemoteCommands] Command already being processed, ignoring:', command.id);
                return;
              }

              // Mark as being processed immediately to prevent duplicates
              processedCommandIds.add(command.id);

              // Clean up old processed IDs (keep last 100)
              if (processedCommandIds.size > 100) {
                const firstId = processedCommandIds.values().next().value;
                processedCommandIds.delete(firstId);
              }

              try {
                // Atomically update status from 'pending' to 'executing' to prevent race conditions
                // This ensures only one process (polling or realtime) can claim the command
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
                  console.log('[RemoteCommands] Command already claimed by another process, ignoring:', command.id);
                  processedCommandIds.delete(command.id);
                  return;
                }

                console.log('[RemoteCommands] Successfully claimed command for processing:', command.id);

                // Call the handler
                if (onCommand) {
                  await onCommand(command);
                }
              } catch (error) {
                console.error('[RemoteCommands] Error processing command:', error);
                // Remove from processed set on error so it can be retried
                processedCommandIds.delete(command.id);
                await updateCommandStatus(
                  command.id,
                  'failed',
                  null,
                  error.message
                );
                if (onError) {
                  onError(error, command);
                }
              }
            }
          }
        )
        .subscribe((status) => {
          console.log('[RemoteCommands] Subscription status:', status);
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            console.log('[RemoteCommands] ✅ Successfully subscribed to remote commands');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('[RemoteCommands] ❌ Channel error - subscription failed');
            isSubscribed = false;
            if (onError) {
              onError(new Error('Realtime subscription failed'));
            }
          } else if (status === 'TIMED_OUT') {
            console.error('[RemoteCommands] ❌ Subscription timed out');
            isSubscribed = false;
            if (onError) {
              onError(new Error('Realtime subscription timed out'));
            }
          } else if (status === 'CLOSED') {
            console.log('[RemoteCommands] Subscription closed');
            isSubscribed = false;
          }
        });

      return subscription;
    } catch (error) {
      console.error('[RemoteCommands] Error setting up subscription:', error);
      if (onError) {
        onError(error);
      }
      return null;
    }
  };

  // Initialize subscription and wait for it
  subscriptionPromise = setupSubscription();

  // Return unsubscribe function
  return () => {
    if (subscription) {
      console.log('[RemoteCommands] Unsubscribing from remote commands');
      supabase.removeChannel(subscription);
      subscription = null;
      isSubscribed = false;
    }
    subscriptionPromise = null;
  };
}

/**
 * Update command status in the database
 */
export async function updateCommandStatus(
  commandId,
  status,
  resultMessage = null,
  errorMessage = null,
  resultData = null
) {
  try {
    const updateData = {
      status,
      ...(resultMessage && { result_message: resultMessage }),
      ...(errorMessage && { error_message: errorMessage }),
      ...(resultData && { result_data: resultData }),
    };

    if (status === 'executing') {
      updateData.executed_at = new Date().toISOString();
    } else if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('remote_commands')
      .update(updateData)
      .eq('id', commandId);

    if (error) {
      console.error('[RemoteCommands] Error updating command status:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('[RemoteCommands] Failed to update command status:', error);
    throw error;
  }
}


async function insertChatResponse(commandId, userId, responseText, success, data = null) {
  try {
    const { error } = await supabase
      .from('command_responses')
      .insert({
        command_id: commandId,
        user_id: userId,
        response_text: responseText,
        success: success,
        data: data,
      });

    if (error) {
      console.error('[RemoteCommands] Error inserting chat response:', error);
      throw error;
    }

    console.log('[RemoteCommands] Chat response inserted for command:', commandId);
    return true;
  } catch (error) {
    console.error('[RemoteCommands] Failed to insert chat response:', error);
    throw error;
  }
}

/**
 * Execute a remote command
 * This function should be called from the desktop client when a command is received
 */
export async function executeRemoteCommand(command, axelaAPI) {
  try {
    console.log('[RemoteCommands] Executing remote command:', command);

    // Get current user for response insertion
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    let result;

    switch (command.command_type) {
      case 'script':
        // Execute script by ID from Supabase
        if (!command.script_id) {
          throw new Error('Script ID is required for script commands');
        }

        // Fetch script from Supabase
        console.log('[RemoteCommands] Fetching script from Supabase:', command.script_id);
        const { data: scriptData, error: scriptError } = await getScript(command.script_id);

        if (scriptError || !scriptData) {
          throw new Error(`Script not found: ${scriptError?.message || 'Unknown error'}`);
        }

        if (scriptData.is_active === false) {
          console.warn('[RemoteCommands] Script is marked as inactive, but executing anyway (command was queued when active)');
        }

        const script = new Script({
          ...scriptData,
          created_date: scriptData.created_at,
          updated_date: scriptData.updated_at,
          isActive: scriptData.is_active,
          isFavorite: scriptData.is_favorite,
          lastExecuted: scriptData.last_executed,
        });

        console.log('[RemoteCommands] Executing script:', script.name, 'with', script.commands.length, 'commands');
        const executionResult = await script.execute(axelaAPI, userId);

        result = {
          success: executionResult.success,
          message: executionResult.success
            ? `Script "${executionResult.scriptName}" executed: ${executionResult.executedCommands}/${executionResult.totalCommands} commands successful`
            : `Script "${executionResult.scriptName}" failed: ${executionResult.executedCommands}/${executionResult.totalCommands} commands executed`,
          data: executionResult,
        };
        break;

      case 'chat':
      case 'ai':
      case 'agent':
      case 'manual':
        // Execute command with specified mode
        if (!command.command_text) {
          throw new Error('Command text is required');
        }
        const mode = command.mode || command.command_type;
        result = await axelaAPI.executeCommand(command.command_text, mode);

        // For chat mode only: insert response into command_responses table
        if (mode === 'chat' && userId && result) {
          try {
            await insertChatResponse(
              command.id,
              userId,
              result.message || '',
              result.success !== false,
              result.data || null
            );
          } catch (error) {
            // Log error but don't fail the command execution
            console.error('[RemoteCommands] Failed to insert chat response, continuing:', error);
          }
        }
        break;

      default:
        throw new Error(`Unknown command type: ${command.command_type}`);
    }

    // Update command status
    await updateCommandStatus(
      command.id,
      'completed',
      result.message || 'Command executed successfully',
      null,
      result.data || { success: result.success }
    );

    return result;
  } catch (error) {
    console.error('[RemoteCommands] Error executing remote command:', error);
    await updateCommandStatus(
      command.id,
      'failed',
      null,
      error.message || 'Unknown error occurred'
    );
    throw error;
  }
}

export async function getPendingCommands() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return [];
    }

    const instanceId = getDesktopInstanceId();

    const { data, error } = await supabase
      .from('remote_commands')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .or(`desktop_instance_id.is.null,desktop_instance_id.eq.${instanceId}`)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[RemoteCommands] Error fetching pending commands:', error);
    return [];
  }
}


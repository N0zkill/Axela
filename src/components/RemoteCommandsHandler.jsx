import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRemoteCommands } from '@/hooks/useRemoteCommands';
import { toast } from '@/hooks/use-toast';
import {
  registerDesktopInstance,
  updateDesktopInstanceHeartbeat,
  markDesktopInstanceInactive,
} from '@/lib/desktopInstanceService';

export function RemoteCommandsHandler() {
  const { isAuthenticated } = useAuth();
  const heartbeatIntervalRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let isMounted = true;

    registerDesktopInstance().catch((error) => {
      console.error('[RemoteCommandsHandler] Failed to register desktop instance:', error);
    });

    heartbeatIntervalRef.current = setInterval(() => {
      if (isMounted) {
        updateDesktopInstanceHeartbeat().catch((error) => {
          console.error('[RemoteCommandsHandler] Heartbeat failed:', error);
        });
      }
    }, 30000); // 30 seconds

    return () => {
      isMounted = false;
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      markDesktopInstanceInactive().catch((error) => {
        console.error('[RemoteCommandsHandler] Failed to mark inactive:', error);
      });
    };
  }, [isAuthenticated]);

  useRemoteCommands({
    enabled: isAuthenticated,
    onCommandReceived: (command) => {
      console.log('[RemoteCommands] Command received:', command);
      toast({
        title: 'Remote Command Received',
        description: `Executing: ${command.command_text || `Script ${command.script_id}`}`,
      });
    },
    onCommandExecuted: (command, result) => {
      console.log('[RemoteCommands] Command executed:', result);
      if (result.success) {
        toast({
          title: 'Remote Command Executed',
          description: 'Command completed successfully',
        });
      } else {
        toast({
          title: 'Remote Command Failed',
          description: result.message || 'Command execution failed',
          variant: 'destructive',
        });
      }
    },
    onError: (error, command) => {
      console.error('[RemoteCommands] Error:', error, command);
      toast({
        title: 'Remote Command Error',
        description: error.message || 'An error occurred processing the remote command',
        variant: 'destructive',
      });
    },
  });

  return null;
}


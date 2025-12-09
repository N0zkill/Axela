/**
 * Desktop Instance Service
 * Handles registration and management of desktop client instances
 * for device pairing/linking with mobile devices
 */

import { supabase } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid';

// Generate or retrieve a persistent instance ID
function getOrCreateInstanceId() {
  const STORAGE_KEY = 'axela.desktop.instance_id';

  // Try localStorage first (synchronous)
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return stored;
    }
  }

  // Try Electron store (synchronous get)
  if (typeof window !== 'undefined' && window.electronAPI?.getSetting) {
    try {
      // Note: getSetting might be async in some implementations, but we'll try sync first
      const stored = window.electronAPI.getSetting(STORAGE_KEY);
      if (stored) {
        // Also store in localStorage for faster access
        if (window.localStorage) {
          localStorage.setItem(STORAGE_KEY, stored);
        }
        return stored;
      }
    } catch (e) {
      // If getSetting is async, fall through to generate new ID
    }
  }

  // Generate new instance ID
  const instanceId = `desktop-${uuidv4()}`;

  // Store it
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(STORAGE_KEY, instanceId);
  }

  // Also try to store in Electron store (async, but don't wait)
  if (typeof window !== 'undefined' && window.electronAPI?.setSetting) {
    try {
      const setResult = window.electronAPI.setSetting(STORAGE_KEY, instanceId);
      // If it's a promise, don't await (fire and forget)
      if (setResult && typeof setResult.then === 'function') {
        setResult.catch(() => {
          // Ignore errors
        });
      }
    } catch (e) {
      // Ignore errors
    }
  }

  return instanceId;
}

/**
 * Register or update desktop instance
 */
export async function registerDesktopInstance(deviceName = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const instanceId = getOrCreateInstanceId();

    // Get device info
    const deviceInfo = {
      platform: typeof window !== 'undefined' && window.appInfo?.platform || 'unknown',
      arch: typeof window !== 'undefined' && window.appInfo?.arch || 'unknown',
      version: typeof window !== 'undefined' && window.appInfo?.version || '1.0.0',
    };

    // Default device name
    const defaultDeviceName = deviceName ||
      `${deviceInfo.platform} (${deviceInfo.arch})` ||
      'Desktop Client';

    // Upsert desktop instance
    const { data, error } = await supabase
      .from('desktop_instances')
      .upsert({
        user_id: user.id,
        instance_id: instanceId,
        device_name: defaultDeviceName,
        platform: deviceInfo.platform,
        arch: deviceInfo.arch,
        version: deviceInfo.version,
        last_seen_at: new Date().toISOString(),
        is_active: true,
      }, {
        onConflict: 'instance_id',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log('[DesktopInstance] Registered desktop instance:', data);
    return data;
  } catch (error) {
    console.error('[DesktopInstance] Error registering desktop instance:', error);
    throw error;
  }
}

/**
 * Update last seen timestamp (heartbeat)
 */
export async function updateDesktopInstanceHeartbeat() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return;
    }

    const instanceId = getOrCreateInstanceId();

    const { error } = await supabase
      .from('desktop_instances')
      .update({
        last_seen_at: new Date().toISOString(),
        is_active: true,
      })
      .eq('instance_id', instanceId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[DesktopInstance] Error updating heartbeat:', error);
    }
  } catch (error) {
    console.error('[DesktopInstance] Error in heartbeat:', error);
  }
}

/**
 * Mark desktop instance as inactive
 */
export async function markDesktopInstanceInactive() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return;
    }

    const instanceId = getOrCreateInstanceId();

    const { error } = await supabase
      .from('desktop_instances')
      .update({
        is_active: false,
        last_seen_at: new Date().toISOString(),
      })
      .eq('instance_id', instanceId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[DesktopInstance] Error marking inactive:', error);
    }
  } catch (error) {
    console.error('[DesktopInstance] Error marking inactive:', error);
  }
}

/**
 * Get current desktop instance ID
 */
export function getDesktopInstanceId() {
  return getOrCreateInstanceId();
}

/**
 * Get all active desktop instances for the current user
 */
export async function getActiveDesktopInstances() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from('desktop_instances')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('last_seen_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[DesktopInstance] Error fetching active instances:', error);
    return [];
  }
}

/**
 * Update device name
 */
export async function updateDeviceName(deviceName) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const instanceId = getOrCreateInstanceId();

    const { error } = await supabase
      .from('desktop_instances')
      .update({
        device_name: deviceName,
      })
      .eq('instance_id', instanceId)
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('[DesktopInstance] Error updating device name:', error);
    throw error;
  }
}


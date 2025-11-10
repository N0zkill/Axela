import { supabase } from './supabaseClient';

/**
 * Profile Service
 * Handles all user profile operations
 */

/**
 * Get the current user's profile
 */
export async function getProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching profile:', error);
    return { data: null, error };
  }
}

/**
 * Create a new user profile
 */
export async function createProfile(userId, profileData) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .insert([
        {
          id: userId,
          email: profileData.email,
          full_name: profileData.full_name || null,
          avatar_url: profileData.avatar_url || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating profile:', error);
    return { data: null, error };
  }
}

/**
 * Update the current user's profile
 */
export async function updateProfile(userId, updates) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating profile:', error);
    return { data: null, error };
  }
}

/**
 * Ensure profile exists for user (creates if doesn't exist)
 */
export async function ensureProfile(user) {
  if (!user) return { data: null, error: new Error('No user provided') };

  try {
    // Try to get existing profile
    const { data: existingProfile, error: fetchError } = await getProfile(user.id);

    // If profile exists, return it
    if (existingProfile && !fetchError) {
      return { data: existingProfile, error: null };
    }

    // If profile doesn't exist, create it
    const profileData = {
      email: user.email,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    };

    const { data: newProfile, error: createError } = await createProfile(user.id, profileData);

    if (createError) throw createError;
    return { data: newProfile, error: null };
  } catch (error) {
    console.error('Error ensuring profile:', error);
    return { data: null, error };
  }
}

/**
 * Delete user profile (use with caution)
 */
export async function deleteProfile(userId) {
  try {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting profile:', error);
    return { error };
  }
}



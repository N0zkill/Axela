import { supabase } from './supabaseClient';

export async function getScripts(userId, sortBy = '-created_at') {
  try {
    const orderColumn = sortBy.startsWith('-') ? sortBy.slice(1) : sortBy;
    const ascending = !sortBy.startsWith('-');

    const { data, error } = await supabase
      .from('scripts')
      .select('*')
      .eq('user_id', userId)
      .order(orderColumn, { ascending });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching scripts:', error);
    return { data: null, error };
  }
}

export async function getScript(scriptId) {
  try {
    const { data, error } = await supabase
      .from('scripts')
      .select('*')
      .eq('id', scriptId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching script:', error);
    return { data: null, error };
  }
}

/**
 * Create a new script
 */
export async function createScript(userId, scriptData) {
  try {
    const { data, error } = await supabase
      .from('scripts')
      .insert([
        {
          user_id: userId,
          name: scriptData.name,
          prompt: scriptData.prompt,
          description: scriptData.description || '',
          category: scriptData.category || 'General',
          commands: scriptData.commands || [],
          is_active: scriptData.is_active !== undefined ? scriptData.is_active : true,
          is_favorite: scriptData.is_favorite !== undefined ? scriptData.is_favorite : false,
          is_recurring: scriptData.is_recurring || false,
          recurring_interval: scriptData.recurring_interval || null,
          recurring_enabled: scriptData.recurring_enabled || false,
          usage_count: 0,
          last_executed: null,
          next_execution: null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating script:', error);
    return { data: null, error };
  }
}


export async function updateScript(scriptId, updates) {
  try {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (updates.isActive !== undefined) {
      updateData.is_active = updates.isActive;
      delete updateData.isActive;
    }
    if (updates.isFavorite !== undefined) {
      updateData.is_favorite = updates.isFavorite;
      delete updateData.isFavorite;
    }
    if (updates.isRecurring !== undefined) {
      updateData.is_recurring = updates.isRecurring;
      delete updateData.isRecurring;
    }
    if (updates.recurringInterval !== undefined) {
      updateData.recurring_interval = updates.recurringInterval;
      delete updateData.recurringInterval;
    }
    if (updates.recurringEnabled !== undefined) {
      updateData.recurring_enabled = updates.recurringEnabled;
      delete updateData.recurringEnabled;
    }
    if (updates.usageCount !== undefined) {
      updateData.usage_count = updates.usageCount;
      delete updateData.usageCount;
    }
    if (updates.lastExecuted !== undefined) {
      updateData.last_executed = updates.lastExecuted;
      delete updateData.lastExecuted;
    }
    if (updates.nextExecution !== undefined) {
      updateData.next_execution = updates.nextExecution;
      delete updateData.nextExecution;
    }

    const { data, error } = await supabase
      .from('scripts')
      .update(updateData)
      .eq('id', scriptId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating script:', error);
    return { data: null, error };
  }
}

export async function deleteScript(scriptId) {
  try {
    const { error } = await supabase
      .from('scripts')
      .delete()
      .eq('id', scriptId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting script:', error);
    return { error };
  }
}

export async function searchScripts(userId, query) {
  try {
    const { data, error } = await supabase
      .from('scripts')
      .select('*')
      .eq('user_id', userId)
      .or(`name.ilike.%${query}%,prompt.ilike.%${query}%,description.ilike.%${query}%`);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error searching scripts:', error);
    return { data: null, error };
  }
}

export async function incrementScriptUsage(scriptId) {
  try {
    const { data: script, error: fetchError } = await supabase
      .from('scripts')
      .select('usage_count')
      .eq('id', scriptId)
      .single();

    if (fetchError) throw fetchError;

    const { data, error } = await supabase
      .from('scripts')
      .update({
        usage_count: (script.usage_count || 0) + 1,
        last_executed: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', scriptId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error incrementing script usage:', error);
    return { data: null, error };
  }
}


import { supabase } from './supabaseClient';

/**
 * Chat Service
 * Handles all chat conversation and message operations
 */

/**
 * Get all conversations for the current user
 * Returns conversations ordered by most recently updated
 */
export async function getConversations(userId) {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return { data: null, error };
  }
}

/**
 * Get a single conversation by ID
 */
export async function getConversation(conversationId) {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return { data: null, error };
  }
}

/**
 * Create a new conversation
 */
export async function createConversation(userId, title = 'New Conversation') {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .insert([
        {
          user_id: userId,
          title: title,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating conversation:', error);
    return { data: null, error };
  }
}

/**
 * Update a conversation
 */
export async function updateConversation(conversationId, updates) {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating conversation:', error);
    return { data: null, error };
  }
}

/**
 * Delete a conversation (will cascade delete all messages)
 */
export async function deleteConversation(conversationId) {
  try {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return { error };
  }
}

/**
 * Get all messages for a conversation
 */
export async function getMessages(conversationId) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching messages:', error);
    return { data: null, error };
  }
}

/**
 * Create a new message
 */
export async function createMessage(conversationId, messageData) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          conversation_id: conversationId,
          role: messageData.role,
          content: messageData.content,
          success: messageData.success !== undefined ? messageData.success : true,
          data: messageData.data || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating message:', error);
    return { data: null, error };
  }
}

/**
 * Create multiple messages at once
 */
export async function createMessages(conversationId, messagesData) {
  try {
    const messagesToInsert = messagesData.map(msg => ({
      conversation_id: conversationId,
      role: msg.role,
      content: msg.content,
      success: msg.success !== undefined ? msg.success : true,
      data: msg.data || null,
    }));

    const { data, error } = await supabase
      .from('messages')
      .insert(messagesToInsert)
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating messages:', error);
    return { data: null, error };
  }
}

/**
 * Delete a message
 */
export async function deleteMessage(messageId) {
  try {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting message:', error);
    return { error };
  }
}

/**
 * Get conversations with their messages
 * Returns conversations with messages array populated
 */
export async function getConversationsWithMessages(userId) {
  try {
    // First get all conversations
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (convError) throw convError;

    if (!conversations || conversations.length === 0) {
      return { data: [], error: null };
    }

    // Then get all messages for these conversations
    const conversationIds = conversations.map(c => c.id);
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    // Group messages by conversation
    const messagesByConv = {};
    messages?.forEach(msg => {
      if (!messagesByConv[msg.conversation_id]) {
        messagesByConv[msg.conversation_id] = [];
      }
      messagesByConv[msg.conversation_id].push({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        timestamp: msg.created_at,
        success: msg.success,
        data: msg.data,
      });
    });

    // Combine conversations with their messages
    const conversationsWithMessages = conversations.map(conv => ({
      id: conv.id,
      title: conv.title,
      messages: messagesByConv[conv.id] || [],
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      isActive: false, // Will be set by the component
    }));

    return { data: conversationsWithMessages, error: null };
  } catch (error) {
    console.error('Error fetching conversations with messages:', error);
    return { data: null, error };
  }
}




/**
 * Supabase Edge Function: Send Remote Command
 *
 * This function allows mobile devices to send commands to the desktop client.
 *
 * Usage:
 * POST /functions/v1/send-remote-command
 * Headers: { Authorization: "Bearer <supabase_jwt_token>" }
 * Body: {
 *   command_type: "chat" | "ai" | "agent" | "manual" | "script",
 *   command_text?: string,  // Required for chat/ai/agent/manual
 *   script_id?: string,     // Required for script type
 *   mode?: "chat" | "ai" | "agent" | "manual",  // Optional, defaults to command_type
 *   device_info?: {         // Optional device metadata
 *     platform: string,
 *     version: string,
 *     ...
 *   }
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the user's JWT token
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    const body = await req.json();
    const {
      command_type,
      command_text,
      script_id,
      mode,
      device_info,
      desktop_instance_id, // Optional: target specific desktop instance
    } = body;

    // Validate command type
    const validCommandTypes = ['chat', 'ai', 'agent', 'manual', 'script'];
    if (!command_type || !validCommandTypes.includes(command_type)) {
      return new Response(
        JSON.stringify({
          error: `Invalid command_type. Must be one of: ${validCommandTypes.join(', ')}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate required fields based on command type
    if (command_type === 'script') {
      if (!script_id) {
        return new Response(
          JSON.stringify({ error: 'script_id is required for script commands' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    } else {
      if (!command_text) {
        return new Response(
          JSON.stringify({
            error: 'command_text is required for non-script commands',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Determine mode (default to command_type if not specified)
    const finalMode = mode || command_type;

    // If desktop_instance_id is provided, verify it exists and belongs to the user
    if (desktop_instance_id) {
      const { data: instanceData, error: instanceError } = await supabase
        .from('desktop_instances')
        .select('id')
        .eq('instance_id', desktop_instance_id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (instanceError || !instanceData) {
        return new Response(
          JSON.stringify({
            error: 'Invalid or inactive desktop_instance_id',
            details: 'The specified desktop instance does not exist or is not active',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Insert command into remote_commands table
    const { data, error } = await supabase
      .from('remote_commands')
      .insert({
        user_id: user.id,
        command_type,
        command_text: command_text || null,
        script_id: script_id || null,
        mode: finalMode,
        status: 'pending',
        device_info: device_info || null,
        desktop_instance_id: desktop_instance_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting remote command:', error);
      return new Response(
        JSON.stringify({
          error: 'Failed to create remote command',
          details: error.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        command_id: data.id,
        message: 'Command queued successfully. Desktop client will execute it when connected.',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});


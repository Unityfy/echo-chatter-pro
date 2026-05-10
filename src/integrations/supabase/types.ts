export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_configs: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          id: string
          section: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string
          id?: string
          section: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          id?: string
          section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_intent_knowledge_bases: {
        Row: {
          created_at: string
          id: string
          intent_id: string
          knowledge_base_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          intent_id: string
          knowledge_base_id: string
        }
        Update: {
          created_at?: string
          id?: string
          intent_id?: string
          knowledge_base_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_intent_knowledge_bases_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "agent_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_intent_knowledge_bases_knowledge_base_id_fkey"
            columns: ["knowledge_base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_intents: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          id: string
          kb_priority: string
          name: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          description?: string | null
          id?: string
          kb_priority?: string
          name: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          id?: string
          kb_priority?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_intents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_knowledge_bases: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          knowledge_base_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          knowledge_base_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          knowledge_base_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_bases_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_knowledge_bases_knowledge_base_id_fkey"
            columns: ["knowledge_base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          calls: number | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          language: string | null
          model: string | null
          name: string
          prompt: string | null
          status: Database["public"]["Enums"]["agent_status"]
          success_rate: number | null
          team_id: string
          type: string | null
          updated_at: string
          voice: string | null
          welcome_message: string | null
          welcome_mode: string | null
        }
        Insert: {
          calls?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          language?: string | null
          model?: string | null
          name: string
          prompt?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          success_rate?: number | null
          team_id: string
          type?: string | null
          updated_at?: string
          voice?: string | null
          welcome_message?: string | null
          welcome_mode?: string | null
        }
        Update: {
          calls?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          language?: string | null
          model?: string | null
          name?: string
          prompt?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          success_rate?: number | null
          team_id?: string
          type?: string | null
          updated_at?: string
          voice?: string | null
          welcome_message?: string | null
          welcome_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      call_messages: {
        Row: {
          call_id: string
          content: string
          created_at: string
          id: string
          latency_ms: number | null
          metadata: Json
          role: string
        }
        Insert: {
          call_id: string
          content?: string
          created_at?: string
          id?: string
          latency_ms?: number | null
          metadata?: Json
          role: string
        }
        Update: {
          call_id?: string
          content?: string
          created_at?: string
          id?: string
          latency_ms?: number | null
          metadata?: Json
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_messages_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_id: string | null
          answered_at: string | null
          call_sid: string | null
          created_at: string
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          from_number: string | null
          id: string
          metadata: Json
          phone_number_id: string | null
          provider: string
          recording_url: string | null
          started_at: string
          status: string
          team_id: string
          to_number: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          answered_at?: string | null
          call_sid?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          metadata?: Json
          phone_number_id?: string | null
          provider?: string
          recording_url?: string | null
          started_at?: string
          status?: string
          team_id: string
          to_number?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          answered_at?: string | null
          call_sid?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          metadata?: Json
          phone_number_id?: string | null
          provider?: string
          recording_url?: string | null
          started_at?: string
          status?: string
          team_id?: string
          to_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          created_by: string
          enabled: boolean
          id: string
          team_id: string
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by: string
          enabled?: boolean
          id?: string
          team_id: string
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          team_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_bases: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_bases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json | null
          source_id: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          source_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          chunk_count: number | null
          content_text: string | null
          crawl_config: Json | null
          crawl_status: string | null
          created_at: string
          discovered_urls_count: number | null
          error_message: string | null
          file_name: string | null
          file_path: string | null
          id: string
          knowledge_base_id: string
          last_refreshed_at: string | null
          parent_source_id: string | null
          source_url: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          chunk_count?: number | null
          content_text?: string | null
          crawl_config?: Json | null
          crawl_status?: string | null
          created_at?: string
          discovered_urls_count?: number | null
          error_message?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          knowledge_base_id: string
          last_refreshed_at?: string | null
          parent_source_id?: string | null
          source_url?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          chunk_count?: number | null
          content_text?: string | null
          crawl_config?: Json | null
          crawl_status?: string | null
          created_at?: string
          discovered_urls_count?: number | null
          error_message?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          knowledge_base_id?: string
          last_refreshed_at?: string | null
          parent_source_id?: string | null
          source_url?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_knowledge_base_id_fkey"
            columns: ["knowledge_base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_sources_parent_source_id_fkey"
            columns: ["parent_source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_numbers: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          phone_number: string
          provider: string
          provider_number_id: string | null
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          phone_number: string
          provider?: string
          provider_number_id?: string | null
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          phone_number?: string
          provider?: string
          provider_number_id?: string | null
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_numbers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          created_at: string
          id: string
          monthly_cost_cap_usd: number
          monthly_minutes_cap: number
          monthly_tokens_cap: number
          plan: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_cost_cap_usd?: number
          monthly_minutes_cap?: number
          monthly_tokens_cap?: number
          plan?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          monthly_cost_cap_usd?: number
          monthly_minutes_cap?: number
          monthly_tokens_cap?: number
          plan?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      provider_health: {
        Row: {
          details: Json
          id: string
          last_checked_at: string
          latency_ms: number | null
          provider: string
          status: string
        }
        Insert: {
          details?: Json
          id?: string
          last_checked_at?: string
          latency_ms?: number | null
          provider: string
          status?: string
        }
        Update: {
          details?: Json
          id?: string
          last_checked_at?: string
          latency_ms?: number | null
          provider?: string
          status?: string
        }
        Relationships: []
      }
      system_events: {
        Row: {
          context: Json
          created_at: string
          id: string
          level: string
          message: string
          source: string
          team_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message: string
          source: string
          team_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message?: string
          source?: string
          team_id?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string
          fallback_number: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          fallback_number?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          fallback_number?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          agent_id: string | null
          call_id: string | null
          cost_usd: number
          created_at: string
          id: string
          kind: string
          llm_completion_tokens: number
          llm_prompt_tokens: number
          metadata: Json
          minutes: number
          stt_seconds: number
          team_id: string
          tts_characters: number
        }
        Insert: {
          agent_id?: string | null
          call_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          kind: string
          llm_completion_tokens?: number
          llm_prompt_tokens?: number
          metadata?: Json
          minutes?: number
          stt_seconds?: number
          team_id: string
          tts_characters?: number
        }
        Update: {
          agent_id?: string | null
          call_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          kind?: string
          llm_completion_tokens?: number
          llm_prompt_tokens?: number
          metadata?: Json
          minutes?: number
          stt_seconds?: number
          team_id?: string
          tts_characters?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_team_with_admin: {
        Args: { _name: string; _user_id: string }
        Returns: string
      }
      is_team_admin: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      record_usage_event: {
        Args: {
          _agent_id: string
          _call_id: string
          _completion_tokens: number
          _cost_usd: number
          _kind: string
          _metadata: Json
          _minutes: number
          _prompt_tokens: number
          _stt_seconds: number
          _team_id: string
          _tts_characters: number
        }
        Returns: string
      }
      search_knowledge_chunks: {
        Args: {
          _knowledge_base_ids: string[]
          _match_count?: number
          _match_threshold?: number
          _query_embedding: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      team_usage_this_month: {
        Args: { _team_id: string }
        Returns: {
          cost_usd: number
          minutes: number
          stt_seconds: number
          tokens: number
          tts_characters: number
        }[]
      }
      team_within_limits: { Args: { _team_id: string }; Returns: boolean }
    }
    Enums: {
      agent_status: "active" | "draft" | "paused" | "archived" | "inactive"
      team_role: "admin" | "member" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agent_status: ["active", "draft", "paused", "archived", "inactive"],
      team_role: ["admin", "member", "viewer"],
    },
  },
} as const

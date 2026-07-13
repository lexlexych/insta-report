// TODO(T-002): перегенерировать через `pnpm db:types` после `supabase link --project-ref <ref>`
// к реальному Supabase-проекту. До тех пор этот файл написан вручную в формате,
// максимально приближенном к реальному выводу `supabase gen types typescript`, и должен
// соответствовать supabase/migrations/0001_init.sql … latest migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          telegram_user_id: number;
          tg_chat_id: number | null;
          tg_topics_enabled: boolean;
          org_name: string | null;
          business_sphere: string | null;
          knowledge_base: string | null;
          system_prompt: string | null;
          reply_language: string;
          ui_locale: 'ru' | 'de';
          plan: string;
          onboarding_step: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          telegram_user_id: number;
          tg_chat_id?: number | null;
          tg_topics_enabled?: boolean;
          org_name?: string | null;
          business_sphere?: string | null;
          knowledge_base?: string | null;
          system_prompt?: string | null;
          reply_language?: string;
          ui_locale?: 'ru' | 'de';
          plan?: string;
          onboarding_step?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          telegram_user_id?: number;
          tg_chat_id?: number | null;
          tg_topics_enabled?: boolean;
          org_name?: string | null;
          business_sphere?: string | null;
          knowledge_base?: string | null;
          system_prompt?: string | null;
          reply_language?: string;
          ui_locale?: 'ru' | 'de';
          plan?: string;
          onboarding_step?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ig_accounts: {
        Row: {
          id: string;
          ig_username: string;
          tenant_id: string | null;
          status: 'pending' | 'approved';
          requested_at: string;
          approved_at: string | null;
          approved_by_tg_id: number | null;
        };
        Insert: {
          id?: string;
          ig_username: string;
          tenant_id?: string | null;
          status?: 'pending' | 'approved';
          requested_at?: string;
          approved_at?: string | null;
          approved_by_tg_id?: number | null;
        };
        Update: {
          id?: string;
          ig_username?: string;
          tenant_id?: string | null;
          status?: 'pending' | 'approved';
          requested_at?: string;
          approved_at?: string | null;
          approved_by_tg_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ig_accounts_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      ig_connections: {
        Row: {
          id: string;
          tenant_id: string;
          ig_account_id: string | null;
          ig_username: string | null;
          access_token_enc: string | null;
          token_refreshed_at: string | null;
          webhook_last_seen_at: string | null;
          status: 'pending' | 'active' | 'error';
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          ig_account_id?: string | null;
          ig_username?: string | null;
          access_token_enc?: string | null;
          token_refreshed_at?: string | null;
          webhook_last_seen_at?: string | null;
          status?: 'pending' | 'active' | 'error';
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          ig_account_id?: string | null;
          ig_username?: string | null;
          access_token_enc?: string | null;
          token_refreshed_at?: string | null;
          webhook_last_seen_at?: string | null;
          status?: 'pending' | 'active' | 'error';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ig_connections_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      labels: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          description: string | null;
          instruction: string | null;
          tg_thread_id: number | null;
          sort: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          description?: string | null;
          instruction?: string | null;
          tg_thread_id?: number | null;
          sort?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          description?: string | null;
          instruction?: string | null;
          tg_thread_id?: number | null;
          sort?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'labels_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      drafts: {
        Row: {
          id: string;
          tenant_id: string;
          conversation_key: string;
          contact_id: string | null;
          contact_username: string | null;
          pending_text: string | null;
          history_snapshot: string | null;
          label_id: string | null;
          draft_text: string | null;
          tg_chat_id: number | null;
          tg_message_id: number | null;
          trigger_ts: number | null;
          status: 'pending' | 'sending' | 'sent' | 'cancelled' | 'skipped_manual' | 'error';
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          conversation_key: string;
          contact_id?: string | null;
          contact_username?: string | null;
          pending_text?: string | null;
          history_snapshot?: string | null;
          label_id?: string | null;
          draft_text?: string | null;
          tg_chat_id?: number | null;
          tg_message_id?: number | null;
          trigger_ts?: number | null;
          status?: 'pending' | 'sending' | 'sent' | 'cancelled' | 'skipped_manual' | 'error';
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          conversation_key?: string;
          contact_id?: string | null;
          contact_username?: string | null;
          pending_text?: string | null;
          history_snapshot?: string | null;
          label_id?: string | null;
          draft_text?: string | null;
          tg_chat_id?: number | null;
          tg_message_id?: number | null;
          trigger_ts?: number | null;
          status?: 'pending' | 'sending' | 'sent' | 'cancelled' | 'skipped_manual' | 'error';
          error?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'drafts_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'drafts_label_id_fkey';
            columns: ['label_id'];
            isOneToOne: false;
            referencedRelation: 'labels';
            referencedColumns: ['id'];
          },
        ];
      };
      processed_events: {
        Row: {
          tenant_id: string;
          event_mid: string;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          event_mid: string;
          created_at?: string;
        };
        Update: {
          tenant_id?: string;
          event_mid?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'processed_events_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      message_log: {
        Row: {
          id: string;
          tenant_id: string;
          conversation_key: string;
          direction: 'in' | 'out' | 'manual';
          text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          conversation_key: string;
          direction: 'in' | 'out' | 'manual';
          text?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          conversation_key?: string;
          direction?: 'in' | 'out' | 'manual';
          text?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_log_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      usage_stats: {
        Row: {
          id: string;
          tenant_id: string;
          day: string;
          llm_calls: number;
          tokens_in: number;
          tokens_out: number;
          drafts_created: number;
          drafts_sent: number;
          simulator_calls: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          day: string;
          llm_calls?: number;
          tokens_in?: number;
          tokens_out?: number;
          drafts_created?: number;
          drafts_sent?: number;
          simulator_calls?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          day?: string;
          llm_calls?: number;
          tokens_in?: number;
          tokens_out?: number;
          drafts_created?: number;
          drafts_sent?: number;
          simulator_calls?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'usage_stats_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      seed_default_labels: {
        Args: { p_tenant: string };
        Returns: undefined;
      };
      increment_usage: {
        Args: {
          p_tenant: string;
          p_day: string;
          p_llm_calls: number;
          p_tokens_in: number;
          p_tokens_out: number;
          p_drafts_created: number;
          p_drafts_sent: number;
          p_simulator_calls: number;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

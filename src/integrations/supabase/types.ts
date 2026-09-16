export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      access_audit: {
        Row: {
          action: string;
          actor: string;
          created_at: string;
          detail: string | null;
          id: string;
          subject_email: string | null;
          subject_user: string | null;
        };
        Insert: {
          action: string;
          actor?: string;
          created_at?: string;
          detail?: string | null;
          id?: string;
          subject_email?: string | null;
          subject_user?: string | null;
        };
        Update: {
          action?: string;
          actor?: string;
          created_at?: string;
          detail?: string | null;
          id?: string;
          subject_email?: string | null;
          subject_user?: string | null;
        };
        Relationships: [];
      };
      access_codes: {
        Row: {
          code: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          label: string | null;
          last_used_at: string | null;
          max_uses: number;
          revoked_at: string | null;
          uses: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          label?: string | null;
          last_used_at?: string | null;
          max_uses?: number;
          revoked_at?: string | null;
          uses?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          label?: string | null;
          last_used_at?: string | null;
          max_uses?: number;
          revoked_at?: string | null;
          uses?: number;
        };
        Relationships: [];
      };
      admin_credentials: {
        Row: {
          display_name: string;
          id: boolean;
          password_hash: string;
          updated_at: string;
        };
        Insert: {
          display_name?: string;
          id?: boolean;
          password_hash: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          id?: boolean;
          password_hash?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_settings: {
        Row: {
          detailed_model: string;
          enabled: boolean;
          id: boolean;
          monthly_call_limit: number;
          quick_model: string;
          updated_at: string;
        };
        Insert: {
          detailed_model?: string;
          enabled?: boolean;
          id?: boolean;
          monthly_call_limit?: number;
          quick_model?: string;
          updated_at?: string;
        };
        Update: {
          detailed_model?: string;
          enabled?: boolean;
          id?: boolean;
          monthly_call_limit?: number;
          quick_model?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_usage: {
        Row: {
          created_at: string;
          had_image: boolean;
          id: string;
          input_tokens: number | null;
          mode: string;
          model: string;
          output_tokens: number | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          had_image?: boolean;
          id?: string;
          input_tokens?: number | null;
          mode: string;
          model: string;
          output_tokens?: number | null;
          status: string;
        };
        Update: {
          created_at?: string;
          had_image?: boolean;
          id?: string;
          input_tokens?: number | null;
          mode?: string;
          model?: string;
          output_tokens?: number | null;
          status?: string;
        };
        Relationships: [];
      };
      corpus_images: {
        Row: {
          created_at: string;
          credit: string | null;
          id: string;
          image_url: string;
          labelled_signs: number;
          license: string;
          notes: string | null;
          script: string;
          siglum: string | null;
          source_url: string | null;
          title: string;
          unknown_signs: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          credit?: string | null;
          id?: string;
          image_url: string;
          labelled_signs?: number;
          license: string;
          notes?: string | null;
          script: string;
          siglum?: string | null;
          source_url?: string | null;
          title: string;
          unknown_signs?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          credit?: string | null;
          id?: string;
          image_url?: string;
          labelled_signs?: number;
          license?: string;
          notes?: string | null;
          script?: string;
          siglum?: string | null;
          source_url?: string | null;
          title?: string;
          unknown_signs?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      extension_runs: {
        Row: {
          actor: string;
          created_at: string;
          detail: string | null;
          duration_ms: number | null;
          event: string;
          extension_id: string;
          extension_version: string;
          id: string;
          surface: string | null;
        };
        Insert: {
          actor?: string;
          created_at?: string;
          detail?: string | null;
          duration_ms?: number | null;
          event: string;
          extension_id: string;
          extension_version: string;
          id?: string;
          surface?: string | null;
        };
        Update: {
          actor?: string;
          created_at?: string;
          detail?: string | null;
          duration_ms?: number | null;
          event?: string;
          extension_id?: string;
          extension_version?: string;
          id?: string;
          surface?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "extension_runs_extension_id_fkey";
            columns: ["extension_id"];
            isOneToOne: false;
            referencedRelation: "extensions";
            referencedColumns: ["id"];
          },
        ];
      };
      extensions: {
        Row: {
          builtin: boolean;
          created_at: string;
          endpoint: string | null;
          id: string;
          last_test_at: string | null;
          last_test_note: string | null;
          license: string;
          manifest: Json;
          module_source: string | null;
          name: string;
          needs_paid_service: boolean;
          previous_version: Json | null;
          purpose: string;
          requirements: string | null;
          runtime: string;
          secret_name: string | null;
          slug: string;
          source_url: string | null;
          status: string;
          status_note: string | null;
          updated_at: string;
          version: string;
        };
        Insert: {
          builtin?: boolean;
          created_at?: string;
          endpoint?: string | null;
          id?: string;
          last_test_at?: string | null;
          last_test_note?: string | null;
          license: string;
          manifest: Json;
          module_source?: string | null;
          name: string;
          needs_paid_service?: boolean;
          previous_version?: Json | null;
          purpose: string;
          requirements?: string | null;
          runtime: string;
          secret_name?: string | null;
          slug: string;
          source_url?: string | null;
          status?: string;
          status_note?: string | null;
          updated_at?: string;
          version: string;
        };
        Update: {
          builtin?: boolean;
          created_at?: string;
          endpoint?: string | null;
          id?: string;
          last_test_at?: string | null;
          last_test_note?: string | null;
          license?: string;
          manifest?: Json;
          module_source?: string | null;
          name?: string;
          needs_paid_service?: boolean;
          previous_version?: Json | null;
          purpose?: string;
          requirements?: string | null;
          runtime?: string;
          secret_name?: string | null;
          slug?: string;
          source_url?: string | null;
          status?: string;
          status_note?: string | null;
          updated_at?: string;
          version?: string;
        };
        Relationships: [];
      };
      feedback_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          screenshot_path: string | null;
          sender: string;
          thread_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          screenshot_path?: string | null;
          sender: string;
          thread_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          screenshot_path?: string | null;
          sender?: string;
          thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "feedback_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback_status_history: {
        Row: {
          created_at: string;
          from_status: string | null;
          id: string;
          note: string | null;
          thread_id: string;
          to_status: string;
        };
        Insert: {
          created_at?: string;
          from_status?: string | null;
          id?: string;
          note?: string | null;
          thread_id: string;
          to_status: string;
        };
        Update: {
          created_at?: string;
          from_status?: string | null;
          id?: string;
          note?: string | null;
          thread_id?: string;
          to_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_status_history_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "feedback_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback_threads: {
        Row: {
          category: string;
          created_at: string;
          email: string;
          id: string;
          last_admin_reply_at: string | null;
          status: string;
          subject: string;
          updated_at: string;
          user_id: string;
          user_seen_at: string | null;
        };
        Insert: {
          category: string;
          created_at?: string;
          email: string;
          id?: string;
          last_admin_reply_at?: string | null;
          status?: string;
          subject: string;
          updated_at?: string;
          user_id: string;
          user_seen_at?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          email?: string;
          id?: string;
          last_admin_reply_at?: string | null;
          status?: string;
          subject?: string;
          updated_at?: string;
          user_id?: string;
          user_seen_at?: string | null;
        };
        Relationships: [];
      };
      glyph_eval_runs: {
        Row: {
          accuracy: number | null;
          created_at: string;
          exemplars: number;
          feature_version: number;
          id: string;
          letters: number;
          method: string;
          per_letter: Json | null;
          script: string | null;
        };
        Insert: {
          accuracy?: number | null;
          created_at?: string;
          exemplars?: number;
          feature_version?: number;
          id?: string;
          letters?: number;
          method?: string;
          per_letter?: Json | null;
          script?: string | null;
        };
        Update: {
          accuracy?: number | null;
          created_at?: string;
          exemplars?: number;
          feature_version?: number;
          id?: string;
          letters?: number;
          method?: string;
          per_letter?: Json | null;
          script?: string | null;
        };
        Relationships: [];
      };
      glyph_exemplars: {
        Row: {
          app_version: string | null;
          bbox: Json | null;
          corpus_image_id: string | null;
          created_at: string;
          feature_version: number;
          features: number[];
          id: string;
          letter: string;
          notes: string | null;
          provenance: string | null;
          review_status: string;
          reviewed_at: string | null;
          script: string;
          source: string;
          transliteration: string | null;
          unknown_sign: boolean;
        };
        Insert: {
          app_version?: string | null;
          bbox?: Json | null;
          corpus_image_id?: string | null;
          created_at?: string;
          feature_version?: number;
          features: number[];
          id?: string;
          letter: string;
          notes?: string | null;
          provenance?: string | null;
          review_status?: string;
          reviewed_at?: string | null;
          script: string;
          source?: string;
          transliteration?: string | null;
          unknown_sign?: boolean;
        };
        Update: {
          app_version?: string | null;
          bbox?: Json | null;
          corpus_image_id?: string | null;
          created_at?: string;
          feature_version?: number;
          features?: number[];
          id?: string;
          letter?: string;
          notes?: string | null;
          provenance?: string | null;
          review_status?: string;
          reviewed_at?: string | null;
          script?: string;
          source?: string;
          transliteration?: string | null;
          unknown_sign?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "glyph_exemplars_corpus_image_id_fkey";
            columns: ["corpus_image_id"];
            isOneToOne: false;
            referencedRelation: "corpus_images";
            referencedColumns: ["id"];
          },
        ];
      };
      glyph_models: {
        Row: {
          accuracy: number | null;
          activated_at: string | null;
          classes: Json;
          created_at: string;
          feature_version: number;
          id: string;
          letters: number;
          macro_f1: number | null;
          metrics: Json;
          provenance: string | null;
          script: string;
          status: string;
          trained_on: number;
          version: number;
        };
        Insert: {
          accuracy?: number | null;
          activated_at?: string | null;
          classes: Json;
          created_at?: string;
          feature_version?: number;
          id?: string;
          letters?: number;
          macro_f1?: number | null;
          metrics: Json;
          provenance?: string | null;
          script: string;
          status?: string;
          trained_on?: number;
          version: number;
        };
        Update: {
          accuracy?: number | null;
          activated_at?: string | null;
          classes?: Json;
          created_at?: string;
          feature_version?: number;
          id?: string;
          letters?: number;
          macro_f1?: number | null;
          metrics?: Json;
          provenance?: string | null;
          script?: string;
          status?: string;
          trained_on?: number;
          version?: number;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          delivery: string;
          email: string;
          expires_at: string;
          id: string;
          note: string | null;
          status: string;
        };
        Insert: {
          accepted_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          delivery?: string;
          email: string;
          expires_at?: string;
          id?: string;
          note?: string | null;
          status?: string;
        };
        Update: {
          accepted_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          delivery?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          note?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          approved_at: string | null;
          created_at: string;
          display_name: string | null;
          email: string;
          id: string;
          invited_email: string | null;
          status: Database["public"]["Enums"]["access_status"];
          status_note: string | null;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          email: string;
          id: string;
          invited_email?: string | null;
          status?: Database["public"]["Enums"]["access_status"];
          status_note?: string | null;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string;
          id?: string;
          invited_email?: string | null;
          status?: Database["public"]["Enums"]["access_status"];
          status_note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      reading_corrections: {
        Row: {
          corrected_reading: string;
          created_at: string;
          id: string;
          machine_reading: string | null;
          meaning_ar: string | null;
          permission_note: string | null;
          reason: string | null;
          review_status: string;
          reviewed_at: string | null;
          reviewer_note: string | null;
          script: string;
          siglum: string | null;
          source_note: string | null;
          word: string | null;
        };
        Insert: {
          corrected_reading: string;
          created_at?: string;
          id?: string;
          machine_reading?: string | null;
          meaning_ar?: string | null;
          permission_note?: string | null;
          reason?: string | null;
          review_status?: string;
          reviewed_at?: string | null;
          reviewer_note?: string | null;
          script: string;
          siglum?: string | null;
          source_note?: string | null;
          word?: string | null;
        };
        Update: {
          corrected_reading?: string;
          created_at?: string;
          id?: string;
          machine_reading?: string | null;
          meaning_ar?: string | null;
          permission_note?: string | null;
          reason?: string | null;
          review_status?: string;
          reviewed_at?: string | null;
          reviewer_note?: string | null;
          script?: string;
          siglum?: string | null;
          source_note?: string | null;
          word?: string | null;
        };
        Relationships: [];
      };
      recon_jobs: {
        Row: {
          attempts: number;
          canceled_at: string | null;
          claimed_at: string | null;
          claimed_by: string | null;
          completed_at: string | null;
          created_at: string;
          error: string | null;
          formats: Json;
          heartbeat_at: string | null;
          id: string;
          log: string | null;
          model_path: string | null;
          owner_key: string;
          owner_label: string | null;
          photo_count: number;
          photo_paths: string[];
          progress: number;
          project_name: string | null;
          scale_reference: string | null;
          stage: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          canceled_at?: string | null;
          claimed_at?: string | null;
          claimed_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error?: string | null;
          formats?: Json;
          heartbeat_at?: string | null;
          id?: string;
          log?: string | null;
          model_path?: string | null;
          owner_key: string;
          owner_label?: string | null;
          photo_count?: number;
          photo_paths?: string[];
          progress?: number;
          project_name?: string | null;
          scale_reference?: string | null;
          stage?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          canceled_at?: string | null;
          claimed_at?: string | null;
          claimed_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error?: string | null;
          formats?: Json;
          heartbeat_at?: string | null;
          id?: string;
          log?: string | null;
          model_path?: string | null;
          owner_key?: string;
          owner_label?: string | null;
          photo_count?: number;
          photo_paths?: string[];
          progress?: number;
          project_name?: string | null;
          scale_reference?: string | null;
          stage?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reference_collections: {
        Row: {
          id: string;
          imported_at: string;
          license_note: string | null;
          records: number;
          source: string;
          source_url: string | null;
          version: string;
        };
        Insert: {
          id?: string;
          imported_at?: string;
          license_note?: string | null;
          records?: number;
          source: string;
          source_url?: string | null;
          version: string;
        };
        Update: {
          id?: string;
          imported_at?: string;
          license_note?: string | null;
          records?: number;
          source?: string;
          source_url?: string | null;
          version?: string;
        };
        Relationships: [];
      };
      reference_inscriptions: {
        Row: {
          alt_sigla: string | null;
          collection_id: string | null;
          created_at: string;
          id: string;
          language: string | null;
          provenance_notes: string | null;
          reference: string | null;
          script: string | null;
          siglum: string;
          site: string | null;
          source: string;
          translation: string | null;
          transliteration: string | null;
          transliteration_plain: string | null;
          url: string | null;
        };
        Insert: {
          alt_sigla?: string | null;
          collection_id?: string | null;
          created_at?: string;
          id?: string;
          language?: string | null;
          provenance_notes?: string | null;
          reference?: string | null;
          script?: string | null;
          siglum: string;
          site?: string | null;
          source: string;
          translation?: string | null;
          transliteration?: string | null;
          transliteration_plain?: string | null;
          url?: string | null;
        };
        Update: {
          alt_sigla?: string | null;
          collection_id?: string | null;
          created_at?: string;
          id?: string;
          language?: string | null;
          provenance_notes?: string | null;
          reference?: string | null;
          script?: string | null;
          siglum?: string;
          site?: string | null;
          source?: string;
          translation?: string | null;
          transliteration?: string | null;
          transliteration_plain?: string | null;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reference_inscriptions_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "reference_collections";
            referencedColumns: ["id"];
          },
        ];
      };
      research_documents: {
        Row: {
          authors: string | null;
          created_at: string;
          id: string;
          license: string;
          page_count: number;
          permission_note: string | null;
          publisher: string | null;
          source_url: string | null;
          title: string;
          year: number | null;
        };
        Insert: {
          authors?: string | null;
          created_at?: string;
          id?: string;
          license: string;
          page_count?: number;
          permission_note?: string | null;
          publisher?: string | null;
          source_url?: string | null;
          title: string;
          year?: number | null;
        };
        Update: {
          authors?: string | null;
          created_at?: string;
          id?: string;
          license?: string;
          page_count?: number;
          permission_note?: string | null;
          publisher?: string | null;
          source_url?: string | null;
          title?: string;
          year?: number | null;
        };
        Relationships: [];
      };
      research_pages: {
        Row: {
          document_id: string;
          id: string;
          page: number;
          text: string;
          tsv: unknown;
        };
        Insert: {
          document_id: string;
          id?: string;
          page: number;
          text: string;
          tsv?: unknown;
        };
        Update: {
          document_id?: string;
          id?: string;
          page?: number;
          text?: string;
          tsv?: unknown;
        };
        Relationships: [
          {
            foreignKeyName: "research_pages_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "research_documents";
            referencedColumns: ["id"];
          },
        ];
      };
      worker_credentials: {
        Row: {
          created_at: string;
          host: string | null;
          id: string;
          label: string;
          last_seen_at: string | null;
          meshroom_version: string | null;
          revoked_at: string | null;
          token_hash: string;
          token_prefix: string;
        };
        Insert: {
          created_at?: string;
          host?: string | null;
          id?: string;
          label: string;
          last_seen_at?: string | null;
          meshroom_version?: string | null;
          revoked_at?: string | null;
          token_hash: string;
          token_prefix: string;
        };
        Update: {
          created_at?: string;
          host?: string | null;
          id?: string;
          label?: string;
          last_seen_at?: string | null;
          meshroom_version?: string | null;
          revoked_at?: string | null;
          token_hash?: string;
          token_prefix?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      redeem_access_code: {
        Args: { p_code: string };
        Returns: {
          code: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          label: string | null;
          last_used_at: string | null;
          max_uses: number;
          revoked_at: string | null;
          status: string;
          uses: number;
        }[];
      };
      glyph_dataset_counts: {
        Args: { _script: string };
        Returns: {
          approved: number;
          letter: string;
          pending: number;
        }[];
      };
      search_reference_inscriptions: {
        Args: { _limit?: number; _q: string; _script?: string };
        Returns: {
          language: string;
          script: string;
          siglum: string;
          similarity: number;
          site: string;
          source: string;
          translation: string;
          transliteration: string;
          url: string;
        }[];
      };
      search_research_pages: {
        Args: { _limit?: number; _q: string };
        Returns: {
          authors: string;
          document_id: string;
          license: string;
          page: number;
          rank: number;
          snippet: string;
          source_url: string;
          title: string;
          year: number;
        }[];
      };
    };
    Enums: {
      access_status: "pending" | "approved" | "suspended" | "revoked";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      access_status: ["pending", "approved", "suspended", "revoked"],
    },
  },
} as const;

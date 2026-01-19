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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          colis_names: Json | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          colis_names?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          colis_names?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      count_logs: {
        Row: {
          colis_number: number
          counted_by: string | null
          created_at: string
          id: string
          operation: string
          product_id: string
          quantity_after: number
          quantity_before: number
          session_id: string
        }
        Insert: {
          colis_number: number
          counted_by?: string | null
          created_at?: string
          id?: string
          operation: string
          product_id: string
          quantity_after: number
          quantity_before: number
          session_id: string
        }
        Update: {
          colis_number?: number
          counted_by?: string | null
          created_at?: string
          id?: string
          operation?: string
          product_id?: string
          quantity_after?: number
          quantity_before?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "count_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "count_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "counting_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      counting_sessions: {
        Row: {
          category: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          status: string
        }
        Insert: {
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          status?: string
        }
        Update: {
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      counts: {
        Row: {
          colis_number: number
          counted_at: string
          counted_by: string | null
          id: string
          location: string | null
          pallet_number: string | null
          product_id: string
          quantity: number
          session_id: string
          updated_at: string
        }
        Insert: {
          colis_number: number
          counted_at?: string
          counted_by?: string | null
          id?: string
          location?: string | null
          pallet_number?: string | null
          product_id: string
          quantity?: number
          session_id: string
          updated_at?: string
        }
        Update: {
          colis_number?: number
          counted_at?: string
          counted_by?: string | null
          id?: string
          location?: string | null
          pallet_number?: string | null
          product_id?: string
          quantity?: number
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "counts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "counting_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_changes: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          field_changed: string | null
          id: string
          new_value: string | null
          old_value: string | null
          product_id: string
        }
        Insert: {
          change_type: string
          changed_at?: string
          changed_by?: string | null
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          product_id: string
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_changes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          location: string | null
          name: string
          pallet_number: string | null
          total_colis: number
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name: string
          pallet_number?: string | null
          total_colis?: number
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          pallet_number?: string | null
          total_colis?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reconciliation_items: {
        Row: {
          counted_quantity: number
          created_at: string
          difference: number | null
          expected_quantity: number
          id: string
          notes: string | null
          product_code: string
          product_id: string | null
          product_name: string
          reconciliation_id: string
          status: string
          updated_at: string
        }
        Insert: {
          counted_quantity?: number
          created_at?: string
          difference?: number | null
          expected_quantity?: number
          id?: string
          notes?: string | null
          product_code: string
          product_id?: string | null
          product_name: string
          reconciliation_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          counted_quantity?: number
          created_at?: string
          difference?: number | null
          expected_quantity?: number
          id?: string
          notes?: string | null
          product_code?: string
          product_id?: string | null
          product_name?: string
          reconciliation_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_items_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          session_id: string
          status: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          session_id: string
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          session_id?: string
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

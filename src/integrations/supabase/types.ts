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
      categories: {
        Row: {
          colis_names: Json | null
          created_at: string
          description: string | null
          id: string
          name: string
          requires_order_number: boolean
          updated_at: string
        }
        Insert: {
          colis_names?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          requires_order_number?: boolean
          updated_at?: string
        }
        Update: {
          colis_names?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          requires_order_number?: boolean
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
          session_id: string | null
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
          session_id?: string | null
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
          session_id?: string | null
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
      count_operations: {
        Row: {
          count_id: string | null
          created_at: string
          delta: number | null
          op_key: string
          quantity_after: number
          user_id: string | null
        }
        Insert: {
          count_id?: string | null
          created_at?: string
          delta?: number | null
          op_key: string
          quantity_after: number
          user_id?: string | null
        }
        Update: {
          count_id?: string | null
          created_at?: string
          delta?: number | null
          op_key?: string
          quantity_after?: number
          user_id?: string | null
        }
        Relationships: []
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
          product_id: string
          quantity: number
          session_id: string | null
          updated_at: string
        }
        Insert: {
          colis_number: number
          counted_at?: string
          counted_by?: string | null
          id?: string
          location?: string | null
          product_id: string
          quantity?: number
          session_id?: string | null
          updated_at?: string
        }
        Update: {
          colis_number?: number
          counted_at?: string
          counted_by?: string | null
          id?: string
          location?: string | null
          product_id?: string
          quantity?: number
          session_id?: string | null
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
      delivery_attempt_lines: {
        Row: {
          attempt_id: string
          colis_number: number
          created_at: string
          delivered_quantity: number
          details: string | null
          exception_note: string | null
          id: string
          loaded_quantity: number
          note_item_id: string | null
          ordered_quantity: number
          product_code: string
          product_id: string | null
          product_name: string
          received_at: string | null
          received_by: string | null
          return_location: string | null
          return_received_damaged: number
          return_received_ok: number
          undelivered_reason: string | null
          updated_at: string
        }
        Insert: {
          attempt_id: string
          colis_number?: number
          created_at?: string
          delivered_quantity?: number
          details?: string | null
          exception_note?: string | null
          id?: string
          loaded_quantity?: number
          note_item_id?: string | null
          ordered_quantity?: number
          product_code?: string
          product_id?: string | null
          product_name?: string
          received_at?: string | null
          received_by?: string | null
          return_location?: string | null
          return_received_damaged?: number
          return_received_ok?: number
          undelivered_reason?: string | null
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          colis_number?: number
          created_at?: string
          delivered_quantity?: number
          details?: string | null
          exception_note?: string | null
          id?: string
          loaded_quantity?: number
          note_item_id?: string | null
          ordered_quantity?: number
          product_code?: string
          product_id?: string | null
          product_name?: string
          received_at?: string | null
          received_by?: string | null
          return_location?: string | null
          return_received_damaged?: number
          return_received_ok?: number
          undelivered_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attempt_lines_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignment_conflicts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "delivery_attempt_lines_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_attempt_lines_note_item_id_fkey"
            columns: ["note_item_id"]
            isOneToOne: false
            referencedRelation: "delivery_note_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_attempt_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_attempts: {
        Row: {
          address: string | null
          assigned_at: string
          assigned_by: string | null
          attempt_number: number
          client_name: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          delivery_instructions: string | null
          driver_id: string | null
          failure_notes: string | null
          failure_reason: string | null
          id: string
          note_id: string
          order_number: string
          outcome: string | null
          partial_load: boolean
          partial_load_reason: string | null
          route_id: string | null
          scheduled_date: string | null
          started_at: string | null
          status: string
          updated_at: string
          vehicle_location: string | null
          version: number
        }
        Insert: {
          address?: string | null
          assigned_at?: string
          assigned_by?: string | null
          attempt_number: number
          client_name?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          delivery_instructions?: string | null
          driver_id?: string | null
          failure_notes?: string | null
          failure_reason?: string | null
          id?: string
          note_id: string
          order_number: string
          outcome?: string | null
          partial_load?: boolean
          partial_load_reason?: string | null
          route_id?: string | null
          scheduled_date?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          vehicle_location?: string | null
          version?: number
        }
        Update: {
          address?: string | null
          assigned_at?: string
          assigned_by?: string | null
          attempt_number?: number
          client_name?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          delivery_instructions?: string | null
          driver_id?: string | null
          failure_notes?: string | null
          failure_reason?: string | null
          id?: string
          note_id?: string
          order_number?: string
          outcome?: string | null
          partial_load?: boolean
          partial_load_reason?: string | null
          route_id?: string | null
          scheduled_date?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          vehicle_location?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attempts_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_attempts_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "route_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_events: {
        Row: {
          actor: string | null
          attempt_id: string | null
          created_at: string
          event_type: string
          id: string
          note_id: string | null
          payload: Json
        }
        Insert: {
          actor?: string | null
          attempt_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          note_id?: string | null
          payload?: Json
        }
        Update: {
          actor?: string | null
          attempt_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          note_id?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "delivery_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignment_conflicts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "delivery_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_incidents: {
        Row: {
          attachments: Json
          attempt_id: string | null
          client_name: string | null
          created_at: string
          deduplicated: boolean | null
          delivery_outcome: string | null
          description: string
          dispatch_attempts: number
          dispatch_status: string
          driver_id: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          note_id: string | null
          occurred_at: string
          op_key: string | null
          order_number: string
          product_lines: Json
          route_id: string | null
          subject: string
          ticket_id: string | null
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          attempt_id?: string | null
          client_name?: string | null
          created_at?: string
          deduplicated?: boolean | null
          delivery_outcome?: string | null
          description: string
          dispatch_attempts?: number
          dispatch_status?: string
          driver_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          note_id?: string | null
          occurred_at?: string
          op_key?: string | null
          order_number: string
          product_lines?: Json
          route_id?: string | null
          subject: string
          ticket_id?: string | null
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          attempt_id?: string | null
          client_name?: string | null
          created_at?: string
          deduplicated?: boolean | null
          delivery_outcome?: string | null
          description?: string
          dispatch_attempts?: number
          dispatch_status?: string
          driver_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          note_id?: string | null
          occurred_at?: string
          op_key?: string | null
          order_number?: string
          product_lines?: Json
          route_id?: string | null
          subject?: string
          ticket_id?: string | null
          ticket_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_incidents_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignment_conflicts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "delivery_incidents_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_incidents_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_incidents_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "route_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_note_items: {
        Row: {
          created_at: string
          delivered_quantity: number
          details: string | null
          id: string
          loaded_quantity: number
          location: string | null
          note_id: string
          product_code: string
          product_id: string | null
          product_name: string
          quantity: number
          returned_quantity: number
          staged_quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_quantity?: number
          details?: string | null
          id?: string
          loaded_quantity?: number
          location?: string | null
          note_id: string
          product_code?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          returned_quantity?: number
          staged_quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_quantity?: number
          details?: string | null
          id?: string
          loaded_quantity?: number
          location?: string | null
          note_id?: string
          product_code?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          returned_quantity?: number
          staged_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_note_items_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_note_payables: {
        Row: {
          active: boolean
          amount_cents: number
          approved_at: string | null
          approved_by: string | null
          classification: string
          created_at: string
          due_date: string | null
          exception_note: string | null
          fetched_at: string | null
          gc_sale_code: string | null
          gc_sale_id: string | null
          gc_status: string | null
          gc_store: string | null
          id: string
          import_id: string | null
          imported_by: string | null
          method_id: string | null
          method_raw_id: string | null
          method_raw_name: string | null
          note_id: string
          parcel_key: string
          revision: number
          route_id: string | null
          snapshot: Json
          source_url: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_cents: number
          approved_at?: string | null
          approved_by?: string | null
          classification: string
          created_at?: string
          due_date?: string | null
          exception_note?: string | null
          fetched_at?: string | null
          gc_sale_code?: string | null
          gc_sale_id?: string | null
          gc_status?: string | null
          gc_store?: string | null
          id?: string
          import_id?: string | null
          imported_by?: string | null
          method_id?: string | null
          method_raw_id?: string | null
          method_raw_name?: string | null
          note_id: string
          parcel_key: string
          revision?: number
          route_id?: string | null
          snapshot?: Json
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          classification?: string
          created_at?: string
          due_date?: string | null
          exception_note?: string | null
          fetched_at?: string | null
          gc_sale_code?: string | null
          gc_sale_id?: string | null
          gc_status?: string | null
          gc_store?: string | null
          id?: string
          import_id?: string | null
          imported_by?: string | null
          method_id?: string | null
          method_raw_id?: string | null
          method_raw_name?: string | null
          note_id?: string
          parcel_key?: string
          revision?: number
          route_id?: string | null
          snapshot?: Json
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_note_payables_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "route_previsto_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_payables_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_payables_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_payables_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "route_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_notes: {
        Row: {
          address: string | null
          cancellation_reason: string | null
          cancellation_requested: boolean
          cancelled_at: string | null
          cancelled_by: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivered_by: string | null
          delivery_instructions: string | null
          dock_location: string | null
          id: string
          loaded_at: string | null
          notes: string | null
          order_number: string
          reschedule_requested: boolean
          returned_at: string | null
          route_id: string | null
          staged_at: string | null
          status: string
          task_id: string | null
          updated_at: string
          vehicle_location: string | null
          version: number
        }
        Insert: {
          address?: string | null
          cancellation_reason?: string | null
          cancellation_requested?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_instructions?: string | null
          dock_location?: string | null
          id?: string
          loaded_at?: string | null
          notes?: string | null
          order_number: string
          reschedule_requested?: boolean
          returned_at?: string | null
          route_id?: string | null
          staged_at?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          vehicle_location?: string | null
          version?: number
        }
        Update: {
          address?: string | null
          cancellation_reason?: string | null
          cancellation_requested?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_instructions?: string | null
          dock_location?: string | null
          id?: string
          loaded_at?: string | null
          notes?: string | null
          order_number?: string
          reschedule_requested?: boolean
          returned_at?: string | null
          route_id?: string | null
          staged_at?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          vehicle_location?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_notes_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "route_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "scanner_picking_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_operations: {
        Row: {
          actor: string | null
          attempt_id: string | null
          created_at: string
          kind: string
          op_key: string
          payload_hash: string | null
          resource: string | null
          result: Json
        }
        Insert: {
          actor?: string | null
          attempt_id?: string | null
          created_at?: string
          kind: string
          op_key: string
          payload_hash?: string | null
          resource?: string | null
          result?: Json
        }
        Update: {
          actor?: string | null
          attempt_id?: string | null
          created_at?: string
          kind?: string
          op_key?: string
          payload_hash?: string | null
          resource?: string | null
          result?: Json
        }
        Relationships: []
      }
      delivery_payable_adjustments: {
        Row: {
          active: boolean
          amount_cents: number
          attempt_id: string
          authorized_by: string
          created_at: string
          id: string
          note_id: string
          reason: string
        }
        Insert: {
          active?: boolean
          amount_cents: number
          attempt_id: string
          authorized_by: string
          created_at?: string
          id?: string
          note_id: string
          reason: string
        }
        Update: {
          active?: boolean
          amount_cents?: number
          attempt_id?: string
          authorized_by?: string
          created_at?: string
          id?: string
          note_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_payable_adjustments_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignment_conflicts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "delivery_payable_adjustments_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_payable_adjustments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_payments: {
        Row: {
          amount_cents: number
          attempt_id: string
          change_cents: number
          closure_id: string | null
          created_at: string
          declared_at: string
          declared_by: string
          difference_reason: string | null
          gross_cents: number | null
          id: string
          locked: boolean
          method_id: string
          note_id: string
          notes: string | null
          op_key: string
          reference: string | null
          revision: number
          route_id: string | null
          superseded_at: string | null
          superseded_by: string | null
        }
        Insert: {
          amount_cents: number
          attempt_id: string
          change_cents?: number
          closure_id?: string | null
          created_at?: string
          declared_at?: string
          declared_by: string
          difference_reason?: string | null
          gross_cents?: number | null
          id?: string
          locked?: boolean
          method_id: string
          note_id: string
          notes?: string | null
          op_key: string
          reference?: string | null
          revision?: number
          route_id?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
        }
        Update: {
          amount_cents?: number
          attempt_id?: string
          change_cents?: number
          closure_id?: string | null
          created_at?: string
          declared_at?: string
          declared_by?: string
          difference_reason?: string | null
          gross_cents?: number | null
          id?: string
          locked?: boolean
          method_id?: string
          note_id?: string
          notes?: string | null
          op_key?: string
          reference?: string | null
          revision?: number
          route_id?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_payments_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignment_conflicts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "delivery_payments_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_payments_closure_fk"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "route_cash_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_payments_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_payments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_payments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "route_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_regions: {
        Row: {
          color: string | null
          created_at: string | null
          default_weekday: number | null
          id: string
          name: string
          postal_prefix_end: string
          postal_prefix_start: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          default_weekday?: number | null
          id?: string
          name: string
          postal_prefix_end: string
          postal_prefix_start: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          default_weekday?: number | null
          id?: string
          name?: string
          postal_prefix_end?: string
          postal_prefix_start?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      erp_products_cache: {
        Row: {
          code: string
          erp_stock: number
          fetched_at: string
          grupo: string
          id: string
          name: string
          raw_data: Json | null
        }
        Insert: {
          code: string
          erp_stock?: number
          fetched_at?: string
          grupo?: string
          id?: string
          name?: string
          raw_data?: Json | null
        }
        Update: {
          code?: string
          erp_stock?: number
          fetched_at?: string
          grupo?: string
          id?: string
          name?: string
          raw_data?: Json | null
        }
        Relationships: []
      }
      erp_sales_cache: {
        Row: {
          fetched_at: string
          id: string
          product_code: string
          venda_data: Json
        }
        Insert: {
          fetched_at?: string
          id?: string
          product_code: string
          venda_data?: Json
        }
        Update: {
          fetched_at?: string
          id?: string
          product_code?: string
          venda_data?: Json
        }
        Relationships: []
      }
      location_audit_items: {
        Row: {
          applied_at: string | null
          audit_id: string
          colis_number: number | null
          counted_at: string | null
          counted_by: string | null
          counted_quantity: number | null
          created_at: string
          difference: number | null
          expected_quantity: number
          id: string
          location: string
          movement_id: string | null
          notes: string | null
          product_code: string
          product_id: string | null
          product_name: string
          quantity_after: number | null
          quantity_before: number | null
          status: string
        }
        Insert: {
          applied_at?: string | null
          audit_id: string
          colis_number?: number | null
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          created_at?: string
          difference?: number | null
          expected_quantity?: number
          id?: string
          location: string
          movement_id?: string | null
          notes?: string | null
          product_code: string
          product_id?: string | null
          product_name: string
          quantity_after?: number | null
          quantity_before?: number | null
          status?: string
        }
        Update: {
          applied_at?: string | null
          audit_id?: string
          colis_number?: number | null
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          created_at?: string
          difference?: number | null
          expected_quantity?: number
          id?: string
          location?: string
          movement_id?: string | null
          notes?: string | null
          product_code?: string
          product_id?: string | null
          product_name?: string
          quantity_after?: number | null
          quantity_before?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_audit_items_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "location_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_audit_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      location_audits: {
        Row: {
          access_code: string | null
          assigned_to: string | null
          blind_mode: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivered_by: string | null
          id: string
          locations: string[]
          name: string
          notes: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          access_code?: string | null
          assigned_to?: string | null
          blind_mode?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          id?: string
          locations: string[]
          name: string
          notes?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_code?: string | null
          assigned_to?: string | null
          blind_mode?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          id?: string
          locations?: string[]
          name?: string
          notes?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      orphan_colis_flags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          missing_coli: number | null
          note: string | null
          product_id: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          missing_coli?: number | null
          note?: string | null
          product_id: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          missing_coli?: number | null
          note?: string | null
          product_id?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orphan_colis_flags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          active: boolean
          collect_on_delivery: boolean
          created_at: string
          display_order: number
          gc_identifiers: string[]
          gc_name_patterns: string[]
          id: string
          kind: string
          label: string
          requires_reference: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          collect_on_delivery?: boolean
          created_at?: string
          display_order?: number
          gc_identifiers?: string[]
          gc_name_patterns?: string[]
          id: string
          kind: string
          label: string
          requires_reference?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          collect_on_delivery?: boolean
          created_at?: string
          display_order?: number
          gc_identifiers?: string[]
          gc_name_patterns?: string[]
          id?: string
          kind?: string
          label?: string
          requires_reference?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      picking_items: {
        Row: {
          aisle_name: string | null
          id: string
          level_name: string | null
          location: string | null
          picked_at: string
          picking_session_id: string
          product_code: string
          product_id: string | null
          product_name: string
          quantity: number
          requires_forklift: boolean
        }
        Insert: {
          aisle_name?: string | null
          id?: string
          level_name?: string | null
          location?: string | null
          picked_at?: string
          picking_session_id: string
          product_code: string
          product_id?: string | null
          product_name: string
          quantity?: number
          requires_forklift?: boolean
        }
        Update: {
          aisle_name?: string | null
          id?: string
          level_name?: string | null
          location?: string | null
          picked_at?: string
          picking_session_id?: string
          product_code?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          requires_forklift?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "picking_items_picking_session_id_fkey"
            columns: ["picking_session_id"]
            isOneToOne: false
            referencedRelation: "picking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          reason: string | null
          reference: string | null
          status: string
          total_products: number
          total_units: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          reference?: string | null
          status?: string
          total_products?: number
          total_units?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          reference?: string | null
          status?: string
          total_products?: number
          total_units?: number
        }
        Relationships: []
      }
      product_barcodes: {
        Row: {
          barcode: string
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          barcode: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      product_damages: {
        Row: {
          colis_number: number | null
          created_at: string
          damage_type: string
          description: string | null
          id: string
          location: string | null
          product_id: string
          quantity: number
          reported_by: string | null
          resolution_notes: string | null
          resolution_type: string | null
          resolved_at: string | null
          source_colis_number: number | null
          source_count_id: string | null
          source_location: string | null
          status: string
          updated_at: string
        }
        Insert: {
          colis_number?: number | null
          created_at?: string
          damage_type: string
          description?: string | null
          id?: string
          location?: string | null
          product_id: string
          quantity?: number
          reported_by?: string | null
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          source_colis_number?: number | null
          source_count_id?: string | null
          source_location?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          colis_number?: number | null
          created_at?: string
          damage_type?: string
          description?: string | null
          id?: string
          location?: string | null
          product_id?: string
          quantity?: number
          reported_by?: string | null
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          source_colis_number?: number | null
          source_count_id?: string | null
          source_location?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_damages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category: string
          code: string
          colis_orfaos: number
          created_at: string
          current_stock: number
          damaged_stock: number
          description: string | null
          id: string
          last_supplier: string | null
          location: string | null
          min_stock: number
          name: string
          supplier_code: string | null
          total_colis: number
          unidades_fisicas: number
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category?: string
          code: string
          colis_orfaos?: number
          created_at?: string
          current_stock?: number
          damaged_stock?: number
          description?: string | null
          id?: string
          last_supplier?: string | null
          location?: string | null
          min_stock?: number
          name: string
          supplier_code?: string | null
          total_colis?: number
          unidades_fisicas?: number
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category?: string
          code?: string
          colis_orfaos?: number
          created_at?: string
          current_stock?: number
          damaged_stock?: number
          description?: string | null
          id?: string
          last_supplier?: string | null
          location?: string | null
          min_stock?: number
          name?: string
          supplier_code?: string | null
          total_colis?: number
          unidades_fisicas?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          name: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
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
          location: string | null
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
          location?: string | null
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
          location?: string | null
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
      route_cash_closures: {
        Row: {
          cash_declared_cents: number
          counted_at: string | null
          counted_by: string | null
          counted_cents: number | null
          created_at: string
          declared_cents: number
          difference_cents: number | null
          driver_id: string
          envelope_code: string
          exceptions: Json
          expected_cents: number
          id: string
          no_cash: boolean
          notes: string | null
          op_key: string | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          route_id: string
          settlement_note: string | null
          status: string
          submitted_at: string
          submitted_by: string
          totals: Json
          updated_at: string
        }
        Insert: {
          cash_declared_cents?: number
          counted_at?: string | null
          counted_by?: string | null
          counted_cents?: number | null
          created_at?: string
          declared_cents?: number
          difference_cents?: number | null
          driver_id: string
          envelope_code: string
          exceptions?: Json
          expected_cents?: number
          id?: string
          no_cash?: boolean
          notes?: string | null
          op_key?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route_id: string
          settlement_note?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
          totals?: Json
          updated_at?: string
        }
        Update: {
          cash_declared_cents?: number
          counted_at?: string | null
          counted_by?: string | null
          counted_cents?: number | null
          created_at?: string
          declared_cents?: number
          difference_cents?: number | null
          driver_id?: string
          envelope_code?: string
          exceptions?: Json
          expected_cents?: number
          id?: string
          no_cash?: boolean
          notes?: string | null
          op_key?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route_id?: string
          settlement_note?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          totals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_cash_closures_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "route_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      route_closure_method_checks: {
        Row: {
          closure_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_cents: number | null
          created_at: string
          declared_cents: number
          id: string
          method_id: string
          note: string | null
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          closure_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_cents?: number | null
          created_at?: string
          declared_cents: number
          id?: string
          method_id: string
          note?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          closure_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_cents?: number | null
          created_at?: string
          declared_cents?: number
          id?: string
          method_id?: string
          note?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_closure_method_checks_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "route_cash_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_closure_method_checks_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      route_previsto_imports: {
        Row: {
          composition_version: number
          created_at: string
          failures: Json
          id: string
          invalidated_at: string | null
          invalidated_reason: string | null
          notes_failed: number
          notes_ok: number
          notes_total: number
          op_key: string | null
          requested_by: string | null
          route_id: string
          status: string
          updated_at: string
        }
        Insert: {
          composition_version: number
          created_at?: string
          failures?: Json
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          notes_failed?: number
          notes_ok?: number
          notes_total?: number
          op_key?: string | null
          requested_by?: string | null
          route_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          composition_version?: number
          created_at?: string
          failures?: Json
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          notes_failed?: number
          notes_ok?: number
          notes_total?: number
          op_key?: string | null
          requested_by?: string | null
          route_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_previsto_imports_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "route_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      route_schedules: {
        Row: {
          barcode: string | null
          composition_version: number
          created_at: string
          created_by: string | null
          departure_address: string | null
          departure_lat: number | null
          departure_lon: number | null
          departure_postal_code: string | null
          driver_assigned_at: string | null
          driver_assigned_by: string | null
          driver_id: string | null
          financial_status: string
          id: string
          name: string
          notes: string | null
          preparation_closed_at: string | null
          preparation_closed_by: string | null
          preparation_reopen_reason: string | null
          region_id: string | null
          return_to_base: boolean
          scheduled_date: string
          status: string
          updated_at: string
          vehicle_location_id: string | null
        }
        Insert: {
          barcode?: string | null
          composition_version?: number
          created_at?: string
          created_by?: string | null
          departure_address?: string | null
          departure_lat?: number | null
          departure_lon?: number | null
          departure_postal_code?: string | null
          driver_assigned_at?: string | null
          driver_assigned_by?: string | null
          driver_id?: string | null
          financial_status?: string
          id?: string
          name: string
          notes?: string | null
          preparation_closed_at?: string | null
          preparation_closed_by?: string | null
          preparation_reopen_reason?: string | null
          region_id?: string | null
          return_to_base?: boolean
          scheduled_date: string
          status?: string
          updated_at?: string
          vehicle_location_id?: string | null
        }
        Update: {
          barcode?: string | null
          composition_version?: number
          created_at?: string
          created_by?: string | null
          departure_address?: string | null
          departure_lat?: number | null
          departure_lon?: number | null
          departure_postal_code?: string | null
          driver_assigned_at?: string | null
          driver_assigned_by?: string | null
          driver_id?: string | null
          financial_status?: string
          id?: string
          name?: string
          notes?: string | null
          preparation_closed_at?: string | null
          preparation_closed_by?: string | null
          preparation_reopen_reason?: string | null
          region_id?: string | null
          return_to_base?: boolean
          scheduled_date?: string
          status?: string
          updated_at?: string
          vehicle_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_schedules_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "delivery_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_schedules_vehicle_location_id_fkey"
            columns: ["vehicle_location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      route_stops: {
        Row: {
          address: string | null
          city: string | null
          client_name: string
          created_at: string
          freguesia: string | null
          id: string
          latitude: number | null
          longitude: number | null
          municipio: string | null
          notes: string | null
          order_number: number
          postal_code: string | null
          route_id: string
          status: string
          updated_at: string
          venda_codigo: string | null
          venda_data: string | null
          venda_id: string | null
          venda_status: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_name: string
          created_at?: string
          freguesia?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          municipio?: string | null
          notes?: string | null
          order_number?: number
          postal_code?: string | null
          route_id: string
          status?: string
          updated_at?: string
          venda_codigo?: string | null
          venda_data?: string | null
          venda_id?: string | null
          venda_status?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          client_name?: string
          created_at?: string
          freguesia?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          municipio?: string | null
          notes?: string | null
          order_number?: number
          postal_code?: string | null
          route_id?: string
          status?: string
          updated_at?: string
          venda_codigo?: string | null
          venda_data?: string | null
          venda_id?: string | null
          venda_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "route_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      scanner_picking_task_items: {
        Row: {
          created_at: string
          details: string | null
          excluded: boolean
          id: string
          locations: string | null
          orders: string | null
          picked_at: string | null
          picked_by: string | null
          picked_location: string | null
          picked_quantity: number
          product_code: string
          product_id: string | null
          product_name: string
          requested_quantity: number
          shortage_notes: string | null
          shortage_quantity: number
          shortage_reason: string | null
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          excluded?: boolean
          id?: string
          locations?: string | null
          orders?: string | null
          picked_at?: string | null
          picked_by?: string | null
          picked_location?: string | null
          picked_quantity?: number
          product_code?: string
          product_id?: string | null
          product_name: string
          requested_quantity?: number
          shortage_notes?: string | null
          shortage_quantity?: number
          shortage_reason?: string | null
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          excluded?: boolean
          id?: string
          locations?: string | null
          orders?: string | null
          picked_at?: string | null
          picked_by?: string | null
          picked_location?: string | null
          picked_quantity?: number
          product_code?: string
          product_id?: string | null
          product_name?: string
          requested_quantity?: number
          shortage_notes?: string | null
          shortage_quantity?: number
          shortage_reason?: string | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scanner_picking_task_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scanner_picking_task_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "scanner_picking_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      scanner_picking_tasks: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          reference: string | null
          route_id: string | null
          source: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          reference?: string | null
          route_id?: string | null
          source?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          reference?: string | null
          route_id?: string | null
          source?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scanner_picking_tasks_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "route_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movement_lines: {
        Row: {
          colis_number: number
          created_at: string
          id: string
          location: string | null
          location_to: string | null
          movement_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          colis_number: number
          created_at?: string
          id?: string
          location?: string | null
          location_to?: string | null
          movement_id: string
          product_id: string
          quantity: number
        }
        Update: {
          colis_number?: number
          created_at?: string
          id?: string
          location?: string | null
          location_to?: string | null
          movement_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_lines_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          notes: string | null
          product_id: string
          quantity: number
          reason: string | null
          reference: string | null
          reversed_at: string | null
          reversed_by: string | null
          reverses_movement_id: string | null
          supplier_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          notes?: string | null
          product_id: string
          quantity: number
          reason?: string | null
          reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reverses_movement_id?: string | null
          supplier_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reason?: string | null
          reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reverses_movement_id?: string | null
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reverses_movement_id_fkey"
            columns: ["reverses_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements_archive: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          notes: string | null
          product_id: string
          quantity: number
          reason: string | null
          reference: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          notes?: string | null
          product_id: string
          quantity: number
          reason?: string | null
          reference?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reason?: string | null
          reference?: string | null
        }
        Relationships: []
      }
      stock_order_numbers: {
        Row: {
          colis_status: Json
          created_at: string
          id: string
          location: string | null
          order_number: string
          product_id: string
          updated_at: string
        }
        Insert: {
          colis_status?: Json
          created_at?: string
          id?: string
          location?: string | null
          order_number: string
          product_id: string
          updated_at?: string
        }
        Update: {
          colis_status?: Json
          created_at?: string
          id?: string
          location?: string | null
          order_number?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_order_numbers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_guides: {
        Row: {
          address_from: string
          batch_id: string | null
          client_name: string
          created_at: string
          created_by: string | null
          guide_id: number | null
          guide_number: string
          id: string
          order_code: string
          order_id: string
          permalink: string
          plate: string
          updated_at: string
          version: number
        }
        Insert: {
          address_from?: string
          batch_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          guide_id?: number | null
          guide_number?: string
          id?: string
          order_code?: string
          order_id: string
          permalink?: string
          plate?: string
          updated_at?: string
          version?: number
        }
        Update: {
          address_from?: string
          batch_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          guide_id?: number | null
          guide_number?: string
          id?: string
          order_code?: string
          order_id?: string
          permalink?: string
          plate?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      warehouse_aisles: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      warehouse_levels: {
        Row: {
          color: string | null
          created_at: string
          display_order: number
          id: string
          level_number: number
          name: string
          requires_forklift: boolean
          short_name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          display_order?: number
          id?: string
          level_number?: number
          name: string
          requires_forklift?: boolean
          short_name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          display_order?: number
          id?: string
          level_number?: number
          name?: string
          requires_forklift?: boolean
          short_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      warehouse_locations: {
        Row: {
          aisle_id: string | null
          code: string
          created_at: string
          id: string
          is_staging: boolean
          level_id: string | null
          location_type: string
          notes: string | null
          plate: string | null
          position_in_aisle: number
          updated_at: string
        }
        Insert: {
          aisle_id?: string | null
          code: string
          created_at?: string
          id?: string
          is_staging?: boolean
          level_id?: string | null
          location_type?: string
          notes?: string | null
          plate?: string | null
          position_in_aisle?: number
          updated_at?: string
        }
        Update: {
          aisle_id?: string | null
          code?: string
          created_at?: string
          id?: string
          is_staging?: boolean
          level_id?: string | null
          location_type?: string
          notes?: string | null
          plate?: string | null
          position_in_aisle?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_locations_aisle_id_fkey"
            columns: ["aisle_id"]
            isOneToOne: false
            referencedRelation: "warehouse_aisles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_locations_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "warehouse_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      week_plans: {
        Row: {
          created_at: string
          created_by: string | null
          date_from: string
          date_to: string
          device_id: string
          id: string
          name: string
          plan: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string
          device_id?: string
          id?: string
          name?: string
          plan?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string
          device_id?: string
          id?: string
          name?: string
          plan?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      delivery_assignment_conflicts: {
        Row: {
          attempt_id: string | null
          client_name: string | null
          conflict_type: string | null
          legacy_driver_id: string | null
          note_id: string | null
          order_number: string | null
          route_driver_id: string | null
          route_id: string | null
          route_name: string | null
          scheduled_date: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attempts_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_attempts_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "route_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements_unified: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string | null
          movement_type: string | null
          notes: string | null
          origem: string | null
          product_id: string | null
          quantity: number | null
          reason: string | null
          reference: string | null
          reversed_at: string | null
          reverses_movement_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_reset_stock_data: { Args: never; Returns: Json }
      apply_count_delta: {
        Args: { p_count_id: string; p_delta: number; p_op_key?: string }
        Returns: Json
      }
      approve_note_payable_revision: {
        Args: { p_note_id: string; p_reason: string; p_revision: number }
        Returns: Json
      }
      assert_valid_location: { Args: { p_location: string }; Returns: string }
      assign_count_location: {
        Args: { p_count_id: string; p_location: string }
        Returns: string
      }
      assign_delivery_attempts: {
        Args: {
          p_driver: string
          p_note_ids: string[]
          p_op_key?: string
          p_scheduled_date?: string
        }
        Returns: Json
      }
      assign_route_delivery: {
        Args: {
          p_driver: string
          p_op_key?: string
          p_reason?: string
          p_route_id: string
        }
        Returns: Json
      }
      assign_route_driver: {
        Args: {
          p_driver: string
          p_op_key?: string
          p_reason?: string
          p_route_id: string
        }
        Returns: Json
      }
      attempt_amount_due: { Args: { p_attempt_id: string }; Returns: Json }
      can_execute_attempt: {
        Args: { _attempt_id: string; _uid: string }
        Returns: boolean
      }
      cancel_delivery_note: {
        Args: { p_note_id: string; p_op_key?: string; p_reason: string }
        Returns: Json
      }
      close_route_preparation: { Args: { p_route_id: string }; Returns: Json }
      commit_exit_cart: {
        Args: {
          p_items: Json
          p_notes: string
          p_reason: string
          p_reference: string
        }
        Returns: Json
      }
      complete_location_audit: {
        Args: { p_accept_drift?: boolean; p_audit_id: string }
        Returns: Json
      }
      confirm_delivery_attempt: {
        Args: {
          p_attempt_id: string
          p_expected_version?: number
          p_failure_notes?: string
          p_failure_reason?: string
          p_lines: Json
          p_op_key?: string
        }
        Returns: Json
      }
      debit_counts_at: {
        Args: {
          p_coli: number
          p_location: string
          p_product: string
          p_qty: number
        }
        Returns: number
      }
      declare_delivery_payments: {
        Args: {
          p_attempt_id: string
          p_difference_reason: string
          p_lines: Json
          p_op_key: string
        }
        Returns: Json
      }
      dedupe_counts_same_place: { Args: never; Returns: number }
      deliver_location_audit: { Args: { p_audit_id: string }; Returns: Json }
      deliver_note: { Args: { p_note_id: string }; Returns: Json }
      driver_sees_attempt: {
        Args: { _attempt_driver: string; _route_id: string; _uid: string }
        Returns: boolean
      }
      effective_total_colis: { Args: { p_product_id: string }; Returns: number }
      finance_confirm_method: {
        Args: {
          p_check_id: string
          p_confirmed_cents: number
          p_note: string
          p_reference: string
        }
        Returns: Json
      }
      finance_count_envelope: {
        Args: { p_closure_id: string; p_counted_cents: number; p_note: string }
        Returns: Json
      }
      finance_reopen_closure: {
        Args: { p_closure_id: string; p_reason: string }
        Returns: Json
      }
      finance_resolve_closure: {
        Args: { p_closure_id: string; p_note: string }
        Returns: Json
      }
      generate_audit_access_code: { Args: never; Returns: string }
      generate_route_barcode: { Args: never; Returns: string }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_delivery_manager: { Args: { _uid: string }; Returns: boolean }
      is_driver_only: { Args: { _uid: string }; Returns: boolean }
      is_finance: { Args: { _uid: string }; Returns: boolean }
      is_quarantine_location: { Args: { p_location: string }; Returns: boolean }
      load_notes_to_vehicle: {
        Args: {
          p_items?: Json
          p_note_ids: string[]
          p_vehicle_location: string
        }
        Returns: Json
      }
      merge_colis_counts: {
        Args: {
          p_colis_number: number
          p_location: string
          p_product_id: string
          p_session_id: string
        }
        Returns: number
      }
      merge_duplicate_products: {
        Args: { p_keep: string; p_remove: string }
        Returns: Json
      }
      move_stock_qty: {
        Args: {
          p_coli: number
          p_from: string
          p_product_id: string
          p_qty: number
          p_to: string
        }
        Returns: number
      }
      open_delivery_incident: {
        Args: {
          p_attachments: Json
          p_attempt_id: string
          p_description: string
          p_lines: Json
          p_op_key: string
          p_subject: string
        }
        Returns: Json
      }
      putaway_counts: {
        Args: { p_count_ids: string[]; p_location: string }
        Returns: Json
      }
      recalculate_all_stock: { Args: never; Returns: undefined }
      receive_delivery_return: {
        Args: {
          p_attempt_id: string
          p_lines: Json
          p_op_key?: string
          p_quarantine_location?: string
        }
        Returns: Json
      }
      register_damage: {
        Args: {
          p_colis_number: number
          p_damage_type: string
          p_description: string
          p_location: string
          p_product_id: string
          p_quantity: number
        }
        Returns: {
          colis_number: number | null
          created_at: string
          damage_type: string
          description: string | null
          id: string
          location: string | null
          product_id: string
          quantity: number
          reported_by: string | null
          resolution_notes: string | null
          resolution_type: string | null
          resolved_at: string | null
          source_colis_number: number | null
          source_count_id: string | null
          source_location: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "product_damages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_entry: {
        Args: {
          p_colis_quantities: Json
          p_location: string
          p_notes: string
          p_product_id: string
          p_reason: string
          p_reference: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          notes: string | null
          product_id: string
          quantity: number
          reason: string | null
          reference: string | null
          reversed_at: string | null
          reversed_by: string | null
          reverses_movement_id: string | null
          supplier_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "stock_movements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      regularize_damage: {
        Args: {
          p_action: string
          p_damage_id: string
          p_found_location?: string
        }
        Returns: Json
      }
      reopen_route_preparation: {
        Args: { p_reason: string; p_route_id: string }
        Returns: Json
      }
      reschedule_delivery_note: {
        Args: {
          p_driver?: string
          p_note_id: string
          p_op_key?: string
          p_scheduled_date: string
        }
        Returns: Json
      }
      resolve_damage: {
        Args: {
          p_allow_partial?: boolean
          p_damage_id: string
          p_destination_location: string
          p_resolution_notes: string
          p_resolution_type: string
          p_supplier_reference: string
        }
        Returns: Json
      }
      return_note_items: {
        Args: {
          p_items?: Json
          p_note_id: string
          p_quarantine_location?: string
        }
        Returns: Json
      }
      reverse_stock_movement: { Args: { p_movement_id: string }; Returns: Json }
      set_attempt_payable_override: {
        Args: { p_amount_cents: number; p_attempt_id: string; p_reason: string }
        Returns: Json
      }
      set_count_quantity: {
        Args: {
          p_count_id: string
          p_observed_quantity: number
          p_op_key?: string
          p_quantity: number
        }
        Returns: Json
      }
      set_user_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: Json
      }
      split_colis_counts: {
        Args: {
          p_colis_number: number
          p_distributions: Json
          p_product_id: string
          p_session_id: string
        }
        Returns: number
      }
      stage_picking_to_dock: {
        Args: { p_dock_location: string; p_lines: Json; p_task_id: string }
        Returns: Json
      }
      start_delivery_attempt: { Args: { p_attempt_id: string }; Returns: Json }
      submit_route_accounting: {
        Args: {
          p_cash_cents: number
          p_no_cash: boolean
          p_notes: string
          p_op_key: string
          p_route_id: string
        }
        Returns: Json
      }
      transfer_stock_location: { Args: { p_items: Json }; Returns: Json }
      undo_regularize_damage: {
        Args: {
          p_action: string
          p_damage_id: string
          p_movement_id?: string
          p_prev_location?: string
          p_prev_source_location?: string
        }
        Returns: Json
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

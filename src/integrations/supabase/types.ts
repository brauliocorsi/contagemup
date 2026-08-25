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
    PostgrestVersion: "14.17"
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
      delivery_notes: {
        Row: {
          client_name: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivered_by: string | null
          dock_location: string | null
          id: string
          loaded_at: string | null
          notes: string | null
          order_number: string
          returned_at: string | null
          staged_at: string | null
          status: string
          task_id: string | null
          updated_at: string
          vehicle_location: string | null
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          dock_location?: string | null
          id?: string
          loaded_at?: string | null
          notes?: string | null
          order_number: string
          returned_at?: string | null
          staged_at?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          vehicle_location?: string | null
        }
        Update: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          dock_location?: string | null
          id?: string
          loaded_at?: string | null
          notes?: string | null
          order_number?: string
          returned_at?: string | null
          staged_at?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          vehicle_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_notes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "scanner_picking_tasks"
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
          notes: string | null
          product_code: string
          product_id: string | null
          product_name: string
          status: string
        }
        Insert: {
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
          notes?: string | null
          product_code: string
          product_id?: string | null
          product_name: string
          status?: string
        }
        Update: {
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
          notes?: string | null
          product_code?: string
          product_id?: string | null
          product_name?: string
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
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          locations: string[]
          name: string
          notes: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          locations: string[]
          name: string
          notes?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
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
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category?: string
          code: string
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
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category?: string
          code?: string
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
      route_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          departure_address: string | null
          departure_lat: number | null
          departure_lon: number | null
          departure_postal_code: string | null
          id: string
          name: string
          notes: string | null
          region_id: string | null
          return_to_base: boolean
          scheduled_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          departure_address?: string | null
          departure_lat?: number | null
          departure_lon?: number | null
          departure_postal_code?: string | null
          id?: string
          name: string
          notes?: string | null
          region_id?: string | null
          return_to_base?: boolean
          scheduled_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          departure_address?: string | null
          departure_lat?: number | null
          departure_lon?: number | null
          departure_postal_code?: string | null
          id?: string
          name?: string
          notes?: string | null
          region_id?: string | null
          return_to_base?: boolean
          scheduled_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_schedules_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "delivery_regions"
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
          id: string
          locations: string | null
          orders: string | null
          picked_at: string | null
          picked_by: string | null
          picked_quantity: number
          product_code: string
          product_id: string | null
          product_name: string
          requested_quantity: number
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          locations?: string | null
          orders?: string | null
          picked_at?: string | null
          picked_by?: string | null
          picked_quantity?: number
          product_code?: string
          product_id?: string | null
          product_name: string
          requested_quantity?: number
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          locations?: string | null
          orders?: string | null
          picked_at?: string | null
          picked_by?: string | null
          picked_quantity?: number
          product_code?: string
          product_id?: string | null
          product_name?: string
          requested_quantity?: number
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
          source?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movement_lines: {
        Row: {
          colis_number: number
          created_at: string
          id: string
          location: string | null
          movement_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          colis_number: number
          created_at?: string
          id?: string
          location?: string | null
          movement_id: string
          product_id: string
          quantity: number
        }
        Update: {
          colis_number?: number
          created_at?: string
          id?: string
          location?: string | null
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
      assign_count_location: {
        Args: { p_count_id: string; p_location: string }
        Returns: string
      }
      commit_exit_cart: {
        Args: {
          p_items: Json
          p_notes: string
          p_reason: string
          p_reference: string
        }
        Returns: Json
      }
      decrement_counts_for_picking: {
        Args: {
          p_colis_quantities?: Json
          p_is_complete_set: boolean
          p_location_selections?: Json
          p_product_id: string
          p_set_quantity?: number
          p_total_colis: number
        }
        Returns: boolean
      }
      dedupe_counts_same_place: { Args: never; Returns: number }
      deliver_note: { Args: { p_note_id: string }; Returns: Json }
      effective_total_colis: { Args: { p_product_id: string }; Returns: number }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
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
      recalculate_all_stock: { Args: never; Returns: undefined }
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
      resolve_damage: {
        Args: {
          p_damage_id: string
          p_resolution_notes: string
          p_resolution_type: string
        }
        Returns: Json
      }
      return_note_items: {
        Args: {
          p_items?: Json
          p_note_id: string
          p_quarantine_location: string
        }
        Returns: Json
      }
      reverse_stock_movement: { Args: { p_movement_id: string }; Returns: Json }
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
      transfer_stock_location: { Args: { p_items: Json }; Returns: Json }
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

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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          details: string | null
          id: string
          record_id: string | null
          table_name: string | null
          user_id: string | null
          user_name: string
          user_role: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: string | null
          id?: string
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
          user_name: string
          user_role: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: string | null
          id?: string
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
          user_name?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_published: boolean | null
          published_at: string | null
          target_roles: Database["public"]["Enums"]["user_role"][] | null
          title: string
          type: Database["public"]["Enums"]["announcement_type"] | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          target_roles?: Database["public"]["Enums"]["user_role"][] | null
          title: string
          type?: Database["public"]["Enums"]["announcement_type"] | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          target_roles?: Database["public"]["Enums"]["user_role"][] | null
          title?: string
          type?: Database["public"]["Enums"]["announcement_type"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string | null
          date: string
          id: string
          notes: string | null
          staff_id: string
          status: string | null
          time_in: string | null
          time_out: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          notes?: string | null
          staff_id: string
          status?: string | null
          time_in?: string | null
          time_out?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          staff_id?: string
          status?: string | null
          time_in?: string | null
          time_out?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_addons: {
        Row: {
          booking_id: string
          created_at: string | null
          id: string
          name: string
          quantity: number | null
          total_price: number | null
          unit_price: number
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          id?: string
          name: string
          quantity?: number | null
          total_price?: number | null
          unit_price: number
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          id?: string
          name?: string
          quantity?: number | null
          total_price?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          accommodation_type: Database["public"]["Enums"]["accommodation_type"]
          actual_check_in: string | null
          actual_check_out: string | null
          amount_paid: number | null
          balance: number | null
          booking_number: string
          booking_type: Database["public"]["Enums"]["booking_type"]
          cancellation_fee: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          check_in_date: string
          check_out_date: string
          cottage_id: string | null
          cottage_ids: string[] | null
          created_at: string | null
          created_by: string | null
          deposit_returned: boolean | null
          discount_amount: number | null
          discount_reason: string | null
          extras_total: number | null
          group_number: string | null
          guest_id: string
          guest_pass_number: string | null
          id: string
          internal_notes: string | null
          is_group_primary: boolean | null
          num_adults: number | null
          num_children: number | null
          num_nights: number | null
          num_pwd: number | null
          num_seniors: number | null
          payment_method_used: string | null
          payment_proof_url: string | null
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          payment_submitted_at: string | null
          room_id: string | null
          room_rate: number | null
          security_deposit: number | null
          special_requests: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          stay_range: unknown
          subtotal: number | null
          total_amount: number | null
          updated_at: string | null
          wristband_number: string | null
        }
        Insert: {
          accommodation_type: Database["public"]["Enums"]["accommodation_type"]
          actual_check_in?: string | null
          actual_check_out?: string | null
          amount_paid?: number | null
          balance?: number | null
          booking_number: string
          booking_type?: Database["public"]["Enums"]["booking_type"]
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          check_in_date: string
          check_out_date: string
          cottage_id?: string | null
          cottage_ids?: string[] | null
          created_at?: string | null
          created_by?: string | null
          deposit_returned?: boolean | null
          discount_amount?: number | null
          discount_reason?: string | null
          extras_total?: number | null
          group_number?: string | null
          guest_id: string
          guest_pass_number?: string | null
          id?: string
          internal_notes?: string | null
          is_group_primary?: boolean | null
          num_adults?: number | null
          num_children?: number | null
          num_nights?: number | null
          num_pwd?: number | null
          num_seniors?: number | null
          payment_method_used?: string | null
          payment_proof_url?: string | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_submitted_at?: string | null
          room_id?: string | null
          room_rate?: number | null
          security_deposit?: number | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          stay_range?: unknown
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string | null
          wristband_number?: string | null
        }
        Update: {
          accommodation_type?: Database["public"]["Enums"]["accommodation_type"]
          actual_check_in?: string | null
          actual_check_out?: string | null
          amount_paid?: number | null
          balance?: number | null
          booking_number?: string
          booking_type?: Database["public"]["Enums"]["booking_type"]
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          check_in_date?: string
          check_out_date?: string
          cottage_id?: string | null
          cottage_ids?: string[] | null
          created_at?: string | null
          created_by?: string | null
          deposit_returned?: boolean | null
          discount_amount?: number | null
          discount_reason?: string | null
          extras_total?: number | null
          group_number?: string | null
          guest_id?: string
          guest_pass_number?: string | null
          id?: string
          internal_notes?: string | null
          is_group_primary?: boolean | null
          num_adults?: number | null
          num_children?: number | null
          num_nights?: number | null
          num_pwd?: number | null
          num_seniors?: number | null
          payment_method_used?: string | null
          payment_proof_url?: string | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_submitted_at?: string | null
          room_id?: string | null
          room_rate?: number | null
          security_deposit?: number | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          stay_range?: unknown
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string | null
          wristband_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cottage_id_fkey"
            columns: ["cottage_id"]
            isOneToOne: false
            referencedRelation: "cottages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "vw_room_availability"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_pages: {
        Row: {
          content: Json | null
          id: string
          is_published: boolean | null
          meta_desc: string | null
          meta_title: string | null
          slug: string
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          content?: Json | null
          id?: string
          is_published?: boolean | null
          meta_desc?: string | null
          meta_title?: string | null
          slug: string
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          content?: Json | null
          id?: string
          is_published?: boolean | null
          meta_desc?: string | null
          meta_title?: string | null
          slug?: string
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_pages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cottages: {
        Row: {
          amenities: string[] | null
          capacity: number
          cottage_code: string
          created_at: string | null
          day_rate: number
          description: string | null
          id: string
          image_urls: string[] | null
          name: string
          notes: string | null
          overnight_rate: number | null
          status: Database["public"]["Enums"]["room_status"] | null
          type: Database["public"]["Enums"]["cottage_type"]
          updated_at: string | null
        }
        Insert: {
          amenities?: string[] | null
          capacity?: number
          cottage_code: string
          created_at?: string | null
          day_rate: number
          description?: string | null
          id?: string
          image_urls?: string[] | null
          name: string
          notes?: string | null
          overnight_rate?: number | null
          status?: Database["public"]["Enums"]["room_status"] | null
          type: Database["public"]["Enums"]["cottage_type"]
          updated_at?: string | null
        }
        Update: {
          amenities?: string[] | null
          capacity?: number
          cottage_code?: string
          created_at?: string | null
          day_rate?: number
          description?: string | null
          id?: string
          image_urls?: string[] | null
          name?: string
          notes?: string | null
          overnight_rate?: number | null
          status?: Database["public"]["Enums"]["room_status"] | null
          type?: Database["public"]["Enums"]["cottage_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      day_use_entries: {
        Row: {
          area: string | null
          area_breakdown: Json | null
          cottage_id: string | null
          created_at: string | null
          created_by: string | null
          entry_number: string
          guest_name: string | null
          guest_phone: string | null
          id: string
          notes: string | null
          num_adults: number | null
          num_children: number | null
          num_infants: number | null
          num_pwd: number | null
          num_seniors: number | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          total_amount: number | null
          with_parking: boolean | null
          wristbands: string[] | null
        }
        Insert: {
          area?: string | null
          area_breakdown?: Json | null
          cottage_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_number: string
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          num_adults?: number | null
          num_children?: number | null
          num_infants?: number | null
          num_pwd?: number | null
          num_seniors?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          total_amount?: number | null
          with_parking?: boolean | null
          wristbands?: string[] | null
        }
        Update: {
          area?: string | null
          area_breakdown?: Json | null
          cottage_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_number?: string
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          num_adults?: number | null
          num_children?: number | null
          num_infants?: number | null
          num_pwd?: number | null
          num_seniors?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          total_amount?: number | null
          with_parking?: boolean | null
          wristbands?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "day_use_entries_cottage_id_fkey"
            columns: ["cottage_id"]
            isOneToOne: false
            referencedRelation: "cottages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_use_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      day_use_rates: {
        Row: {
          area: string
          description: string | null
          guest_type: Database["public"]["Enums"]["guest_type"]
          id: string
          is_active: boolean | null
          name: string
          rate: number
          updated_at: string | null
        }
        Insert: {
          area?: string
          description?: string | null
          guest_type: Database["public"]["Enums"]["guest_type"]
          id?: string
          is_active?: boolean | null
          name: string
          rate: number
          updated_at?: string | null
        }
        Update: {
          area?: string
          description?: string | null
          guest_type?: Database["public"]["Enums"]["guest_type"]
          id?: string
          is_active?: boolean | null
          name?: string
          rate?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      equipment: {
        Row: {
          available_qty: number
          condition: string | null
          created_at: string | null
          daily_rate: number | null
          deposit_amount: number | null
          description: string | null
          equipment_code: string
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          total_quantity: number
          under_repair_qty: number | null
          updated_at: string | null
        }
        Insert: {
          available_qty?: number
          condition?: string | null
          created_at?: string | null
          daily_rate?: number | null
          deposit_amount?: number | null
          description?: string | null
          equipment_code: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          total_quantity?: number
          under_repair_qty?: number | null
          updated_at?: string | null
        }
        Update: {
          available_qty?: number
          condition?: string | null
          created_at?: string | null
          daily_rate?: number | null
          deposit_amount?: number | null
          description?: string | null
          equipment_code?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          total_quantity?: number
          under_repair_qty?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      equipment_rentals: {
        Row: {
          booking_id: string | null
          condition_notes: string | null
          created_at: string | null
          created_by: string | null
          damage_charge: number | null
          damage_notes: string | null
          deposit_paid: number | null
          equipment_id: string
          expected_return: string | null
          guest_id: string | null
          id: string
          quantity: number
          rate_amount: number
          rate_type: string | null
          rental_end: string | null
          rental_number: string
          rental_start: string
          renter_name: string | null
          returned_at: string | null
          status: string | null
          total_amount: number | null
        }
        Insert: {
          booking_id?: string | null
          condition_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          damage_charge?: number | null
          damage_notes?: string | null
          deposit_paid?: number | null
          equipment_id: string
          expected_return?: string | null
          guest_id?: string | null
          id?: string
          quantity?: number
          rate_amount: number
          rate_type?: string | null
          rental_end?: string | null
          rental_number: string
          rental_start: string
          renter_name?: string | null
          returned_at?: string | null
          status?: string | null
          total_amount?: number | null
        }
        Update: {
          booking_id?: string | null
          condition_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          damage_charge?: number | null
          damage_notes?: string | null
          deposit_paid?: number | null
          equipment_id?: string
          expected_return?: string | null
          guest_id?: string | null
          id?: string
          quantity?: number
          rate_amount?: number
          rate_type?: string | null
          rental_end?: string | null
          rental_number?: string
          rental_start?: string
          renter_name?: string | null
          returned_at?: string | null
          status?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_rentals_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_rentals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_rentals_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_rentals_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string
          is_active: boolean | null
          sort_order: number | null
          title: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          sort_order?: number | null
          title?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          sort_order?: number | null
          title?: string | null
        }
        Relationships: []
      }
      guests: {
        Row: {
          address: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string
          guest_code: string
          id: string
          id_image_url: string | null
          id_number: string | null
          id_type: string | null
          is_blacklisted: boolean | null
          loyalty_points: number | null
          loyalty_tier: string | null
          nationality: string | null
          notes: string | null
          phone: string | null
          profile_id: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          guest_code: string
          id?: string
          id_image_url?: string | null
          id_number?: string | null
          id_type?: string | null
          is_blacklisted?: boolean | null
          loyalty_points?: number | null
          loyalty_tier?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          guest_code?: string
          id?: string
          id_image_url?: string | null
          id_number?: string | null
          id_type?: string | null
          is_blacklisted?: boolean | null
          loyalty_points?: number | null
          loyalty_tier?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      housekeeping_tasks: {
        Row: {
          assigned_to: string | null
          checklist: Json | null
          completed_at: string | null
          completed_by_name: string | null
          cottage_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          room_id: string | null
          scheduled_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_number: string
          task_type: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          checklist?: Json | null
          completed_at?: string | null
          completed_by_name?: string | null
          cottage_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          room_id?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_number: string
          task_type: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          checklist?: Json | null
          completed_at?: string | null
          completed_by_name?: string | null
          cottage_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          room_id?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_number?: string
          task_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_cottage_id_fkey"
            columns: ["cottage_id"]
            isOneToOne: false
            referencedRelation: "cottages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "vw_room_availability"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category_id: string | null
          created_at: string | null
          current_stock: number | null
          description: string | null
          expiration_date: string | null
          id: string
          is_active: boolean | null
          item_code: string | null
          location: string | null
          name: string
          reorder_level: number | null
          supplier_id: string | null
          unit: string | null
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          item_code?: string | null
          location?: string | null
          name: string
          reorder_level?: number | null
          supplier_id?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          item_code?: string | null
          location?: string | null
          name?: string
          reorder_level?: number | null
          supplier_id?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          after_stock: number | null
          before_stock: number | null
          created_at: string | null
          created_by: string | null
          id: string
          item_id: string
          movement_type: Database["public"]["Enums"]["stock_movement"]
          notes: string | null
          quantity: number
          reference: string | null
          unit_cost: number | null
        }
        Insert: {
          after_stock?: number | null
          before_stock?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          item_id: string
          movement_type: Database["public"]["Enums"]["stock_movement"]
          notes?: string | null
          quantity: number
          reference?: string | null
          unit_cost?: number | null
        }
        Update: {
          after_stock?: number | null
          before_stock?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          item_id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement"]
          notes?: string | null
          quantity?: number
          reference?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_low_stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance: number | null
          booking_id: string | null
          created_at: string | null
          created_by: string | null
          discount: number | null
          due_date: string | null
          guest_id: string | null
          id: string
          invoice_number: string
          notes: string | null
          paid: number | null
          status: Database["public"]["Enums"]["payment_status"] | null
          subtotal: number | null
          tax: number | null
          total: number | null
        }
        Insert: {
          balance?: number | null
          booking_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount?: number | null
          due_date?: string | null
          guest_id?: string | null
          id?: string
          invoice_number: string
          notes?: string | null
          paid?: number | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
        }
        Update: {
          balance?: number | null
          booking_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount?: number | null
          due_date?: string | null
          guest_id?: string | null
          id?: string
          invoice_number?: string
          notes?: string | null
          paid?: number | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          actual_cost: number | null
          assigned_to: string | null
          completed_at: string | null
          cottage_id: string | null
          created_at: string | null
          description: string | null
          estimated_cost: number | null
          id: string
          image_urls: string[] | null
          location_desc: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          reported_by: string | null
          resolution_notes: string | null
          room_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["maintenance_status"] | null
          ticket_number: string
          title: string
          updated_at: string | null
        }
        Insert: {
          actual_cost?: number | null
          assigned_to?: string | null
          completed_at?: string | null
          cottage_id?: string | null
          created_at?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          image_urls?: string[] | null
          location_desc?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          reported_by?: string | null
          resolution_notes?: string | null
          room_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"] | null
          ticket_number: string
          title: string
          updated_at?: string | null
        }
        Update: {
          actual_cost?: number | null
          assigned_to?: string | null
          completed_at?: string | null
          cottage_id?: string | null
          created_at?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          image_urls?: string[] | null
          location_desc?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          reported_by?: string | null
          resolution_notes?: string | null
          room_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"] | null
          ticket_number?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_cottage_id_fkey"
            columns: ["cottage_id"]
            isOneToOne: false
            referencedRelation: "cottages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "vw_room_availability"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          category_id: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean | null
          is_featured: boolean | null
          name: string
          prep_time_mins: number | null
          price: number
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_featured?: boolean | null
          name: string
          prep_time_mins?: number | null
          price: number
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_featured?: boolean | null
          name?: string
          prep_time_mins?: number | null
          price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          menu_item_id: string
          notes: string | null
          order_id: string
          quantity: number
          total_price: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          menu_item_id: string
          notes?: string | null
          order_id: string
          quantity?: number
          total_price?: number | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          menu_item_id?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          total_price?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          booking_id: string | null
          created_at: string | null
          created_by: string | null
          discount: number | null
          guest_name: string | null
          id: string
          notes: string | null
          order_number: string
          order_type: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal: number | null
          table_number: string | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount?: number | null
          guest_name?: string | null
          id?: string
          notes?: string | null
          order_number: string
          order_type?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal?: number | null
          table_number?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount?: number | null
          guest_name?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          order_type?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal?: number | null
          table_number?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_proofs: {
        Row: {
          amount: number | null
          booking_id: string
          created_at: string | null
          file_name: string | null
          file_url: string
          id: string
          reference: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount?: number | null
          booking_id: string
          created_at?: string | null
          file_name?: string | null
          file_url: string
          id?: string
          reference?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number | null
          booking_id?: string
          created_at?: string | null
          file_name?: string | null
          file_url?: string
          id?: string
          reference?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          employee_id: string | null
          full_name: string
          id: string
          is_active: boolean | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          employee_id?: string | null
          full_name: string
          id: string
          is_active?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          employee_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
      resort_settings: {
        Row: {
          id: number
          resort_name: string
          contact: string | null
          email: string | null
          address: string | null
          check_in_time: string | null
          check_out_time: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: number
          resort_name?: string
          contact?: string | null
          email?: string | null
          address?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: number
          resort_name?: string
          contact?: string | null
          email?: string | null
          address?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resort_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          applicable_to: string[] | null
          created_at: string | null
          created_by: string | null
          description: string | null
          discount_type: string | null
          discount_value: number
          id: string
          is_active: boolean | null
          min_nights: number | null
          promo_code: string | null
          title: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applicable_to?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value: number
          id?: string
          is_active?: boolean | null
          min_nights?: number | null
          promo_code?: string | null
          title: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applicable_to?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number
          id?: string
          is_active?: boolean | null
          min_nights?: number | null
          promo_code?: string | null
          title?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      remittances: {
        Row: {
          actual_cash: number | null
          approved_at: string | null
          approved_by_id: string | null
          approved_by_name: string | null
          bank_transfer_collections: number | null
          card_collections: number | null
          cash_collections: number | null
          cashier_id: string | null
          cashier_name: string
          created_at: string | null
          expected_cash: number | null
          gcash_collections: number | null
          gross_collections: number | null
          id: string
          maya_collections: number | null
          net_collections: number | null
          notes: string | null
          opening_fund: number | null
          other_collections: number | null
          rejection_remarks: string | null
          remittance_number: string
          shift_id: string | null
          status: string | null
          submitted_at: string | null
          total_discounts: number | null
          total_refunds: number | null
          updated_at: string | null
          variance: number | null
          variance_remarks: string | null
          variance_status: string | null
        }
        Insert: {
          actual_cash?: number | null
          approved_at?: string | null
          approved_by_id?: string | null
          approved_by_name?: string | null
          bank_transfer_collections?: number | null
          card_collections?: number | null
          cash_collections?: number | null
          cashier_id?: string | null
          cashier_name: string
          created_at?: string | null
          expected_cash?: number | null
          gcash_collections?: number | null
          gross_collections?: number | null
          id?: string
          maya_collections?: number | null
          net_collections?: number | null
          notes?: string | null
          opening_fund?: number | null
          other_collections?: number | null
          rejection_remarks?: string | null
          remittance_number: string
          shift_id?: string | null
          status?: string | null
          submitted_at?: string | null
          total_discounts?: number | null
          total_refunds?: number | null
          updated_at?: string | null
          variance?: number | null
          variance_remarks?: string | null
          variance_status?: string | null
        }
        Update: {
          actual_cash?: number | null
          approved_at?: string | null
          approved_by_id?: string | null
          approved_by_name?: string | null
          bank_transfer_collections?: number | null
          card_collections?: number | null
          cash_collections?: number | null
          cashier_id?: string | null
          cashier_name?: string
          created_at?: string | null
          expected_cash?: number | null
          gcash_collections?: number | null
          gross_collections?: number | null
          id?: string
          maya_collections?: number | null
          net_collections?: number | null
          notes?: string | null
          opening_fund?: number | null
          other_collections?: number | null
          rejection_remarks?: string | null
          remittance_number?: string
          shift_id?: string | null
          status?: string | null
          submitted_at?: string | null
          total_discounts?: number | null
          total_refunds?: number | null
          updated_at?: string | null
          variance?: number | null
          variance_remarks?: string | null
          variance_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remittances_approved_by_id_fkey"
            columns: ["approved_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittances_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittances_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types_config: {
        Row: {
          amenities: string[] | null
          base_rate: number
          created_at: string | null
          description: string | null
          extra_person_rate: number | null
          holiday_rate: number | null
          id: string
          image_urls: string[] | null
          is_active: boolean | null
          max_capacity: number
          name: string
          type: Database["public"]["Enums"]["room_type"]
          weekend_rate: number | null
        }
        Insert: {
          amenities?: string[] | null
          base_rate: number
          created_at?: string | null
          description?: string | null
          extra_person_rate?: number | null
          holiday_rate?: number | null
          id?: string
          image_urls?: string[] | null
          is_active?: boolean | null
          max_capacity?: number
          name: string
          type: Database["public"]["Enums"]["room_type"]
          weekend_rate?: number | null
        }
        Update: {
          amenities?: string[] | null
          base_rate?: number
          created_at?: string | null
          description?: string | null
          extra_person_rate?: number | null
          holiday_rate?: number | null
          id?: string
          image_urls?: string[] | null
          is_active?: boolean | null
          max_capacity?: number
          name?: string
          type?: Database["public"]["Enums"]["room_type"]
          weekend_rate?: number | null
        }
        Relationships: []
      }
      rooms: {
        Row: {
          created_at: string | null
          description: string | null
          floor: number | null
          id: string
          image_urls: string[] | null
          last_cleaned_at: string | null
          notes: string | null
          room_number: string
          room_type_id: string | null
          status: Database["public"]["Enums"]["room_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          floor?: number | null
          id?: string
          image_urls?: string[] | null
          last_cleaned_at?: string | null
          notes?: string | null
          room_number: string
          room_type_id?: string | null
          status?: Database["public"]["Enums"]["room_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          floor?: number | null
          id?: string
          image_urls?: string[] | null
          last_cleaned_at?: string | null
          notes?: string | null
          room_number?: string
          room_type_id?: string | null
          status?: Database["public"]["Enums"]["room_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types_config"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          cashier_id: string | null
          cashier_name: string
          closed_at: string | null
          created_at: string | null
          id: string
          opened_at: string | null
          opening_fund: number | null
          shift_number: string
          shift_type: string | null
          status: string | null
        }
        Insert: {
          cashier_id?: string | null
          cashier_name: string
          closed_at?: string | null
          created_at?: string | null
          id?: string
          opened_at?: string | null
          opening_fund?: number | null
          shift_number: string
          shift_type?: string | null
          status?: string | null
        }
        Update: {
          cashier_id?: string | null
          cashier_name?: string
          closed_at?: string | null
          created_at?: string | null
          id?: string
          opened_at?: string | null
          opening_fund?: number | null
          shift_number?: string
          shift_type?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string | null
          department: string | null
          emergency_contact: string | null
          employee_code: string
          hire_date: string | null
          id: string
          is_active: boolean | null
          position: string | null
          profile_id: string | null
          salary: number | null
          shift: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          emergency_contact?: string | null
          employee_code: string
          hire_date?: string | null
          id?: string
          is_active?: boolean | null
          position?: string | null
          profile_id?: string | null
          salary?: number | null
          shift?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department?: string | null
          emergency_contact?: string | null
          employee_code?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean | null
          position?: string | null
          profile_id?: string | null
          salary?: number | null
          shift?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
        }
        Insert: {
          address?: string | null
          contact?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
        }
        Update: {
          address?: string | null
          contact?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      transaction_audit_log: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_status: string | null
          old_status: string | null
          reason: string | null
          transaction_id: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          reason?: string | null
          transaction_id: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          reason?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_audit_log_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_audit_log_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "vw_pending_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          booking_id: string | null
          cashier_id: string | null
          completed_at: string | null
          created_at: string | null
          day_use_id: string | null
          description: string | null
          guest_id: string | null
          id: string
          order_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_number: string | null
          reference_number: string | null
          shift_id: string | null
          status: string | null
          txn_number: string
          txn_type: string
          void_reason: string | null
          voided: boolean | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          cashier_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          day_use_id?: string | null
          description?: string | null
          guest_id?: string | null
          id?: string
          order_id?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_number?: string | null
          reference_number?: string | null
          shift_id?: string | null
          status?: string | null
          txn_number: string
          txn_type: string
          void_reason?: string | null
          voided?: boolean | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          cashier_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          day_use_id?: string | null
          description?: string | null
          guest_id?: string | null
          id?: string
          order_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_number?: string | null
          reference_number?: string | null
          shift_id?: string | null
          status?: string | null
          txn_number?: string
          txn_type?: string
          void_reason?: string | null
          voided?: boolean | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_transactions_booking_id"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transactions_order_id"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_day_use_id_fkey"
            columns: ["day_use_id"]
            isOneToOne: false
            referencedRelation: "day_use_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      damage_log: {
        Row: {
          booking_number: string | null
          condition_notes: string | null
          damage_charge: number | null
          equipment_name: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string | null
          quantity: number | null
          rental_number: string | null
          rental_start: string | null
          returned_at: string | null
          status: string | null
        }
        Relationships: []
      }
      vw_dashboard_stats: {
        Row: {
          available_rooms: number | null
          occupied_cottages: number | null
          occupied_rooms: number | null
          revenue_this_month: number | null
          revenue_today: number | null
          todays_checkins: number | null
          todays_checkouts: number | null
          total_bookings: number | null
        }
        Relationships: []
      }
      vw_low_stock_items: {
        Row: {
          current_stock: number | null
          id: string | null
          name: string | null
          reorder_level: number | null
          unit: string | null
        }
        Insert: {
          current_stock?: number | null
          id?: string | null
          name?: string | null
          reorder_level?: number | null
          unit?: string | null
        }
        Update: {
          current_stock?: number | null
          id?: string | null
          name?: string | null
          reorder_level?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      vw_pending_checkins: {
        Row: {
          amount_paid: number | null
          booking_number: string | null
          check_in_date: string | null
          full_name: string | null
          location: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          phone: string | null
          total_amount: number | null
          total_pax: number | null
        }
        Relationships: []
      }
      vw_pending_transactions: {
        Row: {
          amount: number | null
          created_at: string | null
          description: string | null
          id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          time_pending: string | null
          txn_number: string | null
          txn_type: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          time_pending?: never
          txn_number?: string | null
          txn_type?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          time_pending?: never
          txn_number?: string | null
          txn_type?: string | null
        }
        Relationships: []
      }
      vw_room_availability: {
        Row: {
          base_rate: number | null
          booking_number: string | null
          check_in_date: string | null
          check_out_date: string | null
          current_guest: string | null
          floor: number | null
          id: string | null
          max_capacity: number | null
          room_number: string | null
          room_type_name: string | null
          status: Database["public"]["Enums"]["room_status"] | null
        }
        Relationships: []
      }
      vw_room_booking_ranges: {
        Row: {
          check_in_date: string | null
          check_out_date: string | null
          room_id: string | null
        }
        Insert: {
          check_in_date?: string | null
          check_out_date?: string | null
          room_id?: string | null
        }
        Update: {
          check_in_date?: string | null
          check_out_date?: string | null
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "vw_room_availability"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_transaction_summary: {
        Row: {
          avg_amount: number | null
          count: number | null
          date: string | null
          status: string | null
          total_amount: number | null
          txn_type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: { Args: { allowed_roles: string[] }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
    }
    Enums: {
      accommodation_type: "room" | "cottage" | "day_use"
      announcement_type: "general" | "promo" | "maintenance" | "notice"
      booking_status:
        | "pending"
        | "confirmed"
        | "checked_in"
        | "checked_out"
        | "cancelled"
        | "no_show"
      booking_type: "online" | "walk_in" | "phone" | "agent"
      cottage_type:
        | "open"
        | "covered"
        | "family"
        | "vip"
        | "function_hall"
        | "beach_table"
        | "tent_area"
      guest_type: "adult" | "child" | "senior" | "pwd" | "infant"
      maintenance_status: "pending" | "ongoing" | "completed" | "cancelled"
      order_status: "pending" | "preparing" | "ready" | "served" | "cancelled"
      payment_method:
        | "cash"
        | "gcash"
        | "maya"
        | "bank_transfer"
        | "credit_card"
        | "room_charge"
      payment_status: "unpaid" | "partial" | "paid" | "refunded" | "voided"
      room_status:
        | "available"
        | "occupied"
        | "reserved"
        | "cleaning"
        | "maintenance"
        | "out_of_order"
      room_type: "standard" | "deluxe" | "superior" | "suite" | "family"
      stock_movement: "in" | "out" | "adjustment" | "waste"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "pending" | "in_progress" | "completed" | "cancelled"
      user_role:
        | "super_admin"
        | "resort_owner"
        | "front_desk"
        | "cashier"
        | "staff"
        | "housekeeping"
        | "maintenance"
        | "restaurant"
        | "guest"
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
      accommodation_type: ["room", "cottage", "day_use"],
      announcement_type: ["general", "promo", "maintenance", "notice"],
      booking_status: [
        "pending",
        "confirmed",
        "checked_in",
        "checked_out",
        "cancelled",
        "no_show",
      ],
      booking_type: ["online", "walk_in", "phone", "agent"],
      cottage_type: [
        "open",
        "covered",
        "family",
        "vip",
        "function_hall",
        "beach_table",
        "tent_area",
      ],
      guest_type: ["adult", "child", "senior", "pwd", "infant"],
      maintenance_status: ["pending", "ongoing", "completed", "cancelled"],
      order_status: ["pending", "preparing", "ready", "served", "cancelled"],
      payment_method: [
        "cash",
        "gcash",
        "maya",
        "bank_transfer",
        "credit_card",
        "room_charge",
      ],
      payment_status: ["unpaid", "partial", "paid", "refunded", "voided"],
      room_status: [
        "available",
        "occupied",
        "reserved",
        "cleaning",
        "maintenance",
        "out_of_order",
      ],
      room_type: ["standard", "deluxe", "superior", "suite", "family"],
      stock_movement: ["in", "out", "adjustment", "waste"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["pending", "in_progress", "completed", "cancelled"],
      user_role: [
        "super_admin",
        "resort_owner",
        "front_desk",
        "cashier",
        "staff",
        "housekeeping",
        "maintenance",
        "restaurant",
        "guest",
      ],
    },
  },
} as const

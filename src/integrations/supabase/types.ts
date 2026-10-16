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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          acknowledged_at: string | null
          assigned_to: string | null
          body: string
          company_id: string
          created_at: string
          driver_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          resolved_at: string | null
          service_id: string | null
          severity: string
          status: string
          title: string
          type: string
          vehicle_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          assigned_to?: string | null
          body?: string
          company_id: string
          created_at?: string
          driver_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id: string
          resolved_at?: string | null
          service_id?: string | null
          severity?: string
          status?: string
          title: string
          type: string
          vehicle_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          assigned_to?: string | null
          body?: string
          company_id?: string
          created_at?: string
          driver_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          resolved_at?: string | null
          service_id?: string | null
          severity?: string
          status?: string
          title?: string
          type?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          details: string
          entity_id: string | null
          entity_kind: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          details?: string
          entity_id?: string | null
          entity_kind: string
          id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          details?: string
          entity_id?: string | null
          entity_kind?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      backups: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          error_code: string
          filename: string
          id: string
          payload: string
          size_bytes: number
          status: string
          storage_key: string
          storage_kind: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          error_code?: string
          filename: string
          id: string
          payload: string
          size_bytes?: number
          status?: string
          storage_key?: string
          storage_kind?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          error_code?: string
          filename?: string
          id?: string
          payload?: string
          size_bytes?: number
          status?: string
          storage_key?: string
          storage_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "backups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string
          company_id: string
          contact_name: string
          created_at: string
          created_by: string | null
          email: string
          id: string
          lat: number | null
          legal_name: string
          lng: number | null
          phone: string
          rfc: string
          status: string
          trade_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string
          company_id: string
          contact_name?: string
          created_at?: string
          created_by?: string | null
          email?: string
          id: string
          lat?: number | null
          legal_name: string
          lng?: number | null
          phone?: string
          rfc?: string
          status?: string
          trade_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string
          company_id?: string
          contact_name?: string
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          lat?: number | null
          legal_name?: string
          lng?: number | null
          phone?: string
          rfc?: string
          status?: string
          trade_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string
          created_at: string
          email: string
          id: string
          legal_name: string
          name: string
          phone: string
          rfc: string
          updated_at: string
        }
        Insert: {
          address?: string
          created_at?: string
          email?: string
          id: string
          legal_name?: string
          name: string
          phone?: string
          rfc?: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          email?: string
          id?: string
          legal_name?: string
          name?: string
          phone?: string
          rfc?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_evidence: {
        Row: {
          captured_at: string
          captured_by: string | null
          comments: string
          company_id: string
          id: string
          latitude: number | null
          longitude: number | null
          photo_key: string
          photo_url: string
          receiver_document: string
          receiver_name: string
          service_id: string
          signature: string
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          comments?: string
          company_id: string
          id: string
          latitude?: number | null
          longitude?: number | null
          photo_key?: string
          photo_url?: string
          receiver_document?: string
          receiver_name?: string
          service_id: string
          signature?: string
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          comments?: string
          company_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          photo_key?: string
          photo_url?: string
          receiver_document?: string
          receiver_name?: string
          service_id?: string
          signature?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_evidence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_evidence_service_company_fk"
            columns: ["company_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "delivery_evidence_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          document_type: string
          expires_at: string | null
          file_url: string
          id: string
          issued_at: string | null
          metadata: string
          owner_id: string
          owner_type: string
          status: string
          storage_key: string
          title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          document_type: string
          expires_at?: string | null
          file_url?: string
          id: string
          issued_at?: string | null
          metadata?: string
          owner_id: string
          owner_type: string
          status?: string
          storage_key?: string
          title?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_type?: string
          expires_at?: string | null
          file_url?: string
          id?: string
          issued_at?: string | null
          metadata?: string
          owner_id?: string
          owner_type?: string
          status?: string
          storage_key?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          payload: string
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id: string
          payload?: string
          type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          payload?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          email: string
          emergency_contact: string
          emergency_phone: string
          id: string
          km_total: number
          license_expires_at: string | null
          license_number: string
          license_type: string
          name: string
          phone: string
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          email?: string
          emergency_contact?: string
          emergency_phone?: string
          id: string
          km_total?: number
          license_expires_at?: string | null
          license_number?: string
          license_type?: string
          name: string
          phone?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          emergency_contact?: string
          emergency_phone?: string
          id?: string
          km_total?: number
          license_expires_at?: string | null
          license_number?: string
          license_type?: string
          name?: string
          phone?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          available_at: string
          company_id: string | null
          created_at: string
          id: string
          last_error: string
          payload: string
          provider_message_id: string
          recipient: string
          sent_at: string | null
          status: string
          template: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          company_id?: string | null
          created_at?: string
          id: string
          last_error?: string
          payload?: string
          provider_message_id?: string
          recipient: string
          sent_at?: string | null
          status?: string
          template: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          company_id?: string | null
          created_at?: string
          id?: string
          last_error?: string
          payload?: string
          provider_message_id?: string
          recipient?: string
          sent_at?: string | null
          status?: string
          template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_verifications: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      evidence_blobs: {
        Row: {
          bytes: string
          company_id: string
          content_type: string
          created_at: string
          key: string
        }
        Insert: {
          bytes: string
          company_id: string
          content_type: string
          created_at?: string
          key: string
        }
        Update: {
          bytes?: string
          company_id?: string
          content_type?: string
          created_at?: string
          key?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_blobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fleets: {
        Row: {
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string
          id: string
          name: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleets_client_company_fk"
            columns: ["company_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "fleets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_transactions: {
        Row: {
          company_id: string
          created_by: string | null
          driver_id: string | null
          fuel_type: string
          id: string
          liters: number
          odometer: number
          price_per_liter: number
          receipt: string
          service_id: string | null
          station: string
          total: number
          transaction_at: string
          vehicle_id: string
        }
        Insert: {
          company_id: string
          created_by?: string | null
          driver_id?: string | null
          fuel_type?: string
          id: string
          liters: number
          odometer?: number
          price_per_liter?: number
          receipt?: string
          service_id?: string | null
          station?: string
          total?: number
          transaction_at?: string
          vehicle_id: string
        }
        Update: {
          company_id?: string
          created_by?: string | null
          driver_id?: string | null
          fuel_type?: string
          id?: string
          liters?: number
          odometer?: number
          price_per_liter?: number
          receipt?: string
          service_id?: string | null
          station?: string
          total?: number
          transaction_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_transactions_driver_company_fk"
            columns: ["company_id", "driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "fuel_transactions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_transactions_service_company_fk"
            columns: ["company_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "fuel_transactions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_transactions_vehicle_company_fk"
            columns: ["company_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "fuel_transactions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_events: {
        Row: {
          company_id: string
          dwell_seconds: number | null
          geofence_id: string
          id: string
          kind: string
          latitude: number
          longitude: number
          recorded_at: string
          vehicle_id: string
        }
        Insert: {
          company_id: string
          dwell_seconds?: number | null
          geofence_id: string
          id: string
          kind: string
          latitude: number
          longitude: number
          recorded_at?: string
          vehicle_id: string
        }
        Update: {
          company_id?: string
          dwell_seconds?: number | null
          geofence_id?: string
          id?: string
          kind?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofence_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_fence_company_fk"
            columns: ["company_id", "geofence_id"]
            isOneToOne: false
            referencedRelation: "geofences"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "geofence_events_vehicle_company_fk"
            columns: ["company_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      geofences: {
        Row: {
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          fleet_id: string | null
          id: string
          lat: number
          lng: number
          name: string
          polygon: string
          radius_m: number
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          fleet_id?: string | null
          id: string
          lat?: number
          lng?: number
          name: string
          polygon?: string
          radius_m?: number
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          fleet_id?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          polygon?: string
          radius_m?: number
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_devices: {
        Row: {
          company_id: string
          created_at: string
          device_imei: string
          id: string
          ingest_token: string
          ingest_token_hash: string
          last_event_key: string | null
          last_ingest_at: string | null
          last_recorded_at: string | null
          last_sequence: number | null
          provider: string
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          device_imei?: string
          id: string
          ingest_token?: string
          ingest_token_hash?: string
          last_event_key?: string | null
          last_ingest_at?: string | null
          last_recorded_at?: string | null
          last_sequence?: number | null
          provider?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          device_imei?: string
          id?: string
          ingest_token?: string
          ingest_token_hash?: string
          last_event_key?: string | null
          last_ingest_at?: string | null
          last_recorded_at?: string | null
          last_sequence?: number | null
          provider?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_devices_vehicle_company_fk"
            columns: ["company_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "gps_devices_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_ingest_errors: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          imei: string
          reason: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id: string
          imei?: string
          reason: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          imei?: string
          reason?: string
        }
        Relationships: []
      }
      gps_ingest_events: {
        Row: {
          company_id: string
          created_at: string
          device_id: string
          event_key: string
          id: string
          recorded_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          device_id: string
          event_key: string
          id: string
          recorded_at: string
        }
        Update: {
          company_id?: string
          created_at?: string
          device_id?: string
          event_key?: string
          id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_ingest_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_positions: {
        Row: {
          accuracy: number
          altitude: number
          company_id: string
          gps_device_id: string | null
          heading: number
          id: string
          latitude: number
          longitude: number
          odometer_km: number | null
          recorded_at: string
          source: string
          speed: number
          vehicle_id: string
        }
        Insert: {
          accuracy?: number
          altitude?: number
          company_id: string
          gps_device_id?: string | null
          heading?: number
          id: string
          latitude: number
          longitude: number
          odometer_km?: number | null
          recorded_at?: string
          source?: string
          speed?: number
          vehicle_id: string
        }
        Update: {
          accuracy?: number
          altitude?: number
          company_id?: string
          gps_device_id?: string | null
          heading?: number
          id?: string
          latitude?: number
          longitude?: number
          odometer_km?: number | null
          recorded_at?: string
          source?: string
          speed?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_positions_device_company_fk"
            columns: ["company_id", "gps_device_id"]
            isOneToOne: false
            referencedRelation: "gps_devices"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "gps_positions_vehicle_company_fk"
            columns: ["company_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      incidents: {
        Row: {
          client_visible: boolean
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          driver_id: string | null
          id: string
          occurred_at: string
          resolved_at: string | null
          resolved_by: string | null
          service_id: string | null
          severity: string
          status: string
          title: string
          type: string
          vehicle_id: string | null
        }
        Insert: {
          client_visible?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string
          driver_id?: string | null
          id: string
          occurred_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          service_id?: string | null
          severity?: string
          status?: string
          title: string
          type?: string
          vehicle_id?: string | null
        }
        Update: {
          client_visible?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          driver_id?: string | null
          id?: string
          occurred_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          service_id?: string | null
          severity?: string
          status?: string
          title?: string
          type?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_items: {
        Row: {
          category: string
          id: string
          inspection_id: string
          notes: string
          status: string
        }
        Insert: {
          category: string
          id: string
          inspection_id: string
          notes?: string
          status: string
        }
        Update: {
          category?: string
          id?: string
          inspection_id?: string
          notes?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          blocks_vehicle: boolean
          company_id: string
          completed_at: string | null
          created_at: string
          driver_id: string | null
          id: string
          inspected_at: string
          observations: string
          photos: string
          signed_at: string | null
          signed_by: string | null
          status: string
          user_id: string | null
          vehicle_id: string
        }
        Insert: {
          blocks_vehicle?: boolean
          company_id: string
          completed_at?: string | null
          created_at?: string
          driver_id?: string | null
          id: string
          inspected_at?: string
          observations?: string
          photos?: string
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          user_id?: string | null
          vehicle_id: string
        }
        Update: {
          blocks_vehicle?: boolean
          company_id?: string
          completed_at?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          inspected_at?: string
          observations?: string
          photos?: string
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          user_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          company_id: string | null
          details: string
          finished_at: string | null
          id: string
          job_name: string
          started_at: string
          status: string
        }
        Insert: {
          company_id?: string | null
          details?: string
          finished_at?: string | null
          id: string
          job_name: string
          started_at?: string
          status?: string
        }
        Update: {
          company_id?: string | null
          details?: string
          finished_at?: string | null
          id?: string
          job_name?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      maintenance_items: {
        Row: {
          description: string
          id: string
          kind: string
          order_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          description: string
          id: string
          kind?: string
          order_id: string
          quantity?: number
          unit_cost?: number
        }
        Update: {
          description?: string
          id?: string
          kind?: string
          order_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_orders: {
        Row: {
          closed_at: string | null
          company_id: string
          created_by: string | null
          id: string
          kind: string
          labor_cost: number
          observations: string
          odometer_km: number
          opened_at: string
          parts_cost: number
          plan_id: string | null
          status: string
          title: string
          total_cost: number
          vehicle_id: string
          vendor: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_by?: string | null
          id: string
          kind?: string
          labor_cost?: number
          observations?: string
          odometer_km?: number
          opened_at?: string
          parts_cost?: number
          plan_id?: string | null
          status?: string
          title: string
          total_cost?: number
          vehicle_id: string
          vendor?: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_by?: string | null
          id?: string
          kind?: string
          labor_cost?: number
          observations?: string
          odometer_km?: number
          opened_at?: string
          parts_cost?: number
          plan_id?: string | null
          status?: string
          title?: string
          total_cost?: number
          vehicle_id?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_plans: {
        Row: {
          company_id: string
          created_at: string
          id: string
          interval_days: number | null
          interval_hours: number | null
          interval_km: number | null
          kind: string
          last_odometer: number
          last_service_at: string | null
          next_due_at: string | null
          next_due_km: number | null
          status: string
          title: string
          vehicle_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id: string
          interval_days?: number | null
          interval_hours?: number | null
          interval_km?: number | null
          kind?: string
          last_odometer?: number
          last_service_at?: string | null
          next_due_at?: string | null
          next_due_km?: number | null
          status?: string
          title: string
          vehicle_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          interval_days?: number | null
          interval_hours?: number | null
          interval_km?: number | null
          kind?: string
          last_odometer?: number
          last_service_at?: string | null
          next_due_at?: string | null
          next_due_km?: number | null
          status?: string
          title?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience_role: string | null
          body: string
          company_id: string
          created_at: string
          email_queued: boolean
          entity_id: string | null
          id: string
          kind: string
          read_at: string | null
          status: string
          title: string
          user_id: string | null
        }
        Insert: {
          audience_role?: string | null
          body?: string
          company_id: string
          created_at?: string
          email_queued?: boolean
          entity_id?: string | null
          id: string
          kind?: string
          read_at?: string | null
          status?: string
          title: string
          user_id?: string | null
        }
        Update: {
          audience_role?: string | null
          body?: string
          company_id?: string
          created_at?: string
          email_queued?: boolean
          entity_id?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          status?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      password_resets: {
        Row: {
          created_at: string
          email: string
          expires_at: string | null
          id: string
          token: string
          token_hash: string
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string | null
          id: string
          token: string
          token_hash?: string
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          token?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      personnel: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          phone: string
          position: string
          role: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          email?: string
          full_name: string
          id: string
          phone?: string
          position?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string
          position?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personnel_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_at: string | null
          activated_at: string | null
          client_id: string | null
          company_id: string
          created_at: string
          driver_id: string | null
          email: string
          full_name: string
          invited_at: string | null
          invited_by: string | null
          personnel_id: string | null
          phone: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          activated_at?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          driver_id?: string | null
          email?: string
          full_name?: string
          invited_at?: string | null
          invited_by?: string | null
          personnel_id?: string | null
          phone?: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          activated_at?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          driver_id?: string | null
          email?: string
          full_name?: string
          invited_at?: string | null
          invited_by?: string | null
          personnel_id?: string | null
          phone?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: number
          count: number
          created_at: string
          key: string
        }
        Insert: {
          bucket: number
          count?: number
          created_at?: string
          key: string
        }
        Update: {
          bucket?: number
          count?: number
          created_at?: string
          key?: string
        }
        Relationships: []
      }
      route_deviation_events: {
        Row: {
          company_id: string
          deviation_km: number
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          service_id: string
          vehicle_id: string | null
        }
        Insert: {
          company_id: string
          deviation_km?: number
          id: string
          latitude: number
          longitude: number
          recorded_at?: string
          service_id: string
          vehicle_id?: string | null
        }
        Update: {
          company_id?: string
          deviation_km?: number
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          service_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_deviation_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_deviation_events_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      route_plans: {
        Row: {
          company_id: string
          created_at: string
          distance_km: number
          duration_min: number
          id: string
          polyline: string
          service_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          distance_km?: number
          duration_min?: number
          id: string
          polyline?: string
          service_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          distance_km?: number
          duration_min?: number
          id?: string
          polyline?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_plans_service_company_fk"
            columns: ["company_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "route_plans_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      route_points: {
        Row: {
          id: string
          latitude: number
          longitude: number
          route_plan_id: string
          sequence: number
        }
        Insert: {
          id: string
          latitude: number
          longitude: number
          route_plan_id: string
          sequence?: number
        }
        Update: {
          id?: string
          latitude?: number
          longitude?: number
          route_plan_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_points_route_plan_id_fkey"
            columns: ["route_plan_id"]
            isOneToOne: false
            referencedRelation: "route_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      service_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          company_id: string
          driver_id: string | null
          id: string
          reason: string
          service_id: string
          unassigned_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          company_id: string
          driver_id?: string | null
          id: string
          reason?: string
          service_id: string
          unassigned_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          company_id?: string
          driver_id?: string | null
          id?: string
          reason?: string
          service_id?: string
          unassigned_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_assignments_driver_company_fk"
            columns: ["company_id", "driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "service_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_assignments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_assignments_vehicle_company_fk"
            columns: ["company_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "service_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_cost_lines: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          kind: string
          notes: string
          service_id: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          id: string
          kind: string
          notes?: string
          service_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          notes?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_cost_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_cost_lines_service_company_fk"
            columns: ["company_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "service_cost_lines_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_loads: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          load_number: string
          pieces: number
          reference: string
          service_id: string
          status: string
          volume_m3: number
          weight_kg: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string
          id: string
          load_number: string
          pieces?: number
          reference?: string
          service_id: string
          status?: string
          volume_m3?: number
          weight_kg?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          load_number?: string
          pieces?: number
          reference?: string
          service_id?: string
          status?: string
          volume_m3?: number
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_loads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_loads_service_company_fk"
            columns: ["company_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "service_loads_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          company_id: string
          from_status: string
          id: string
          notes: string
          service_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          company_id: string
          from_status?: string
          id: string
          notes?: string
          service_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          from_status?: string
          id?: string
          notes?: string
          service_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_status_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_status_history_service_company_fk"
            columns: ["company_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "service_status_history_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_stops: {
        Row: {
          actual_arrival: string | null
          actual_departure: string | null
          address: string
          company_id: string
          id: string
          kind: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string
          planned_arrival: string | null
          planned_departure: string | null
          sequence: number
          service_id: string
          status: string
        }
        Insert: {
          actual_arrival?: string | null
          actual_departure?: string | null
          address?: string
          company_id: string
          id: string
          kind?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string
          planned_arrival?: string | null
          planned_departure?: string | null
          sequence?: number
          service_id: string
          status?: string
        }
        Update: {
          actual_arrival?: string | null
          actual_departure?: string | null
          address?: string
          company_id?: string
          id?: string
          kind?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string
          planned_arrival?: string | null
          planned_departure?: string | null
          sequence?: number
          service_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_stops_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_stops_service_company_fk"
            columns: ["company_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "service_stops_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          actual_arrival_at: string | null
          actual_departure_at: string | null
          actual_distance_km: number
          cargo_description: string
          cargo_volume: number
          cargo_weight: number
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          destination: string
          destination_lat: number | null
          destination_lng: number | null
          driver_id: string | null
          eta_at: string | null
          eta_prev_at: string | null
          gross_revenue: number
          id: string
          notes: string
          origin: string
          origin_lat: number | null
          origin_lng: number | null
          pieces: number
          planned_distance_km: number
          planned_duration_min: number
          priority: string
          reference: string
          require_pod: boolean
          scheduled_arrival_at: string | null
          scheduled_departure_at: string | null
          service_number: string
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          actual_arrival_at?: string | null
          actual_departure_at?: string | null
          actual_distance_km?: number
          cargo_description?: string
          cargo_volume?: number
          cargo_weight?: number
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          destination?: string
          destination_lat?: number | null
          destination_lng?: number | null
          driver_id?: string | null
          eta_at?: string | null
          eta_prev_at?: string | null
          gross_revenue?: number
          id: string
          notes?: string
          origin?: string
          origin_lat?: number | null
          origin_lng?: number | null
          pieces?: number
          planned_distance_km?: number
          planned_duration_min?: number
          priority?: string
          reference?: string
          require_pod?: boolean
          scheduled_arrival_at?: string | null
          scheduled_departure_at?: string | null
          service_number: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          actual_arrival_at?: string | null
          actual_departure_at?: string | null
          actual_distance_km?: number
          cargo_description?: string
          cargo_volume?: number
          cargo_weight?: number
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          destination?: string
          destination_lat?: number | null
          destination_lng?: number | null
          driver_id?: string | null
          eta_at?: string | null
          eta_prev_at?: string | null
          gross_revenue?: number
          id?: string
          notes?: string
          origin?: string
          origin_lat?: number | null
          origin_lng?: number | null
          pieces?: number
          planned_distance_km?: number
          planned_duration_min?: number
          priority?: string
          reference?: string
          require_pod?: boolean
          scheduled_arrival_at?: string | null
          scheduled_departure_at?: string | null
          service_number?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_client_company_fk"
            columns: ["company_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "services_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_driver_company_fk"
            columns: ["company_id", "driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "services_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_vehicle_company_fk"
            columns: ["company_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "services_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      speed_alerts: {
        Row: {
          company_id: string
          driver_id: string | null
          id: string
          latitude: number
          limit_kmh: number
          longitude: number
          recorded_at: string
          speed: number
          vehicle_id: string
        }
        Insert: {
          company_id: string
          driver_id?: string | null
          id: string
          latitude: number
          limit_kmh: number
          longitude: number
          recorded_at?: string
          speed: number
          vehicle_id: string
        }
        Update: {
          company_id?: string
          driver_id?: string | null
          id?: string
          latitude?: number
          limit_kmh?: number
          longitude?: number
          recorded_at?: string
          speed?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "speed_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_links: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          hide_driver_name: boolean
          hide_license_plate: boolean
          id: string
          revoked_at: string | null
          status: string
          token: string
          token_hash: string
          vehicle_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          hide_driver_name?: boolean
          hide_license_plate?: boolean
          id: string
          revoked_at?: string | null
          status?: string
          token: string
          token_hash?: string
          vehicle_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          hide_driver_name?: boolean
          hide_license_plate?: boolean
          id?: string
          revoked_at?: string | null
          status?: string
          token?: string
          token_hash?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stops: {
        Row: {
          actual_arrival: string | null
          actual_departure: string | null
          company_id: string
          id: string
          notes: string
          planned_arrival: string | null
          sequence: number
          service_stop_id: string | null
          status: string
          trip_id: string
        }
        Insert: {
          actual_arrival?: string | null
          actual_departure?: string | null
          company_id: string
          id: string
          notes?: string
          planned_arrival?: string | null
          sequence?: number
          service_stop_id?: string | null
          status?: string
          trip_id: string
        }
        Update: {
          actual_arrival?: string | null
          actual_departure?: string | null
          company_id?: string
          id?: string
          notes?: string
          planned_arrival?: string | null
          sequence?: number
          service_stop_id?: string | null
          status?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stops_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stops_service_stop_id_fkey"
            columns: ["service_stop_id"]
            isOneToOne: false
            referencedRelation: "service_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stops_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          actual_end_at: string | null
          actual_start_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          notes: string
          planned_start_at: string | null
          service_id: string
          status: string
          trip_number: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id: string
          notes?: string
          planned_start_at?: string | null
          service_id: string
          status?: string
          trip_number: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          notes?: string
          planned_start_at?: string | null
          service_id?: string
          status?: string
          trip_number?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_company_fk"
            columns: ["company_id", "driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_service_company_fk"
            columns: ["company_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "trips_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_company_fk"
            columns: ["company_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string
          driver_id: string | null
          email: string
          email_status: string
          expires_at: string
          full_name: string
          id: string
          personnel_id: string | null
          phone: string
          revoked_at: string | null
          role: string
          status: string
          token_hash: string
          updated_at: string
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by: string
          driver_id?: string | null
          email: string
          email_status?: string
          expires_at: string
          full_name: string
          id: string
          personnel_id?: string | null
          phone?: string
          revoked_at?: string | null
          role: string
          status?: string
          token_hash: string
          updated_at?: string
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          driver_id?: string | null
          email?: string
          email_status?: string
          expires_at?: string
          full_name?: string
          id?: string
          personnel_id?: string | null
          phone?: string
          revoked_at?: string | null
          role?: string
          status?: string
          token_hash?: string
          updated_at?: string
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_simulations: {
        Row: {
          company_id: string
          is_development: boolean
          sim_mode: string
          sim_progress: number
          sim_route: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          company_id: string
          is_development?: boolean
          sim_mode?: string
          sim_progress?: number
          sim_route?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          company_id?: string
          is_development?: boolean
          sim_mode?: string
          sim_progress?: number
          sim_route?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_simulations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_simulations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          brand: string
          capacity: number
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          current_driver_id: string | null
          current_latitude: number | null
          current_longitude: number | null
          economic_number: string
          fleet_id: string | null
          fuel_type: string
          id: string
          last_gps_at: string | null
          last_heading: number
          last_speed: number
          license_plate: string
          model: string
          motion_state: string
          odometer_km: number
          speed_limit_kmh: number
          status: string
          telemetry_kind: string
          updated_at: string
          updated_by: string | null
          vehicle_type: string
          vin: string
          year: number | null
        }
        Insert: {
          active?: boolean
          brand?: string
          capacity?: number
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          current_driver_id?: string | null
          current_latitude?: number | null
          current_longitude?: number | null
          economic_number: string
          fleet_id?: string | null
          fuel_type?: string
          id: string
          last_gps_at?: string | null
          last_heading?: number
          last_speed?: number
          license_plate: string
          model?: string
          motion_state?: string
          odometer_km?: number
          speed_limit_kmh?: number
          status?: string
          telemetry_kind?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_type?: string
          vin?: string
          year?: number | null
        }
        Update: {
          active?: boolean
          brand?: string
          capacity?: number
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          current_driver_id?: string | null
          current_latitude?: number | null
          current_longitude?: number | null
          economic_number?: string
          fleet_id?: string | null
          fuel_type?: string
          id?: string
          last_gps_at?: string | null
          last_heading?: number
          last_speed?: number
          license_plate?: string
          model?: string
          motion_state?: string
          odometer_km?: number
          speed_limit_kmh?: number
          status?: string
          telemetry_kind?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_type?: string
          vin?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_client_company_fk"
            columns: ["company_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "vehicles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_current_driver_id_fkey"
            columns: ["current_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_driver_company_fk"
            columns: ["company_id", "current_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "vehicles_fleet_company_fk"
            columns: ["company_id", "fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "vehicles_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user: {
        Row: {
          createdAt: string | null
          email: string | null
          emailVerified: boolean | null
          id: string | null
          name: string | null
          updatedAt: string | null
        }
        Insert: {
          createdAt?: string | null
          email?: never
          emailVerified?: never
          id?: never
          name?: never
          updatedAt?: string | null
        }
        Update: {
          createdAt?: string | null
          email?: never
          emailVerified?: never
          id?: never
          name?: never
          updatedAt?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      exec_sql: { Args: { params?: Json; query: string }; Returns: Json }
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

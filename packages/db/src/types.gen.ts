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
      applications: {
        Row: {
          cover_message: string | null
          created_at: string
          decided_at: string | null
          decision_reason: string | null
          expires_at: string | null
          id: string
          listing_id: string
          origin_invite_id: string | null
          reviewed_at: string | null
          seeker_profile_id: string
          source: string
          status: string
          submitted_at: string
          updated_at: string
          withdrawn_reason: string | null
        }
        Insert: {
          cover_message?: string | null
          created_at?: string
          decided_at?: string | null
          decision_reason?: string | null
          expires_at?: string | null
          id?: string
          listing_id: string
          origin_invite_id?: string | null
          reviewed_at?: string | null
          seeker_profile_id: string
          source?: string
          status?: string
          submitted_at?: string
          updated_at?: string
          withdrawn_reason?: string | null
        }
        Update: {
          cover_message?: string | null
          created_at?: string
          decided_at?: string | null
          decision_reason?: string | null
          expires_at?: string | null
          id?: string
          listing_id?: string
          origin_invite_id?: string | null
          reviewed_at?: string | null
          seeker_profile_id?: string
          source?: string
          status?: string
          submitted_at?: string
          updated_at?: string
          withdrawn_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_seeker_profile_id_fkey"
            columns: ["seeker_profile_id"]
            isOneToOne: false
            referencedRelation: "seeker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attestation_policy: {
        Row: {
          body: string
          created_at: string
          id: string
          is_current: boolean
          published_at: string | null
          title: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_current?: boolean
          published_at?: string | null
          title: string
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_current?: boolean
          published_at?: string | null
          title?: string
          version?: number
        }
        Relationships: []
      }
      conversations: {
        Row: {
          application_id: string | null
          created_at: string
          host_profile_id: string
          id: string
          last_message_at: string | null
          listing_id: string | null
          seeker_profile_id: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          host_profile_id: string
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          seeker_profile_id: string
        }
        Update: {
          application_id?: string | null
          created_at?: string
          host_profile_id?: string
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          seeker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_host_profile_id_fkey"
            columns: ["host_profile_id"]
            isOneToOne: false
            referencedRelation: "host_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_seeker_profile_id_fkey"
            columns: ["seeker_profile_id"]
            isOneToOne: false
            referencedRelation: "seeker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_types: {
        Row: {
          created_at: string
          domain: string
          event_type: string
          is_product_event: boolean
        }
        Insert: {
          created_at?: string
          domain: string
          event_type: string
          is_product_event?: boolean
        }
        Update: {
          created_at?: string
          domain?: string
          event_type?: string
          is_product_event?: boolean
        }
        Relationships: []
      }
      events: {

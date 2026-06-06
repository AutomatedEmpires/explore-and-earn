export type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
export type Database = {
    __InternalSupabase: {
        PostgrestVersion: "14.5";
    };
    public: {
        Tables: {
            applications: {
                Row: {
                    cover_message: string | null;
                    created_at: string;
                    decided_at: string | null;
                    decision_reason: string | null;
                    expires_at: string | null;
                    id: string;
                    listing_id: string;
                    origin_invite_id: string | null;
                    reviewed_at: string | null;
                    seeker_profile_id: string;
                    source: string;
                    status: string;
                    submitted_at: string;
                    updated_at: string;
                    withdrawn_reason: string | null;
                };
                Insert: {
                    cover_message?: string | null;
                    created_at?: string;
                    decided_at?: string | null;
                    decision_reason?: string | null;
                    expires_at?: string | null;
                    id?: string;
                    listing_id: string;
                    origin_invite_id?: string | null;
                    reviewed_at?: string | null;
                    seeker_profile_id: string;
                    source?: string;
                    status?: string;
                    submitted_at?: string;
                    updated_at?: string;
                    withdrawn_reason?: string | null;
                };
                Update: {
                    cover_message?: string | null;
                    created_at?: string;
                    decided_at?: string | null;
                    decision_reason?: string | null;
                    expires_at?: string | null;
                    id?: string;
                    listing_id?: string;
                    origin_invite_id?: string | null;
                    reviewed_at?: string | null;
                    seeker_profile_id?: string;
                    source?: string;
                    status?: string;
                    submitted_at?: string;
                    updated_at?: string;
                    withdrawn_reason?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "applications_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "applications_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            attestation_policy: {
                Row: {
                    body: string;
                    created_at: string;
                    id: string;
                    is_current: boolean;
                    published_at: string | null;
                    title: string;
                    version: number;
                };
                Insert: {
                    body: string;
                    created_at?: string;
                    id?: string;
                    is_current?: boolean;
                    published_at?: string | null;
                    title: string;
                    version: number;
                };
                Update: {
                    body?: string;
                    created_at?: string;
                    id?: string;
                    is_current?: boolean;
                    published_at?: string | null;
                    title?: string;
                    version?: number;
                };
                Relationships: [];
            };
            conversations: {
                Row: {
                    application_id: string | null;
                    created_at: string;
                    host_profile_id: string;
                    id: string;
                    last_message_at: string | null;
                    listing_id: string | null;
                    seeker_profile_id: string;
                };
                Insert: {
                    application_id?: string | null;
                    created_at?: string;
                    host_profile_id: string;
                    id?: string;
                    last_message_at?: string | null;
                    listing_id?: string | null;
                    seeker_profile_id: string;
                };
                Update: {
                    application_id?: string | null;
                    created_at?: string;
                    host_profile_id?: string;
                    id?: string;
                    last_message_at?: string | null;
                    listing_id?: string | null;
                    seeker_profile_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "conversations_application_id_fkey";
                        columns: ["application_id"];
                        isOneToOne: false;
                        referencedRelation: "applications";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "conversations_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "conversations_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "conversations_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            event_types: {
                Row: {
                    created_at: string;
                    domain: string;
                    event_type: string;
                    is_product_event: boolean;
                };
                Insert: {
                    created_at?: string;
                    domain: string;
                    event_type: string;
                    is_product_event?: boolean;
                };
                Update: {
                    created_at?: string;
                    domain?: string;
                    event_type?: string;
                    is_product_event?: boolean;
                };
                Relationships: [];
            };
            events: {
                Row: {
                    actor_scope: string | null;
                    actor_user_id: string | null;
                    created_at: string;
                    event_type: string;
                    host_profile_id: string | null;
                    id: string;
                    listing_id: string | null;
                    occurred_at: string;
                    properties: Json;
                    seeker_profile_id: string | null;
                    session_id: string | null;
                    source_surface: string | null;
                    subject_id: string | null;
                    subject_type: string | null;
                };
                Insert: {
                    actor_scope?: string | null;
                    actor_user_id?: string | null;
                    created_at?: string;
                    event_type: string;
                    host_profile_id?: string | null;
                    id?: string;
                    listing_id?: string | null;
                    occurred_at?: string;
                    properties?: Json;
                    seeker_profile_id?: string | null;
                    session_id?: string | null;
                    source_surface?: string | null;
                    subject_id?: string | null;
                    subject_type?: string | null;
                };
                Update: {
                    actor_scope?: string | null;
                    actor_user_id?: string | null;
                    created_at?: string;
                    event_type?: string;
                    host_profile_id?: string | null;
                    id?: string;
                    listing_id?: string | null;
                    occurred_at?: string;
                    properties?: Json;
                    seeker_profile_id?: string | null;
                    session_id?: string | null;
                    source_surface?: string | null;
                    subject_id?: string | null;
                    subject_type?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "events_event_type_fkey";
                        columns: ["event_type"];
                        isOneToOne: false;
                        referencedRelation: "event_types";
                        referencedColumns: ["event_type"];
                    },
                    {
                        foreignKeyName: "events_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "events_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "events_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            host_attestations: {
                Row: {
                    attested_at: string;
                    attested_by_user_id: string;
                    created_at: string;
                    host_profile_id: string;
                    id: string;
                    policy_version: number;
                    statement: string | null;
                };
                Insert: {
                    attested_at?: string;
                    attested_by_user_id: string;
                    created_at?: string;
                    host_profile_id: string;
                    id?: string;
                    policy_version: number;
                    statement?: string | null;
                };
                Update: {
                    attested_at?: string;
                    attested_by_user_id?: string;
                    created_at?: string;
                    host_profile_id?: string;
                    id?: string;
                    policy_version?: number;
                    statement?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "host_attestations_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "host_attestations_policy_version_fkey";
                        columns: ["policy_version"];
                        isOneToOne: false;
                        referencedRelation: "attestation_policy";
                        referencedColumns: ["version"];
                    }
                ];
            };
            host_profiles: {
                Row: {
                    about: string | null;
                    account_status: string;
                    attestation_expires_at: string | null;
                    attestation_status: string;
                    attested_at: string | null;
                    category_scopes: string[];
                    clerk_user_id: string | null;
                    company_name: string;
                    completion_score: number;
                    cover_asset_id: string | null;
                    created_at: string;
                    current_attestation_id: string | null;
                    deleted_at: string | null;
                    housing_offered_generally: boolean;
                    id: string;
                    logo_asset_id: string | null;
                    meals_offered_generally: boolean;
                    operating_regions: string[];
                    owner_user_id: string;
                    primary_latitude: number | null;
                    primary_location_name: string | null;
                    primary_longitude: number | null;
                    public_status: string;
                    removed_at: string | null;
                    removed_by_user_id: string | null;
                    removed_notes: string | null;
                    removed_reason_code: string | null;
                    slug: string;
                    social_links: Json;
                    subscription_tier: string;
                    trust_status: string | null;
                    updated_at: string;
                    website_url: string | null;
                };
                Insert: {
                    about?: string | null;
                    account_status?: string;
                    attestation_expires_at?: string | null;
                    attestation_status?: string;
                    attested_at?: string | null;
                    category_scopes?: string[];
                    clerk_user_id?: string | null;
                    company_name: string;
                    completion_score?: number;
                    cover_asset_id?: string | null;
                    created_at?: string;
                    current_attestation_id?: string | null;
                    deleted_at?: string | null;
                    housing_offered_generally?: boolean;
                    id?: string;
                    logo_asset_id?: string | null;
                    meals_offered_generally?: boolean;
                    operating_regions?: string[];
                    owner_user_id: string;
                    primary_latitude?: number | null;
                    primary_location_name?: string | null;
                    primary_longitude?: number | null;
                    public_status?: string;
                    removed_at?: string | null;
                    removed_by_user_id?: string | null;
                    removed_notes?: string | null;
                    removed_reason_code?: string | null;
                    slug: string;
                    social_links?: Json;
                    subscription_tier?: string;
                    trust_status?: string | null;
                    updated_at?: string;
                    website_url?: string | null;
                };
                Update: {
                    about?: string | null;
                    account_status?: string;
                    attestation_expires_at?: string | null;
                    attestation_status?: string;
                    attested_at?: string | null;
                    category_scopes?: string[];
                    clerk_user_id?: string | null;
                    company_name?: string;
                    completion_score?: number;
                    cover_asset_id?: string | null;
                    created_at?: string;
                    current_attestation_id?: string | null;
                    deleted_at?: string | null;
                    housing_offered_generally?: boolean;
                    id?: string;
                    logo_asset_id?: string | null;
                    meals_offered_generally?: boolean;
                    operating_regions?: string[];
                    owner_user_id?: string;
                    primary_latitude?: number | null;
                    primary_location_name?: string | null;
                    primary_longitude?: number | null;
                    public_status?: string;
                    removed_at?: string | null;
                    removed_by_user_id?: string | null;
                    removed_notes?: string | null;
                    removed_reason_code?: string | null;
                    slug?: string;
                    social_links?: Json;
                    subscription_tier?: string;
                    trust_status?: string | null;
                    updated_at?: string;
                    website_url?: string | null;
                };
                Relationships: [];
            };
            host_seeker_dispositions: {
                Row: {
                    created_at: string;
                    disposition: string;
                    host_profile_id: string;
                    id: string;
                    listing_id: string;
                    note: string | null;
                    seeker_profile_id: string;
                    set_by_user_id: string | null;
                    updated_at: string;
                };
                Insert: {
                    created_at?: string;
                    disposition?: string;
                    host_profile_id: string;
                    id?: string;
                    listing_id: string;
                    note?: string | null;
                    seeker_profile_id: string;
                    set_by_user_id?: string | null;
                    updated_at?: string;
                };
                Update: {
                    created_at?: string;
                    disposition?: string;
                    host_profile_id?: string;
                    id?: string;
                    listing_id?: string;
                    note?: string | null;
                    seeker_profile_id?: string;
                    set_by_user_id?: string | null;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "host_seeker_dispositions_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "host_seeker_dispositions_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "host_seeker_dispositions_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            invites: {
                Row: {
                    application_id: string | null;
                    created_at: string;
                    delivered_at: string | null;
                    expires_at: string | null;
                    host_profile_id: string;
                    id: string;
                    invited_by_user_id: string | null;
                    listing_id: string;
                    message: string | null;
                    responded_at: string | null;
                    seeker_profile_id: string;
                    status: string;
                    updated_at: string;
                    viewed_at: string | null;
                };
                Insert: {
                    application_id?: string | null;
                    created_at?: string;
                    delivered_at?: string | null;
                    expires_at?: string | null;
                    host_profile_id: string;
                    id?: string;
                    invited_by_user_id?: string | null;
                    listing_id: string;
                    message?: string | null;
                    responded_at?: string | null;
                    seeker_profile_id: string;
                    status?: string;
                    updated_at?: string;
                    viewed_at?: string | null;
                };
                Update: {
                    application_id?: string | null;
                    created_at?: string;
                    delivered_at?: string | null;
                    expires_at?: string | null;
                    host_profile_id?: string;
                    id?: string;
                    invited_by_user_id?: string | null;
                    listing_id?: string;
                    message?: string | null;
                    responded_at?: string | null;
                    seeker_profile_id?: string;
                    status?: string;
                    updated_at?: string;
                    viewed_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "invites_application_id_fkey";
                        columns: ["application_id"];
                        isOneToOne: false;
                        referencedRelation: "applications";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "invites_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "invites_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "invites_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lifecycle_transition: {
                Row: {
                    from_state: string;
                    machine: string;
                    to_state: string;
                };
                Insert: {
                    from_state: string;
                    machine: string;
                    to_state: string;
                };
                Update: {
                    from_state?: string;
                    machine?: string;
                    to_state?: string;
                };
                Relationships: [];
            };
            listing_media_overrides: {
                Row: {
                    bucket_type: string;
                    caption: string | null;
                    created_at: string;
                    id: string;
                    listing_id: string;
                    media_asset_id: string;
                    sort_order: number;
                    updated_at: string;
                };
                Insert: {
                    bucket_type: string;
                    caption?: string | null;
                    created_at?: string;
                    id?: string;
                    listing_id: string;
                    media_asset_id: string;
                    sort_order?: number;
                    updated_at?: string;
                };
                Update: {
                    bucket_type?: string;
                    caption?: string | null;
                    created_at?: string;
                    id?: string;
                    listing_id?: string;
                    media_asset_id?: string;
                    sort_order?: number;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "listing_media_overrides_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "listing_media_overrides_media_asset_id_fkey";
                        columns: ["media_asset_id"];
                        isOneToOne: false;
                        referencedRelation: "media_assets";
                        referencedColumns: ["id"];
                    }
                ];
            };
            listing_relevance_extensions: {
                Row: {
                    completion_score: number;
                    created_at: string;
                    display_enabled: boolean;
                    id: string;
                    listing_id: string;
                    matching_enabled: boolean;
                    structured_data: Json;
                    type: string;
                    updated_at: string;
                };
                Insert: {
                    completion_score?: number;
                    created_at?: string;
                    display_enabled?: boolean;
                    id?: string;
                    listing_id: string;
                    matching_enabled?: boolean;
                    structured_data?: Json;
                    type: string;
                    updated_at?: string;
                };
                Update: {
                    completion_score?: number;
                    created_at?: string;
                    display_enabled?: boolean;
                    id?: string;
                    listing_id?: string;
                    matching_enabled?: boolean;
                    structured_data?: Json;
                    type?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "listing_relevance_extensions_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    }
                ];
            };
            listings: {
                Row: {
                    accepted_count: number;
                    archived_at: string | null;
                    begins_at: string | null;
                    category: string;
                    closed_at: string | null;
                    compensation_currency: string;
                    compensation_max_cents: number | null;
                    compensation_min_cents: number | null;
                    compensation_summary: string | null;
                    compensation_unit: string | null;
                    completion_score: number;
                    cover_asset_id: string | null;
                    created_at: string;
                    description: string | null;
                    ends_at: string | null;
                    filled_status: string;
                    host_profile_id: string;
                    housing_included: boolean;
                    id: string;
                    is_remote: boolean;
                    latitude: number | null;
                    location_display: string | null;
                    longitude: number | null;
                    meals_included: boolean;
                    mix_domains: string[];
                    paused_at: string | null;
                    published_at: string | null;
                    remaining_role_count: number;
                    role_count: number;
                    status: string;
                    tags: string[];
                    timeline_summary: string | null;
                    title: string;
                    updated_at: string;
                    visa_support: boolean;
                };
                Insert: {
                    accepted_count?: number;
                    archived_at?: string | null;
                    begins_at?: string | null;
                    category: string;
                    closed_at?: string | null;
                    compensation_currency?: string;
                    compensation_max_cents?: number | null;
                    compensation_min_cents?: number | null;
                    compensation_summary?: string | null;
                    compensation_unit?: string | null;
                    completion_score?: number;
                    cover_asset_id?: string | null;
                    created_at?: string;
                    description?: string | null;
                    ends_at?: string | null;
                    filled_status?: string;
                    host_profile_id: string;
                    housing_included?: boolean;
                    id?: string;
                    is_remote?: boolean;
                    latitude?: number | null;
                    location_display?: string | null;
                    longitude?: number | null;
                    meals_included?: boolean;
                    mix_domains?: string[];
                    paused_at?: string | null;
                    published_at?: string | null;
                    remaining_role_count?: number;
                    role_count?: number;
                    status?: string;
                    tags?: string[];
                    timeline_summary?: string | null;
                    title: string;
                    updated_at?: string;
                    visa_support?: boolean;
                };
                Update: {
                    accepted_count?: number;
                    archived_at?: string | null;
                    begins_at?: string | null;
                    category?: string;
                    closed_at?: string | null;
                    compensation_currency?: string;
                    compensation_max_cents?: number | null;
                    compensation_min_cents?: number | null;
                    compensation_summary?: string | null;
                    compensation_unit?: string | null;
                    completion_score?: number;
                    cover_asset_id?: string | null;
                    created_at?: string;
                    description?: string | null;
                    ends_at?: string | null;
                    filled_status?: string;
                    host_profile_id?: string;
                    housing_included?: boolean;
                    id?: string;
                    is_remote?: boolean;
                    latitude?: number | null;
                    location_display?: string | null;
                    longitude?: number | null;
                    meals_included?: boolean;
                    mix_domains?: string[];
                    paused_at?: string | null;
                    published_at?: string | null;
                    remaining_role_count?: number;
                    role_count?: number;
                    status?: string;
                    tags?: string[];
                    timeline_summary?: string | null;
                    title?: string;
                    updated_at?: string;
                    visa_support?: boolean;
                };
                Relationships: [
                    {
                        foreignKeyName: "listings_cover_asset_id_fkey";
                        columns: ["cover_asset_id"];
                        isOneToOne: false;
                        referencedRelation: "media_assets";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "listings_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            media_assets: {
                Row: {
                    alt_text: string | null;
                    asset_type: string;
                    bucket_id: string;
                    caption: string | null;
                    created_at: string;
                    deleted_at: string | null;
                    id: string;
                    mime_type: string | null;
                    moderation_status: string;
                    processing_status: string;
                    sort_order: number;
                    storage_key: string;
                    updated_at: string;
                    uploaded_by_user_id: string | null;
                };
                Insert: {
                    alt_text?: string | null;
                    asset_type: string;
                    bucket_id: string;
                    caption?: string | null;
                    created_at?: string;
                    deleted_at?: string | null;
                    id?: string;
                    mime_type?: string | null;
                    moderation_status?: string;
                    processing_status?: string;
                    sort_order?: number;
                    storage_key: string;
                    updated_at?: string;
                    uploaded_by_user_id?: string | null;
                };
                Update: {
                    alt_text?: string | null;
                    asset_type?: string;
                    bucket_id?: string;
                    caption?: string | null;
                    created_at?: string;
                    deleted_at?: string | null;
                    id?: string;
                    mime_type?: string | null;
                    moderation_status?: string;
                    processing_status?: string;
                    sort_order?: number;
                    storage_key?: string;
                    updated_at?: string;
                    uploaded_by_user_id?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "media_assets_bucket_id_fkey";
                        columns: ["bucket_id"];
                        isOneToOne: false;
                        referencedRelation: "media_buckets";
                        referencedColumns: ["id"];
                    }
                ];
            };
            media_buckets: {
                Row: {
                    bucket_type: string;
                    created_at: string;
                    description: string | null;
                    id: string;
                    owner_id: string;
                    owner_type: string;
                    title: string | null;
                    updated_at: string;
                    visibility: string;
                };
                Insert: {
                    bucket_type: string;
                    created_at?: string;
                    description?: string | null;
                    id?: string;
                    owner_id: string;
                    owner_type: string;
                    title?: string | null;
                    updated_at?: string;
                    visibility?: string;
                };
                Update: {
                    bucket_type?: string;
                    created_at?: string;
                    description?: string | null;
                    id?: string;
                    owner_id?: string;
                    owner_type?: string;
                    title?: string | null;
                    updated_at?: string;
                    visibility?: string;
                };
                Relationships: [];
            };
            messages: {
                Row: {
                    body: string;
                    conversation_id: string;
                    created_at: string;
                    id: string;
                    read_at: string | null;
                    sender_profile_id: string;
                    sender_type: string;
                };
                Insert: {
                    body: string;
                    conversation_id: string;
                    created_at?: string;
                    id?: string;
                    read_at?: string | null;
                    sender_profile_id: string;
                    sender_type: string;
                };
                Update: {
                    body?: string;
                    conversation_id?: string;
                    created_at?: string;
                    id?: string;
                    read_at?: string | null;
                    sender_profile_id?: string;
                    sender_type?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "messages_conversation_id_fkey";
                        columns: ["conversation_id"];
                        isOneToOne: false;
                        referencedRelation: "conversations";
                        referencedColumns: ["id"];
                    }
                ];
            };
            notification_preferences: {
                Row: {
                    category: string;
                    channel: string;
                    created_at: string;
                    enabled: boolean;
                    id: string;
                    updated_at: string;
                    user_id: string;
                };
                Insert: {
                    category: string;
                    channel: string;
                    created_at?: string;
                    enabled?: boolean;
                    id?: string;
                    updated_at?: string;
                    user_id: string;
                };
                Update: {
                    category?: string;
                    channel?: string;
                    created_at?: string;
                    enabled?: boolean;
                    id?: string;
                    updated_at?: string;
                    user_id?: string;
                };
                Relationships: [];
            };
            notifications: {
                Row: {
                    action_url: string | null;
                    body: string | null;
                    category: string;
                    channel: string;
                    created_at: string;
                    dedupe_key: string | null;
                    delivered_at: string | null;
                    dismissed_at: string | null;
                    event_id: string | null;
                    id: string;
                    priority: string;
                    read_at: string | null;
                    recipient_user_id: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    suppressed_at: string | null;
                    title: string;
                    updated_at: string;
                };
                Insert: {
                    action_url?: string | null;
                    body?: string | null;
                    category: string;
                    channel?: string;
                    created_at?: string;
                    dedupe_key?: string | null;
                    delivered_at?: string | null;
                    dismissed_at?: string | null;
                    event_id?: string | null;
                    id?: string;
                    priority?: string;
                    read_at?: string | null;
                    recipient_user_id: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    suppressed_at?: string | null;
                    title: string;
                    updated_at?: string;
                };
                Update: {
                    action_url?: string | null;
                    body?: string | null;
                    category?: string;
                    channel?: string;
                    created_at?: string;
                    dedupe_key?: string | null;
                    delivered_at?: string | null;
                    dismissed_at?: string | null;
                    event_id?: string | null;
                    id?: string;
                    priority?: string;
                    read_at?: string | null;
                    recipient_user_id?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    suppressed_at?: string | null;
                    title?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            offers: {
                Row: {
                    application_id: string | null;
                    compensation_amount_cents: number | null;
                    compensation_currency: string;
                    compensation_summary: string | null;
                    compensation_unit: string | null;
                    created_at: string;
                    delivered_at: string | null;
                    end_date: string | null;
                    expires_at: string | null;
                    host_profile_id: string;
                    housing_included: boolean;
                    id: string;
                    listing_id: string;
                    meals_included: boolean;
                    message: string | null;
                    offered_by_user_id: string | null;
                    responded_at: string | null;
                    response_note: string | null;
                    seeker_profile_id: string;
                    start_date: string | null;
                    status: string;
                    updated_at: string;
                    viewed_at: string | null;
                };
                Insert: {
                    application_id?: string | null;
                    compensation_amount_cents?: number | null;
                    compensation_currency?: string;
                    compensation_summary?: string | null;
                    compensation_unit?: string | null;
                    created_at?: string;
                    delivered_at?: string | null;
                    end_date?: string | null;
                    expires_at?: string | null;
                    host_profile_id: string;
                    housing_included?: boolean;
                    id?: string;
                    listing_id: string;
                    meals_included?: boolean;
                    message?: string | null;
                    offered_by_user_id?: string | null;
                    responded_at?: string | null;
                    response_note?: string | null;
                    seeker_profile_id: string;
                    start_date?: string | null;
                    status?: string;
                    updated_at?: string;
                    viewed_at?: string | null;
                };
                Update: {
                    application_id?: string | null;
                    compensation_amount_cents?: number | null;
                    compensation_currency?: string;
                    compensation_summary?: string | null;
                    compensation_unit?: string | null;
                    created_at?: string;
                    delivered_at?: string | null;
                    end_date?: string | null;
                    expires_at?: string | null;
                    host_profile_id?: string;
                    housing_included?: boolean;
                    id?: string;
                    listing_id?: string;
                    meals_included?: boolean;
                    message?: string | null;
                    offered_by_user_id?: string | null;
                    responded_at?: string | null;
                    response_note?: string | null;
                    seeker_profile_id?: string;
                    start_date?: string | null;
                    status?: string;
                    updated_at?: string;
                    viewed_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "offers_application_id_fkey";
                        columns: ["application_id"];
                        isOneToOne: false;
                        referencedRelation: "applications";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "offers_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "offers_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "offers_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            saved_listings: {
                Row: {
                    created_at: string;
                    id: string;
                    listing_id: string;
                    seeker_profile_id: string;
                    status: string;
                    updated_at: string;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    listing_id: string;
                    seeker_profile_id: string;
                    status?: string;
                    updated_at?: string;
                };
                Update: {
                    created_at?: string;
                    id?: string;
                    listing_id?: string;
                    seeker_profile_id?: string;
                    status?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "saved_listings_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "saved_listings_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            seeker_certifications: {
                Row: {
                    category_tags: string[];
                    created_at: string;
                    credential_url: string | null;
                    expires_at: string | null;
                    id: string;
                    issued_at: string | null;
                    issuing_organization: string | null;
                    name: string;
                    seeker_profile_id: string;
                    sort_order: number;
                    updated_at: string;
                };
                Insert: {
                    category_tags?: string[];
                    created_at?: string;
                    credential_url?: string | null;
                    expires_at?: string | null;
                    id?: string;
                    issued_at?: string | null;
                    issuing_organization?: string | null;
                    name: string;
                    seeker_profile_id: string;
                    sort_order?: number;
                    updated_at?: string;
                };
                Update: {
                    category_tags?: string[];
                    created_at?: string;
                    credential_url?: string | null;
                    expires_at?: string | null;
                    id?: string;
                    issued_at?: string | null;
                    issuing_organization?: string | null;
                    name?: string;
                    seeker_profile_id?: string;
                    sort_order?: number;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "seeker_certifications_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            seeker_profiles: {
                Row: {
                    availability_end: string | null;
                    availability_start: string | null;
                    availability_status: string | null;
                    clerk_user_id: string | null;
                    completion_score: number;
                    cover_photo_asset_id: string | null;
                    created_at: string;
                    deleted_at: string | null;
                    desired_categories: string[];
                    desired_roles: string[];
                    display_name: string | null;
                    housing_preference: string | null;
                    id: string;
                    match_confidence_score: number;
                    meals_preference: string | null;
                    open_to_statement: string | null;
                    pay_expectation_max_cents: number | null;
                    pay_expectation_min_cents: number | null;
                    pay_expectation_unit: string | null;
                    pay_flexible: boolean;
                    profile_photo_asset_id: string | null;
                    relative_location: string | null;
                    short_bio: string | null;
                    travel_readiness: string | null;
                    updated_at: string;
                    user_id: string | null;
                    visibility_status: string;
                };
                Insert: {
                    availability_end?: string | null;
                    availability_start?: string | null;
                    availability_status?: string | null;
                    clerk_user_id?: string | null;
                    completion_score?: number;
                    cover_photo_asset_id?: string | null;
                    created_at?: string;
                    deleted_at?: string | null;
                    desired_categories?: string[];
                    desired_roles?: string[];
                    display_name?: string | null;
                    housing_preference?: string | null;
                    id?: string;
                    match_confidence_score?: number;
                    meals_preference?: string | null;
                    open_to_statement?: string | null;
                    pay_expectation_max_cents?: number | null;
                    pay_expectation_min_cents?: number | null;
                    pay_expectation_unit?: string | null;
                    pay_flexible?: boolean;
                    profile_photo_asset_id?: string | null;
                    relative_location?: string | null;
                    short_bio?: string | null;
                    travel_readiness?: string | null;
                    updated_at?: string;
                    user_id?: string | null;
                    visibility_status?: string;
                };
                Update: {
                    availability_end?: string | null;
                    availability_start?: string | null;
                    availability_status?: string | null;
                    clerk_user_id?: string | null;
                    completion_score?: number;
                    cover_photo_asset_id?: string | null;
                    created_at?: string;
                    deleted_at?: string | null;
                    desired_categories?: string[];
                    desired_roles?: string[];
                    display_name?: string | null;
                    housing_preference?: string | null;
                    id?: string;
                    match_confidence_score?: number;
                    meals_preference?: string | null;
                    open_to_statement?: string | null;
                    pay_expectation_max_cents?: number | null;
                    pay_expectation_min_cents?: number | null;
                    pay_expectation_unit?: string | null;
                    pay_flexible?: boolean;
                    profile_photo_asset_id?: string | null;
                    relative_location?: string | null;
                    short_bio?: string | null;
                    travel_readiness?: string | null;
                    updated_at?: string;
                    user_id?: string | null;
                    visibility_status?: string;
                };
                Relationships: [];
            };
            seeker_resume_educations: {
                Row: {
                    created_at: string;
                    description: string | null;
                    end_date: string | null;
                    id: string;
                    institution: string | null;
                    program_or_degree: string | null;
                    seeker_profile_id: string;
                    skill_tags: string[];
                    sort_order: number;
                    start_date: string | null;
                    updated_at: string;
                };
                Insert: {
                    created_at?: string;
                    description?: string | null;
                    end_date?: string | null;
                    id?: string;
                    institution?: string | null;
                    program_or_degree?: string | null;
                    seeker_profile_id: string;
                    skill_tags?: string[];
                    sort_order?: number;
                    start_date?: string | null;
                    updated_at?: string;
                };
                Update: {
                    created_at?: string;
                    description?: string | null;
                    end_date?: string | null;
                    id?: string;
                    institution?: string | null;
                    program_or_degree?: string | null;
                    seeker_profile_id?: string;
                    skill_tags?: string[];
                    sort_order?: number;
                    start_date?: string | null;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "seeker_resume_educations_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            seeker_resume_experiences: {
                Row: {
                    category_tags: string[];
                    company_name: string | null;
                    created_at: string;
                    end_date: string | null;
                    id: string;
                    is_current: boolean;
                    role_title: string | null;
                    seeker_profile_id: string;
                    skill_tags: string[];
                    sort_order: number;
                    start_date: string | null;
                    summary: string | null;
                    updated_at: string;
                };
                Insert: {
                    category_tags?: string[];
                    company_name?: string | null;
                    created_at?: string;
                    end_date?: string | null;
                    id?: string;
                    is_current?: boolean;
                    role_title?: string | null;
                    seeker_profile_id: string;
                    skill_tags?: string[];
                    sort_order?: number;
                    start_date?: string | null;
                    summary?: string | null;
                    updated_at?: string;
                };
                Update: {
                    category_tags?: string[];
                    company_name?: string | null;
                    created_at?: string;
                    end_date?: string | null;
                    id?: string;
                    is_current?: boolean;
                    role_title?: string | null;
                    seeker_profile_id?: string;
                    skill_tags?: string[];
                    sort_order?: number;
                    start_date?: string | null;
                    summary?: string | null;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "seeker_resume_experiences_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            team_memberships: {
                Row: {
                    accepted_at: string | null;
                    created_at: string;
                    custom_permissions: Json;
                    host_profile_id: string;
                    id: string;
                    invited_at: string;
                    revoked_at: string | null;
                    role_preset: string;
                    status: string;
                    updated_at: string;
                    user_id: string;
                };
                Insert: {
                    accepted_at?: string | null;
                    created_at?: string;
                    custom_permissions?: Json;
                    host_profile_id: string;
                    id?: string;
                    invited_at?: string;
                    revoked_at?: string | null;
                    role_preset: string;
                    status?: string;
                    updated_at?: string;
                    user_id: string;
                };
                Update: {
                    accepted_at?: string | null;
                    created_at?: string;
                    custom_permissions?: Json;
                    host_profile_id?: string;
                    id?: string;
                    invited_at?: string;
                    revoked_at?: string | null;
                    role_preset?: string;
                    status?: string;
                    updated_at?: string;
                    user_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "team_memberships_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            users_profile_shadow: {
                Row: {
                    active_scope: string;
                    clerk_user_id: string | null;
                    created_at: string;
                    deleted_at: string | null;
                    display_name: string | null;
                    email: string | null;
                    id: string;
                    last_active_at: string | null;
                    phone: string | null;
                    primary_role: string;
                    status: string;
                    updated_at: string;
                };
                Insert: {
                    active_scope?: string;
                    clerk_user_id?: string | null;
                    created_at?: string;
                    deleted_at?: string | null;
                    display_name?: string | null;
                    email?: string | null;
                    id?: string;
                    last_active_at?: string | null;
                    phone?: string | null;
                    primary_role?: string;
                    status?: string;
                    updated_at?: string;
                };
                Update: {
                    active_scope?: string;
                    clerk_user_id?: string | null;
                    created_at?: string;
                    deleted_at?: string | null;
                    display_name?: string | null;
                    email?: string | null;
                    id?: string;
                    last_active_at?: string | null;
                    phone?: string | null;
                    primary_role?: string;
                    status?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            [_ in never]: never;
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];
export type Tables<DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | {
    schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"]) : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
    Row: infer R;
} ? R : never : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
    Row: infer R;
} ? R : never : never;
export type TablesInsert<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | {
    schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I;
} ? I : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I;
} ? I : never : never;
export type TablesUpdate<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | {
    schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U;
} ? U : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U;
} ? U : never : never;
export type Enums<DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | {
    schema: keyof DatabaseWithoutInternals;
}, EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"] : never = never> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName] : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions] : never;
export type CompositeTypes<PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | {
    schema: keyof DatabaseWithoutInternals;
}, CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"] : never = never> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName] : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions] : never;
export declare const Constants: {
    readonly public: {
        readonly Enums: {};
    };
};
export {};

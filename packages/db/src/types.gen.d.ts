export type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
export type Database = {
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
                    reactivated_at: string | null;
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
                    reactivated_at?: string | null;
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
                    reactivated_at?: string | null;
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
            assistant_messages: {
                Row: {
                    created_at: string;
                    id: string;
                    parts: Json;
                    role: string;
                    thread_id: string;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    parts?: Json;
                    role: string;
                    thread_id: string;
                };
                Update: {
                    created_at?: string;
                    id?: string;
                    parts?: Json;
                    role?: string;
                    thread_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "assistant_messages_thread_id_fkey";
                        columns: ["thread_id"];
                        isOneToOne: false;
                        referencedRelation: "assistant_threads";
                        referencedColumns: ["id"];
                    }
                ];
            };
            assistant_threads: {
                Row: {
                    clerk_user_id: string;
                    created_at: string;
                    host_profile_id: string | null;
                    id: string;
                    seeker_profile_id: string | null;
                    title: string | null;
                    updated_at: string;
                };
                Insert: {
                    clerk_user_id: string;
                    created_at?: string;
                    host_profile_id?: string | null;
                    id?: string;
                    seeker_profile_id?: string | null;
                    title?: string | null;
                    updated_at?: string;
                };
                Update: {
                    clerk_user_id?: string;
                    created_at?: string;
                    host_profile_id?: string | null;
                    id?: string;
                    seeker_profile_id?: string | null;
                    title?: string | null;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "assistant_threads_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "assistant_threads_seeker_profile_id_fkey";
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
            community_announcement_reactions: {
                Row: {
                    announcement_id: string;
                    clerk_user_id: string;
                    created_at: string;
                    id: string;
                    reaction: string;
                };
                Insert: {
                    announcement_id: string;
                    clerk_user_id: string;
                    created_at?: string;
                    id?: string;
                    reaction: string;
                };
                Update: {
                    announcement_id?: string;
                    clerk_user_id?: string;
                    created_at?: string;
                    id?: string;
                    reaction?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "community_announcement_reactions_announcement_id_fkey";
                        columns: ["announcement_id"];
                        isOneToOne: false;
                        referencedRelation: "host_announcements";
                        referencedColumns: ["id"];
                    }
                ];
            };
            community_comments: {
                Row: {
                    author_name: string;
                    body: string;
                    clerk_user_id: string;
                    created_at: string;
                    id: string;
                    status: string;
                    target_id: string;
                    target_type: string;
                };
                Insert: {
                    author_name: string;
                    body: string;
                    clerk_user_id: string;
                    created_at?: string;
                    id?: string;
                    status?: string;
                    target_id: string;
                    target_type: string;
                };
                Update: {
                    author_name?: string;
                    body?: string;
                    clerk_user_id?: string;
                    created_at?: string;
                    id?: string;
                    status?: string;
                    target_id?: string;
                    target_type?: string;
                };
                Relationships: [];
            };
            community_photo_reactions: {
                Row: {
                    clerk_user_id: string;
                    created_at: string;
                    id: string;
                    photo_id: string;
                    reaction: string;
                };
                Insert: {
                    clerk_user_id: string;
                    created_at?: string;
                    id?: string;
                    photo_id: string;
                    reaction: string;
                };
                Update: {
                    clerk_user_id?: string;
                    created_at?: string;
                    id?: string;
                    photo_id?: string;
                    reaction?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "community_photo_reactions_photo_id_fkey";
                        columns: ["photo_id"];
                        isOneToOne: false;
                        referencedRelation: "community_photos";
                        referencedColumns: ["id"];
                    }
                ];
            };
            community_photo_reports: {
                Row: {
                    created_at: string;
                    detail: string | null;
                    id: string;
                    photo_id: string;
                    reason: string;
                    reporter_clerk_user_id: string;
                    status: string;
                };
                Insert: {
                    created_at?: string;
                    detail?: string | null;
                    id?: string;
                    photo_id: string;
                    reason?: string;
                    reporter_clerk_user_id: string;
                    status?: string;
                };
                Update: {
                    created_at?: string;
                    detail?: string | null;
                    id?: string;
                    photo_id?: string;
                    reason?: string;
                    reporter_clerk_user_id?: string;
                    status?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "community_photo_reports_photo_id_fkey";
                        columns: ["photo_id"];
                        isOneToOne: false;
                        referencedRelation: "community_photos";
                        referencedColumns: ["id"];
                    }
                ];
            };
            community_photos: {
                Row: {
                    caption: string | null;
                    created_at: string;
                    id: string;
                    location_tag: string | null;
                    seeker_profile_id: string;
                    status: string;
                    storage_path: string;
                    updated_at: string;
                };
                Insert: {
                    caption?: string | null;
                    created_at?: string;
                    id?: string;
                    location_tag?: string | null;
                    seeker_profile_id: string;
                    status?: string;
                    storage_path: string;
                    updated_at?: string;
                };
                Update: {
                    caption?: string | null;
                    created_at?: string;
                    id?: string;
                    location_tag?: string | null;
                    seeker_profile_id?: string;
                    status?: string;
                    storage_path?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "community_photos_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            community_view_state: {
                Row: {
                    clerk_user_id: string;
                    last_seen_at: string;
                };
                Insert: {
                    clerk_user_id: string;
                    last_seen_at?: string;
                };
                Update: {
                    clerk_user_id?: string;
                    last_seen_at?: string;
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
            digest_memberships: {
                Row: {
                    cadence: string;
                    category: string;
                    created_at: string;
                    delivery_id: string | null;
                    digest_delivery_id: string | null;
                    event_id: string;
                    id: string;
                    recipient_clerk_user_id: string;
                    sent_at: string | null;
                    status: string;
                };
                Insert: {
                    cadence: string;
                    category: string;
                    created_at?: string;
                    delivery_id?: string | null;
                    digest_delivery_id?: string | null;
                    event_id: string;
                    id?: string;
                    recipient_clerk_user_id: string;
                    sent_at?: string | null;
                    status?: string;
                };
                Update: {
                    cadence?: string;
                    category?: string;
                    created_at?: string;
                    delivery_id?: string | null;
                    digest_delivery_id?: string | null;
                    event_id?: string;
                    id?: string;
                    recipient_clerk_user_id?: string;
                    sent_at?: string | null;
                    status?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "digest_memberships_delivery_id_fkey";
                        columns: ["delivery_id"];
                        isOneToOne: false;
                        referencedRelation: "notification_deliveries";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "digest_memberships_digest_delivery_id_fkey";
                        columns: ["digest_delivery_id"];
                        isOneToOne: false;
                        referencedRelation: "notification_deliveries";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "digest_memberships_event_id_fkey";
                        columns: ["event_id"];
                        isOneToOne: false;
                        referencedRelation: "events";
                        referencedColumns: ["id"];
                    }
                ];
            };
            email_log: {
                Row: {
                    error: string | null;
                    id: string;
                    ok: boolean;
                    recipient_email: string;
                    sent_at: string;
                    template_name: string;
                };
                Insert: {
                    error?: string | null;
                    id?: string;
                    ok: boolean;
                    recipient_email: string;
                    sent_at?: string;
                    template_name: string;
                };
                Update: {
                    error?: string | null;
                    id?: string;
                    ok?: boolean;
                    recipient_email?: string;
                    sent_at?: string;
                    template_name?: string;
                };
                Relationships: [];
            };
            email_suppressions: {
                Row: {
                    created_at: string;
                    email: string;
                    id: string;
                    reason: string;
                    source: string | null;
                };
                Insert: {
                    created_at?: string;
                    email: string;
                    id?: string;
                    reason: string;
                    source?: string | null;
                };
                Update: {
                    created_at?: string;
                    email?: string;
                    id?: string;
                    reason?: string;
                    source?: string | null;
                };
                Relationships: [];
            };
            employer_featured_campaigns: {
                Row: {
                    clicks_count: number;
                    created_at: string;
                    ends_at: string;
                    host_profile_id: string;
                    id: string;
                    impressions_count: number;
                    is_pinned: boolean;
                    pin_priority: number | null;
                    starts_at: string;
                    status: string;
                    surfaces: string[];
                    tier: string;
                    updated_at: string;
                };
                Insert: {
                    clicks_count?: number;
                    created_at?: string;
                    ends_at: string;
                    host_profile_id: string;
                    id?: string;
                    impressions_count?: number;
                    is_pinned?: boolean;
                    pin_priority?: number | null;
                    starts_at?: string;
                    status?: string;
                    surfaces?: string[];
                    tier: string;
                    updated_at?: string;
                };
                Update: {
                    clicks_count?: number;
                    created_at?: string;
                    ends_at?: string;
                    host_profile_id?: string;
                    id?: string;
                    impressions_count?: number;
                    is_pinned?: boolean;
                    pin_priority?: number | null;
                    starts_at?: string;
                    status?: string;
                    surfaces?: string[];
                    tier?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "employer_featured_campaigns_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
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
            host_announcements: {
                Row: {
                    body: string;
                    created_at: string;
                    expires_at: string;
                    host_profile_id: string;
                    id: string;
                    kind: string;
                    purchase_amount_cents: number | null;
                    purchase_duration_days: number | null;
                    status: string;
                    stripe_checkout_session_id: string | null;
                    stripe_payment_intent_id: string | null;
                    title: string;
                    updated_at: string;
                };
                Insert: {
                    body: string;
                    created_at?: string;
                    expires_at: string;
                    host_profile_id: string;
                    id?: string;
                    kind?: string;
                    purchase_amount_cents?: number | null;
                    purchase_duration_days?: number | null;
                    status?: string;
                    stripe_checkout_session_id?: string | null;
                    stripe_payment_intent_id?: string | null;
                    title: string;
                    updated_at?: string;
                };
                Update: {
                    body?: string;
                    created_at?: string;
                    expires_at?: string;
                    host_profile_id?: string;
                    id?: string;
                    kind?: string;
                    purchase_amount_cents?: number | null;
                    purchase_duration_days?: number | null;
                    status?: string;
                    stripe_checkout_session_id?: string | null;
                    stripe_payment_intent_id?: string | null;
                    title?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "host_announcements_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
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
                    benefit_library: Json;
                    category_scopes: string[];
                    clerk_user_id: string | null;
                    company_name: string;
                    completion_score: number;
                    cover_asset_id: string | null;
                    created_at: string;
                    current_attestation_id: string | null;
                    deleted_at: string | null;
                    flagged_at: string | null;
                    flagged_for_review: boolean;
                    flagged_reason: string | null;
                    host_name: string | null;
                    housing_offered_generally: boolean;
                    id: string;
                    logo_asset_id: string | null;
                    meals_offered_generally: boolean;
                    narrative: Json;
                    operating_regions: string[];
                    owner_user_id: string | null;
                    photo_url: string | null;
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
                    tagline: string | null;
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
                    benefit_library?: Json;
                    category_scopes?: string[];
                    clerk_user_id?: string | null;
                    company_name: string;
                    completion_score?: number;
                    cover_asset_id?: string | null;
                    created_at?: string;
                    current_attestation_id?: string | null;
                    deleted_at?: string | null;
                    flagged_at?: string | null;
                    flagged_for_review?: boolean;
                    flagged_reason?: string | null;
                    host_name?: string | null;
                    housing_offered_generally?: boolean;
                    id?: string;
                    logo_asset_id?: string | null;
                    meals_offered_generally?: boolean;
                    narrative?: Json;
                    operating_regions?: string[];
                    owner_user_id?: string | null;
                    photo_url?: string | null;
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
                    tagline?: string | null;
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
                    benefit_library?: Json;
                    category_scopes?: string[];
                    clerk_user_id?: string | null;
                    company_name?: string;
                    completion_score?: number;
                    cover_asset_id?: string | null;
                    created_at?: string;
                    current_attestation_id?: string | null;
                    deleted_at?: string | null;
                    flagged_at?: string | null;
                    flagged_for_review?: boolean;
                    flagged_reason?: string | null;
                    host_name?: string | null;
                    housing_offered_generally?: boolean;
                    id?: string;
                    logo_asset_id?: string | null;
                    meals_offered_generally?: boolean;
                    narrative?: Json;
                    operating_regions?: string[];
                    owner_user_id?: string | null;
                    photo_url?: string | null;
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
                    tagline?: string | null;
                    trust_status?: string | null;
                    updated_at?: string;
                    website_url?: string | null;
                };
                Relationships: [];
            };
            host_reviews: {
                Row: {
                    application_id: string;
                    body: string;
                    created_at: string;
                    host_profile_id: string;
                    housing_as_described: boolean | null;
                    id: string;
                    meals_as_described: boolean | null;
                    pay_on_time: boolean | null;
                    rating: number;
                    seeker_display_name: string;
                    seeker_profile_id: string;
                };
                Insert: {
                    application_id: string;
                    body?: string;
                    created_at?: string;
                    host_profile_id: string;
                    housing_as_described?: boolean | null;
                    id?: string;
                    meals_as_described?: boolean | null;
                    pay_on_time?: boolean | null;
                    rating: number;
                    seeker_display_name?: string;
                    seeker_profile_id: string;
                };
                Update: {
                    application_id?: string;
                    body?: string;
                    created_at?: string;
                    host_profile_id?: string;
                    housing_as_described?: boolean | null;
                    id?: string;
                    meals_as_described?: boolean | null;
                    pay_on_time?: boolean | null;
                    rating?: number;
                    seeker_display_name?: string;
                    seeker_profile_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "host_reviews_application_id_fkey";
                        columns: ["application_id"];
                        isOneToOne: true;
                        referencedRelation: "applications";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "host_reviews_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "host_reviews_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
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
            invite_credit_events: {
                Row: {
                    created_at: string;
                    credits: number;
                    host_profile_id: string;
                    id: string;
                    invite_id: string | null;
                    kind: string;
                    period_key: string | null;
                    source: string;
                    stripe_checkout_session_id: string | null;
                };
                Insert: {
                    created_at?: string;
                    credits?: number;
                    host_profile_id: string;
                    id?: string;
                    invite_id?: string | null;
                    kind: string;
                    period_key?: string | null;
                    source: string;
                    stripe_checkout_session_id?: string | null;
                };
                Update: {
                    created_at?: string;
                    credits?: number;
                    host_profile_id?: string;
                    id?: string;
                    invite_id?: string | null;
                    kind?: string;
                    period_key?: string | null;
                    source?: string;
                    stripe_checkout_session_id?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "invite_credit_events_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "invite_credit_events_invite_id_fkey";
                        columns: ["invite_id"];
                        isOneToOne: false;
                        referencedRelation: "invites";
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
            listing_boost_campaigns: {
                Row: {
                    clicks_count: number;
                    created_at: string;
                    ends_at: string;
                    host_profile_id: string;
                    id: string;
                    impressions_count: number;
                    is_pinned: boolean;
                    listing_id: string;
                    pin_priority: number | null;
                    purchase_amount_cents: number | null;
                    purchase_duration_days: number | null;
                    starts_at: string;
                    status: string;
                    stripe_checkout_session_id: string | null;
                    stripe_payment_intent_id: string | null;
                    surfaces: string[];
                    tier: string;
                    updated_at: string;
                };
                Insert: {
                    clicks_count?: number;
                    created_at?: string;
                    ends_at: string;
                    host_profile_id: string;
                    id?: string;
                    impressions_count?: number;
                    is_pinned?: boolean;
                    listing_id: string;
                    pin_priority?: number | null;
                    purchase_amount_cents?: number | null;
                    purchase_duration_days?: number | null;
                    starts_at?: string;
                    status?: string;
                    stripe_checkout_session_id?: string | null;
                    stripe_payment_intent_id?: string | null;
                    surfaces?: string[];
                    tier: string;
                    updated_at?: string;
                };
                Update: {
                    clicks_count?: number;
                    created_at?: string;
                    ends_at?: string;
                    host_profile_id?: string;
                    id?: string;
                    impressions_count?: number;
                    is_pinned?: boolean;
                    listing_id?: string;
                    pin_priority?: number | null;
                    purchase_amount_cents?: number | null;
                    purchase_duration_days?: number | null;
                    starts_at?: string;
                    status?: string;
                    stripe_checkout_session_id?: string | null;
                    stripe_payment_intent_id?: string | null;
                    surfaces?: string[];
                    tier?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "listing_boost_campaigns_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "listing_boost_campaigns_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    }
                ];
            };
            listing_claims: {
                Row: {
                    authority_evidence: Json;
                    claimant_clerk_user_id: string;
                    created_at: string;
                    decided_at: string | null;
                    host_profile_id: string | null;
                    id: string;
                    listing_id: string;
                    pre_conversion_snapshot: Json | null;
                    review_notes: string | null;
                    reviewed_by_user_id: string | null;
                    status: string;
                    updated_at: string;
                };
                Insert: {
                    authority_evidence?: Json;
                    claimant_clerk_user_id: string;
                    created_at?: string;
                    decided_at?: string | null;
                    host_profile_id?: string | null;
                    id?: string;
                    listing_id: string;
                    pre_conversion_snapshot?: Json | null;
                    review_notes?: string | null;
                    reviewed_by_user_id?: string | null;
                    status?: string;
                    updated_at?: string;
                };
                Update: {
                    authority_evidence?: Json;
                    claimant_clerk_user_id?: string;
                    created_at?: string;
                    decided_at?: string | null;
                    host_profile_id?: string | null;
                    id?: string;
                    listing_id?: string;
                    pre_conversion_snapshot?: Json | null;
                    review_notes?: string | null;
                    reviewed_by_user_id?: string | null;
                    status?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "listing_claims_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "listing_claims_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    }
                ];
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
            listing_passes: {
                Row: {
                    created_at: string;
                    listing_id: string;
                    seeker_profile_id: string;
                };
                Insert: {
                    created_at?: string;
                    listing_id: string;
                    seeker_profile_id: string;
                };
                Update: {
                    created_at?: string;
                    listing_id?: string;
                    seeker_profile_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "listing_passes_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "listing_passes_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
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
            listing_sources: {
                Row: {
                    allow_raw_snapshot: boolean;
                    compliance_notes: string | null;
                    compliance_status: string;
                    config: Json;
                    created_at: string;
                    full_snapshot: boolean;
                    id: string;
                    kind: string;
                    name: string;
                    terms_url: string | null;
                    updated_at: string;
                };
                Insert: {
                    allow_raw_snapshot?: boolean;
                    compliance_notes?: string | null;
                    compliance_status?: string;
                    config?: Json;
                    created_at?: string;
                    full_snapshot?: boolean;
                    id?: string;
                    kind: string;
                    name: string;
                    terms_url?: string | null;
                    updated_at?: string;
                };
                Update: {
                    allow_raw_snapshot?: boolean;
                    compliance_notes?: string | null;
                    compliance_status?: string;
                    config?: Json;
                    created_at?: string;
                    full_snapshot?: boolean;
                    id?: string;
                    kind?: string;
                    name?: string;
                    terms_url?: string | null;
                    updated_at?: string;
                };
                Relationships: [];
            };
            listings: {
                Row: {
                    accepted_count: number;
                    archived_at: string | null;
                    begins_at: string | null;
                    benefit_details: Json;
                    category: string;
                    category_depth: Json;
                    claim_summary: string;
                    closed_at: string | null;
                    compensation_currency: string;
                    compensation_max_cents: number | null;
                    compensation_min_cents: number | null;
                    compensation_summary: string | null;
                    compensation_unit: string | null;
                    completion_score: number;
                    cover_asset_id: string | null;
                    cover_photo_url: string | null;
                    created_at: string;
                    description: string | null;
                    ends_at: string | null;
                    experience_level_required: string | null;
                    expires_at: string | null;
                    filled_status: string;
                    gallery_photo_urls: string[];
                    host_profile_id: string | null;
                    housing_description: string | null;
                    housing_evidence: string;
                    housing_included: boolean;
                    id: string;
                    is_remote: boolean;
                    latitude: number | null;
                    location_display: string | null;
                    logistics: Json;
                    longitude: number | null;
                    meals_description: string | null;
                    meals_evidence: string;
                    meals_included: boolean;
                    mix_domains: string[];
                    paused_at: string | null;
                    pay_evidence: string;
                    perks: Json;
                    physical_demand: number | null;
                    provenance: string;
                    published_at: string | null;
                    remaining_role_count: number;
                    required_certifications: string[];
                    required_skill_tags: string[];
                    requirements: Json;
                    responsibilities: Json;
                    role_count: number;
                    search_vector: unknown;
                    seasonality: string[];
                    source_employer_name: string | null;
                    source_evidence_meta: Json;
                    source_external_id: string | null;
                    source_fingerprint: string | null;
                    source_id: string | null;
                    source_last_seen_at: string | null;
                    source_name: string | null;
                    source_published_at: string | null;
                    source_status: string;
                    source_url: string | null;
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
                    benefit_details?: Json;
                    category: string;
                    category_depth?: Json;
                    claim_summary?: string;
                    closed_at?: string | null;
                    compensation_currency?: string;
                    compensation_max_cents?: number | null;
                    compensation_min_cents?: number | null;
                    compensation_summary?: string | null;
                    compensation_unit?: string | null;
                    completion_score?: number;
                    cover_asset_id?: string | null;
                    cover_photo_url?: string | null;
                    created_at?: string;
                    description?: string | null;
                    ends_at?: string | null;
                    experience_level_required?: string | null;
                    expires_at?: string | null;
                    filled_status?: string;
                    gallery_photo_urls?: string[];
                    host_profile_id?: string | null;
                    housing_description?: string | null;
                    housing_evidence?: string;
                    housing_included?: boolean;
                    id?: string;
                    is_remote?: boolean;
                    latitude?: number | null;
                    location_display?: string | null;
                    logistics?: Json;
                    longitude?: number | null;
                    meals_description?: string | null;
                    meals_evidence?: string;
                    meals_included?: boolean;
                    mix_domains?: string[];
                    paused_at?: string | null;
                    pay_evidence?: string;
                    perks?: Json;
                    physical_demand?: number | null;
                    provenance?: string;
                    published_at?: string | null;
                    remaining_role_count?: number;
                    required_certifications?: string[];
                    required_skill_tags?: string[];
                    requirements?: Json;
                    responsibilities?: Json;
                    role_count?: number;
                    search_vector?: unknown;
                    seasonality?: string[];
                    source_employer_name?: string | null;
                    source_evidence_meta?: Json;
                    source_external_id?: string | null;
                    source_fingerprint?: string | null;
                    source_id?: string | null;
                    source_last_seen_at?: string | null;
                    source_name?: string | null;
                    source_published_at?: string | null;
                    source_status?: string;
                    source_url?: string | null;
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
                    benefit_details?: Json;
                    category?: string;
                    category_depth?: Json;
                    claim_summary?: string;
                    closed_at?: string | null;
                    compensation_currency?: string;
                    compensation_max_cents?: number | null;
                    compensation_min_cents?: number | null;
                    compensation_summary?: string | null;
                    compensation_unit?: string | null;
                    completion_score?: number;
                    cover_asset_id?: string | null;
                    cover_photo_url?: string | null;
                    created_at?: string;
                    description?: string | null;
                    ends_at?: string | null;
                    experience_level_required?: string | null;
                    expires_at?: string | null;
                    filled_status?: string;
                    gallery_photo_urls?: string[];
                    host_profile_id?: string | null;
                    housing_description?: string | null;
                    housing_evidence?: string;
                    housing_included?: boolean;
                    id?: string;
                    is_remote?: boolean;
                    latitude?: number | null;
                    location_display?: string | null;
                    logistics?: Json;
                    longitude?: number | null;
                    meals_description?: string | null;
                    meals_evidence?: string;
                    meals_included?: boolean;
                    mix_domains?: string[];
                    paused_at?: string | null;
                    pay_evidence?: string;
                    perks?: Json;
                    physical_demand?: number | null;
                    provenance?: string;
                    published_at?: string | null;
                    remaining_role_count?: number;
                    required_certifications?: string[];
                    required_skill_tags?: string[];
                    requirements?: Json;
                    responsibilities?: Json;
                    role_count?: number;
                    search_vector?: unknown;
                    seasonality?: string[];
                    source_employer_name?: string | null;
                    source_evidence_meta?: Json;
                    source_external_id?: string | null;
                    source_fingerprint?: string | null;
                    source_id?: string | null;
                    source_last_seen_at?: string | null;
                    source_name?: string | null;
                    source_published_at?: string | null;
                    source_status?: string;
                    source_url?: string | null;
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
                    },
                    {
                        foreignKeyName: "listings_source_id_fkey";
                        columns: ["source_id"];
                        isOneToOne: false;
                        referencedRelation: "listing_sources";
                        referencedColumns: ["id"];
                    }
                ];
            };
            match_scores: {
                Row: {
                    band: string;
                    caps_applied: string[];
                    components: Json;
                    computed_at: string;
                    confidence: number;
                    listing_id: string;
                    raw_score: number;
                    score: number;
                    seeker_profile_id: string;
                };
                Insert: {
                    band: string;
                    caps_applied?: string[];
                    components?: Json;
                    computed_at?: string;
                    confidence: number;
                    listing_id: string;
                    raw_score: number;
                    score: number;
                    seeker_profile_id: string;
                };
                Update: {
                    band?: string;
                    caps_applied?: string[];
                    components?: Json;
                    computed_at?: string;
                    confidence?: number;
                    listing_id?: string;
                    raw_score?: number;
                    score?: number;
                    seeker_profile_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "match_scores_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "match_scores_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
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
            moderation_actions: {
                Row: {
                    action: string;
                    created_at: string;
                    id: string;
                    moderator_clerk_user_id: string;
                    rationale: string | null;
                    report_id: string | null;
                    subject_id: string;
                    subject_type: string;
                };
                Insert: {
                    action: string;
                    created_at?: string;
                    id?: string;
                    moderator_clerk_user_id: string;
                    rationale?: string | null;
                    report_id?: string | null;
                    subject_id: string;
                    subject_type: string;
                };
                Update: {
                    action?: string;
                    created_at?: string;
                    id?: string;
                    moderator_clerk_user_id?: string;
                    rationale?: string | null;
                    report_id?: string | null;
                    subject_id?: string;
                    subject_type?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "moderation_actions_report_id_fkey";
                        columns: ["report_id"];
                        isOneToOne: false;
                        referencedRelation: "reports";
                        referencedColumns: ["id"];
                    }
                ];
            };
            notification_deliveries: {
                Row: {
                    attempt_count: number;
                    cadence: string;
                    category: string;
                    channel: string;
                    collapsed_into_delivery_id: string | null;
                    created_at: string;
                    dedup_key: string;
                    delivered_at: string | null;
                    event_id: string | null;
                    failure_class: string | null;
                    failure_detail: string | null;
                    id: string;
                    intent: Json;
                    lease_expires_at: string | null;
                    next_attempt_at: string;
                    notification_type: string;
                    provider_message_id: string | null;
                    recipient_clerk_user_id: string;
                    status: string;
                    suppression_reason: string | null;
                    updated_at: string;
                    variant: string;
                    worker_id: string | null;
                };
                Insert: {
                    attempt_count?: number;
                    cadence?: string;
                    category: string;
                    channel: string;
                    collapsed_into_delivery_id?: string | null;
                    created_at?: string;
                    dedup_key: string;
                    delivered_at?: string | null;
                    event_id?: string | null;
                    failure_class?: string | null;
                    failure_detail?: string | null;
                    id?: string;
                    intent?: Json;
                    lease_expires_at?: string | null;
                    next_attempt_at?: string;
                    notification_type: string;
                    provider_message_id?: string | null;
                    recipient_clerk_user_id: string;
                    status?: string;
                    suppression_reason?: string | null;
                    updated_at?: string;
                    variant?: string;
                    worker_id?: string | null;
                };
                Update: {
                    attempt_count?: number;
                    cadence?: string;
                    category?: string;
                    channel?: string;
                    collapsed_into_delivery_id?: string | null;
                    created_at?: string;
                    dedup_key?: string;
                    delivered_at?: string | null;
                    event_id?: string | null;
                    failure_class?: string | null;
                    failure_detail?: string | null;
                    id?: string;
                    intent?: Json;
                    lease_expires_at?: string | null;
                    next_attempt_at?: string;
                    notification_type?: string;
                    provider_message_id?: string | null;
                    recipient_clerk_user_id?: string;
                    status?: string;
                    suppression_reason?: string | null;
                    updated_at?: string;
                    variant?: string;
                    worker_id?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "notification_deliveries_collapsed_into_delivery_id_fkey";
                        columns: ["collapsed_into_delivery_id"];
                        isOneToOne: false;
                        referencedRelation: "notification_deliveries";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "notification_deliveries_event_id_fkey";
                        columns: ["event_id"];
                        isOneToOne: false;
                        referencedRelation: "events";
                        referencedColumns: ["id"];
                    }
                ];
            };
            notification_engine_prefs: {
                Row: {
                    category_prefs: Json;
                    clerk_user_id: string;
                    created_at: string;
                    email_enabled: boolean;
                    in_app_enabled: boolean;
                    locale: string | null;
                    push_enabled: boolean;
                    quiet_end_minute: number | null;
                    quiet_hours_enabled: boolean;
                    quiet_start_minute: number | null;
                    timezone: string | null;
                    updated_at: string;
                };
                Insert: {
                    category_prefs?: Json;
                    clerk_user_id: string;
                    created_at?: string;
                    email_enabled?: boolean;
                    in_app_enabled?: boolean;
                    locale?: string | null;
                    push_enabled?: boolean;
                    quiet_end_minute?: number | null;
                    quiet_hours_enabled?: boolean;
                    quiet_start_minute?: number | null;
                    timezone?: string | null;
                    updated_at?: string;
                };
                Update: {
                    category_prefs?: Json;
                    clerk_user_id?: string;
                    created_at?: string;
                    email_enabled?: boolean;
                    in_app_enabled?: boolean;
                    locale?: string | null;
                    push_enabled?: boolean;
                    quiet_end_minute?: number | null;
                    quiet_hours_enabled?: boolean;
                    quiet_start_minute?: number | null;
                    timezone?: string | null;
                    updated_at?: string;
                };
                Relationships: [];
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
            notification_processed_events: {
                Row: {
                    delivery_count: number;
                    event_id: string;
                    processed_at: string;
                };
                Insert: {
                    delivery_count?: number;
                    event_id: string;
                    processed_at?: string;
                };
                Update: {
                    delivery_count?: number;
                    event_id?: string;
                    processed_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "notification_processed_events_event_id_fkey";
                        columns: ["event_id"];
                        isOneToOne: true;
                        referencedRelation: "events";
                        referencedColumns: ["id"];
                    }
                ];
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
                    recipient_clerk_user_id: string | null;
                    recipient_user_id: string | null;
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
                    recipient_clerk_user_id?: string | null;
                    recipient_user_id?: string | null;
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
                    recipient_clerk_user_id?: string | null;
                    recipient_user_id?: string | null;
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
            push_subscriptions: {
                Row: {
                    auth: string;
                    clerk_user_id: string;
                    created_at: string;
                    endpoint: string;
                    failure_count: number;
                    id: string;
                    last_success_at: string | null;
                    locale: string | null;
                    p256dh: string;
                    revoked_at: string | null;
                    timezone: string | null;
                    user_agent: string | null;
                };
                Insert: {
                    auth: string;
                    clerk_user_id: string;
                    created_at?: string;
                    endpoint: string;
                    failure_count?: number;
                    id?: string;
                    last_success_at?: string | null;
                    locale?: string | null;
                    p256dh: string;
                    revoked_at?: string | null;
                    timezone?: string | null;
                    user_agent?: string | null;
                };
                Update: {
                    auth?: string;
                    clerk_user_id?: string;
                    created_at?: string;
                    endpoint?: string;
                    failure_count?: number;
                    id?: string;
                    last_success_at?: string | null;
                    locale?: string | null;
                    p256dh?: string;
                    revoked_at?: string | null;
                    timezone?: string | null;
                    user_agent?: string | null;
                };
                Relationships: [];
            };
            refund_requests: {
                Row: {
                    admin_note: string | null;
                    amount_cents: number;
                    created_at: string;
                    host_profile_id: string;
                    id: string;
                    purchase_type: string;
                    reason: string | null;
                    reference_id: string | null;
                    resolved_at: string | null;
                    resolved_by_clerk_user_id: string | null;
                    status: string;
                    stripe_payment_intent_id: string | null;
                };
                Insert: {
                    admin_note?: string | null;
                    amount_cents: number;
                    created_at?: string;
                    host_profile_id: string;
                    id?: string;
                    purchase_type: string;
                    reason?: string | null;
                    reference_id?: string | null;
                    resolved_at?: string | null;
                    resolved_by_clerk_user_id?: string | null;
                    status?: string;
                    stripe_payment_intent_id?: string | null;
                };
                Update: {
                    admin_note?: string | null;
                    amount_cents?: number;
                    created_at?: string;
                    host_profile_id?: string;
                    id?: string;
                    purchase_type?: string;
                    reason?: string | null;
                    reference_id?: string | null;
                    resolved_at?: string | null;
                    resolved_by_clerk_user_id?: string | null;
                    status?: string;
                    stripe_payment_intent_id?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "refund_requests_host_profile_id_fkey";
                        columns: ["host_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "host_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            reports: {
                Row: {
                    created_at: string;
                    detail: string | null;
                    id: string;
                    listing_id: string;
                    reason: string;
                    reporter_id: string;
                    resolved_at: string | null;
                    resolved_by_clerk_user_id: string | null;
                    status: string;
                };
                Insert: {
                    created_at?: string;
                    detail?: string | null;
                    id?: string;
                    listing_id: string;
                    reason: string;
                    reporter_id: string;
                    resolved_at?: string | null;
                    resolved_by_clerk_user_id?: string | null;
                    status?: string;
                };
                Update: {
                    created_at?: string;
                    detail?: string | null;
                    id?: string;
                    listing_id?: string;
                    reason?: string;
                    reporter_id?: string;
                    resolved_at?: string | null;
                    resolved_by_clerk_user_id?: string | null;
                    status?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "reports_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
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
            saved_searches: {
                Row: {
                    alert_enabled: boolean;
                    created_at: string;
                    filters: Json;
                    id: string;
                    label: string;
                    last_alerted_at: string | null;
                    seeker_profile_id: string;
                    updated_at: string;
                };
                Insert: {
                    alert_enabled?: boolean;
                    created_at?: string;
                    filters?: Json;
                    id?: string;
                    label: string;
                    last_alerted_at?: string | null;
                    seeker_profile_id: string;
                    updated_at?: string;
                };
                Update: {
                    alert_enabled?: boolean;
                    created_at?: string;
                    filters?: Json;
                    id?: string;
                    label?: string;
                    last_alerted_at?: string | null;
                    seeker_profile_id?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "saved_searches_seeker_profile_id_fkey";
                        columns: ["seeker_profile_id"];
                        isOneToOne: false;
                        referencedRelation: "seeker_profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            seeker_badges: {
                Row: {
                    awarded_at: string;
                    badge_key: string;
                    id: string;
                    metadata: Json | null;
                    seeker_profile_id: string;
                };
                Insert: {
                    awarded_at?: string;
                    badge_key: string;
                    id?: string;
                    metadata?: Json | null;
                    seeker_profile_id: string;
                };
                Update: {
                    awarded_at?: string;
                    badge_key?: string;
                    id?: string;
                    metadata?: Json | null;
                    seeker_profile_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "seeker_badges_seeker_profile_id_fkey";
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
                    description: string | null;
                    does_not_expire: boolean;
                    expires_at: string | null;
                    id: string;
                    issued_at: string | null;
                    issuing_organization: string | null;
                    name: string;
                    seeker_profile_id: string;
                    skill_tags: string[];
                    sort_order: number;
                    updated_at: string;
                };
                Insert: {
                    category_tags?: string[];
                    created_at?: string;
                    credential_url?: string | null;
                    description?: string | null;
                    does_not_expire?: boolean;
                    expires_at?: string | null;
                    id?: string;
                    issued_at?: string | null;
                    issuing_organization?: string | null;
                    name: string;
                    seeker_profile_id: string;
                    skill_tags?: string[];
                    sort_order?: number;
                    updated_at?: string;
                };
                Update: {
                    category_tags?: string[];
                    created_at?: string;
                    credential_url?: string | null;
                    description?: string | null;
                    does_not_expire?: boolean;
                    expires_at?: string | null;
                    id?: string;
                    issued_at?: string | null;
                    issuing_organization?: string | null;
                    name?: string;
                    seeker_profile_id?: string;
                    skill_tags?: string[];
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
                    email_on_invite: boolean | null;
                    email_on_message: boolean | null;
                    email_on_status_change: boolean | null;
                    experience_level: string | null;
                    general_skill_tags: string[];
                    hero_cover_url: string | null;
                    housing_preference: string | null;
                    id: string;
                    interest_tags: string[];
                    location_pref: string | null;
                    match_confidence_score: number;
                    meals_preference: string | null;
                    onboarding_complete: boolean | null;
                    open_to_statement: string | null;
                    pay_expectation_max_cents: number | null;
                    pay_expectation_min_cents: number | null;
                    pay_expectation_unit: string | null;
                    pay_flexible: boolean;
                    profile_photo_asset_id: string | null;
                    profile_photo_url: string | null;
                    relative_location: string | null;
                    remote_preference: string | null;
                    seeking_timeline: string | null;
                    short_bio: string | null;
                    travel_readiness: string | null;
                    updated_at: string;
                    user_id: string | null;
                    visa_support_needed: boolean;
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
                    email_on_invite?: boolean | null;
                    email_on_message?: boolean | null;
                    email_on_status_change?: boolean | null;
                    experience_level?: string | null;
                    general_skill_tags?: string[];
                    hero_cover_url?: string | null;
                    housing_preference?: string | null;
                    id?: string;
                    interest_tags?: string[];
                    location_pref?: string | null;
                    match_confidence_score?: number;
                    meals_preference?: string | null;
                    onboarding_complete?: boolean | null;
                    open_to_statement?: string | null;
                    pay_expectation_max_cents?: number | null;
                    pay_expectation_min_cents?: number | null;
                    pay_expectation_unit?: string | null;
                    pay_flexible?: boolean;
                    profile_photo_asset_id?: string | null;
                    profile_photo_url?: string | null;
                    relative_location?: string | null;
                    remote_preference?: string | null;
                    seeking_timeline?: string | null;
                    short_bio?: string | null;
                    travel_readiness?: string | null;
                    updated_at?: string;
                    user_id?: string | null;
                    visa_support_needed?: boolean;
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
                    email_on_invite?: boolean | null;
                    email_on_message?: boolean | null;
                    email_on_status_change?: boolean | null;
                    experience_level?: string | null;
                    general_skill_tags?: string[];
                    hero_cover_url?: string | null;
                    housing_preference?: string | null;
                    id?: string;
                    interest_tags?: string[];
                    location_pref?: string | null;
                    match_confidence_score?: number;
                    meals_preference?: string | null;
                    onboarding_complete?: boolean | null;
                    open_to_statement?: string | null;
                    pay_expectation_max_cents?: number | null;
                    pay_expectation_min_cents?: number | null;
                    pay_expectation_unit?: string | null;
                    pay_flexible?: boolean;
                    profile_photo_asset_id?: string | null;
                    profile_photo_url?: string | null;
                    relative_location?: string | null;
                    remote_preference?: string | null;
                    seeking_timeline?: string | null;
                    short_bio?: string | null;
                    travel_readiness?: string | null;
                    updated_at?: string;
                    user_id?: string | null;
                    visa_support_needed?: boolean;
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
                    is_current: boolean;
                    location: string | null;
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
                    is_current?: boolean;
                    location?: string | null;
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
                    is_current?: boolean;
                    location?: string | null;
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
                    location: string | null;
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
                    location?: string | null;
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
                    location?: string | null;
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
            source_import_runs: {
                Row: {
                    error: string | null;
                    finished_at: string | null;
                    id: string;
                    payload_fingerprint: string;
                    source_id: string;
                    started_at: string;
                    stats: Json;
                    status: string;
                };
                Insert: {
                    error?: string | null;
                    finished_at?: string | null;
                    id?: string;
                    payload_fingerprint: string;
                    source_id: string;
                    started_at?: string;
                    stats?: Json;
                    status?: string;
                };
                Update: {
                    error?: string | null;
                    finished_at?: string | null;
                    id?: string;
                    payload_fingerprint?: string;
                    source_id?: string;
                    started_at?: string;
                    stats?: Json;
                    status?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "source_import_runs_source_id_fkey";
                        columns: ["source_id"];
                        isOneToOne: false;
                        referencedRelation: "listing_sources";
                        referencedColumns: ["id"];
                    }
                ];
            };
            source_records: {
                Row: {
                    classification: Json;
                    content_fingerprint: string;
                    created_at: string;
                    external_id: string | null;
                    id: string;
                    import_run_id: string;
                    listing_id: string | null;
                    matched_listing_id: string | null;
                    needs_review: boolean;
                    normalized: Json;
                    outcome: string;
                    raw: Json | null;
                    reject_reason: string | null;
                    source_id: string;
                };
                Insert: {
                    classification?: Json;
                    content_fingerprint: string;
                    created_at?: string;
                    external_id?: string | null;
                    id?: string;
                    import_run_id: string;
                    listing_id?: string | null;
                    matched_listing_id?: string | null;
                    needs_review?: boolean;
                    normalized?: Json;
                    outcome: string;
                    raw?: Json | null;
                    reject_reason?: string | null;
                    source_id: string;
                };
                Update: {
                    classification?: Json;
                    content_fingerprint?: string;
                    created_at?: string;
                    external_id?: string | null;
                    id?: string;
                    import_run_id?: string;
                    listing_id?: string | null;
                    matched_listing_id?: string | null;
                    needs_review?: boolean;
                    normalized?: Json;
                    outcome?: string;
                    raw?: Json | null;
                    reject_reason?: string | null;
                    source_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "source_records_import_run_id_fkey";
                        columns: ["import_run_id"];
                        isOneToOne: false;
                        referencedRelation: "source_import_runs";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "source_records_listing_id_fkey";
                        columns: ["listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "source_records_matched_listing_id_fkey";
                        columns: ["matched_listing_id"];
                        isOneToOne: false;
                        referencedRelation: "listings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "source_records_source_id_fkey";
                        columns: ["source_id"];
                        isOneToOne: false;
                        referencedRelation: "listing_sources";
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
            claim_notification_deliveries: {
                Args: {
                    p_lease_seconds?: number;
                    p_limit?: number;
                    p_worker_id: string;
                };
                Returns: {
                    attempt_count: number;
                    cadence: string;
                    category: string;
                    channel: string;
                    collapsed_into_delivery_id: string | null;
                    created_at: string;
                    dedup_key: string;
                    delivered_at: string | null;
                    event_id: string | null;
                    failure_class: string | null;
                    failure_detail: string | null;
                    id: string;
                    intent: Json;
                    lease_expires_at: string | null;
                    next_attempt_at: string;
                    notification_type: string;
                    provider_message_id: string | null;
                    recipient_clerk_user_id: string;
                    status: string;
                    suppression_reason: string | null;
                    updated_at: string;
                    variant: string;
                    worker_id: string | null;
                }[];
                SetofOptions: {
                    from: "*";
                    to: "notification_deliveries";
                    isOneToOne: false;
                    isSetofReturn: true;
                };
            };
            convert_claimed_listing: {
                Args: {
                    p_actor_user_id: string;
                    p_claim_id: string;
                    p_confirmed?: Json;
                    p_host_profile_id: string;
                };
                Returns: Json;
            };
            create_invite_with_credit: {
                Args: {
                    p_host_profile_id: string;
                    p_invited_by_user_id: string;
                    p_listing_id: string;
                    p_message: string;
                    p_monthly_allowance: number;
                    p_seeker_profile_id: string;
                };
                Returns: Json;
            };
            create_my_host_profile: {
                Args: {
                    p_category_scopes: string[];
                    p_company_name: string;
                    p_primary_location_name: string;
                };
                Returns: string;
            };
            current_conversation_ids: {
                Args: never;
                Returns: string[];
            };
            current_host_listing_ids: {
                Args: never;
                Returns: string[];
            };
            current_host_profile_ids: {
                Args: never;
                Returns: string[];
            };
            current_seeker_profile_ids: {
                Args: never;
                Returns: string[];
            };
            ensure_my_seeker_profile: {
                Args: never;
                Returns: string;
            };
            get_clerk_user_id: {
                Args: never;
                Returns: string;
            };
            get_my_host_benefit_library: {
                Args: never;
                Returns: Json;
            };
            get_owned_benefit_context: {
                Args: {
                    p_listing_id: string;
                };
                Returns: {
                    benefit_details: Json;
                    benefit_library: Json;
                    host_profile_id: string;
                    subscription_tier: string;
                }[];
            };
            get_public_benefit_details: {
                Args: {
                    p_listing_id: string;
                };
                Returns: Json;
            };
            get_public_housing_photos: {
                Args: {
                    p_listing_id: string;
                };
                Returns: {
                    role: string;
                    source: string;
                    url: string;
                }[];
            };
            get_unprocessed_notification_events: {
                Args: {
                    p_limit?: number;
                };
                Returns: {
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
                }[];
                SetofOptions: {
                    from: "*";
                    to: "events";
                    isOneToOne: false;
                    isSetofReturn: true;
                };
            };
            restore_invite_credit: {
                Args: {
                    p_invite_id: string;
                };
                Returns: boolean;
            };
            save_owned_benefit_detail: {
                Args: {
                    p_detail: Json;
                    p_kind: string;
                    p_listing_id: string;
                };
                Returns: {
                    benefit_details: Json;
                    previous_detail: Json;
                }[];
            };
            set_my_housing_library_photo: {
                Args: {
                    p_role: string;
                    p_url: string;
                };
                Returns: {
                    benefit_library: Json;
                    host_profile_id: string;
                    previous_url: string;
                }[];
            };
            show_limit: {
                Args: never;
                Returns: number;
            };
            show_trgm: {
                Args: {
                    "": string;
                };
                Returns: string[];
            };
            transition_listing_claim: {
                Args: {
                    p_actor_user_id: string;
                    p_claim_id: string;
                    p_review_notes?: string;
                    p_to_status: string;
                };
                Returns: Json;
            };
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

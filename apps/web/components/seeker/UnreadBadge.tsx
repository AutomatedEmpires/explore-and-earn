"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient } from "@explore-and-earn/db";

export interface UnreadBadgeProps {
	/** Server-resolved unread count at render time. */
	readonly initialCount: number;
	/** Authed seeker's Clerk user id (notifications.recipient_clerk_user_id). */
	readonly clerkUserId?: string | null;
	/** Badge CSS class, owned by the header so styling stays consistent. */
	readonly className?: string;
}

/**
 * Live unread-notification badge for the seeker header.
 *
 * Starts from the server-resolved `initialCount`, then:
 *  - increments on every realtime INSERT into `public.notifications` addressed
 *    to this seeker (channel `notifications:${clerkUserId}`, anon-key client);
 *  - resets to 0 when the notifications page dispatches the
 *    `"notifications:cleared"` window event (mark-all-read).
 *
 * Renders nothing when the count is 0, matching the previous static badge.
 */
export function UnreadBadge({
	initialCount,
	clerkUserId,
	className,
}: UnreadBadgeProps) {
	const [count, setCount] = useState<number>(
		Number.isFinite(initialCount) && initialCount > 0
			? Math.floor(initialCount)
			: 0,
	);

	// Reset when the seeker opens the notifications page (mark-all-read).
	useEffect(() => {
		function handleCleared() {
			setCount(0);
		}
		window.addEventListener("notifications:cleared", handleCleared);
		return () =>
			window.removeEventListener("notifications:cleared", handleCleared);
	}, []);

	// Subscribe to new notifications addressed to this seeker.
	useEffect(() => {
		if (!clerkUserId) return;
		const supabase = anonClient() as unknown as SupabaseClient;
		const channel = supabase
			.channel(`notifications:${clerkUserId}`)
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "notifications",
					filter: `recipient_clerk_user_id=eq.${clerkUserId}`,
				},
				() => setCount((c) => c + 1),
			)
			.subscribe();
		return () => {
			void supabase.removeChannel(channel);
		};
	}, [clerkUserId]);

	if (count <= 0) return null;
	return <span className={className}>{count > 99 ? "99+" : count}</span>;
}

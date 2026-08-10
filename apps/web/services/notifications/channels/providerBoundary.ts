/** Provider mutations must finish well inside the renewed 330-second lease. */
const PROVIDER_MUTATION_TIMEOUT_MS = 30_000

export class NotificationProviderTimeoutError extends Error {
	constructor() {
		super("notification provider mutation timed out")
		this.name = "NotificationProviderTimeoutError"
	}
}

/**
 * Bound only the actual provider/database mutation. Callers must finish all
 * lookup, rendering, suppression, and consent work before invoking this.
 */
export async function withProviderMutationTimeout<T>(
	mutation: () => Promise<T>,
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>((_resolve, reject) => {
		timeoutId = setTimeout(
			() => reject(new NotificationProviderTimeoutError()),
			PROVIDER_MUTATION_TIMEOUT_MS,
		)
	})
	try {
		return await Promise.race([mutation(), timeout])
	} finally {
		if (timeoutId !== undefined) clearTimeout(timeoutId)
	}
}

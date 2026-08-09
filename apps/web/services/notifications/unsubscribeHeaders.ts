import "server-only"

type ListUnsubscribeHeaders = Readonly<{
	"List-Unsubscribe": string
	"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
}>

/**
 * Build the exact RFC 8058 header pair for a valid HTTPS unsubscribe URL.
 * Invalid, relative, or non-HTTPS URLs intentionally return no headers so a
 * local or misconfigured origin can never advertise unsupported one-click
 * unsubscribe behavior to mailbox providers.
 */
export function buildListUnsubscribeHeaders(
	unsubscribeUrl: string | null | undefined,
): ListUnsubscribeHeaders | undefined {
	if (!unsubscribeUrl) return undefined

	try {
		const parsed = new URL(unsubscribeUrl)
		if (
			parsed.protocol !== "https:" ||
			parsed.username !== "" ||
			parsed.password !== "" ||
			parsed.hash !== ""
		) {
			return undefined
		}

		return {
			"List-Unsubscribe": `<${parsed.href}>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		}
	} catch {
		return undefined
	}
}

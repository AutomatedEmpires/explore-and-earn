// /api/v1/unsubscribe?token=<token>: the link in every email's List-Unsubscribe header and
// footer. No sign-in: the signed token names the user and the category.
//
// - POST turns off that category's email and confirms. Mail clients send it for one-click
//   unsubscribe (RFC 8058: body `List-Unsubscribe=One-Click`, no cookies, no Origin), and the
//   confirmation form below sends it from the browser.
// - GET only shows the confirmation form. Mail security scanners prefetch links, so a GET that
//   unsubscribed would turn people's email off without them asking (RFC 8058, section 1).
import {
  CATEGORY_LABELS,
  MANDATORY_CATEGORIES,
  unsubscribe,
  verifyUnsubscribeToken,
} from '@/modules/notifications';
import { apiRoute } from '@/server/api';

const BRAND = 'Explore&amp;Earn';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function page(status: number, title: string, bodyHtml: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} - ${BRAND}</title>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
<p><a href="/notifications">Manage all your notifications</a></p>
</main>
</body>
</html>
`;
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}

function invalidLink(): Response {
  return page(
    400,
    'This unsubscribe link is not valid',
    `<p>The link may be incomplete. Copy the whole link from the email, or change your email settings in ${BRAND}.</p>`,
  );
}

function tokenOf(req: Request): string {
  return new URL(req.url).searchParams.get('token') ?? '';
}

export const GET = apiRoute({
  auth: 'none',
  handler: async ({ req }) => {
    const token = tokenOf(req);
    const target = verifyUnsubscribeToken(token);
    if (!target) return invalidLink();
    const label = CATEGORY_LABELS[target.category].toLowerCase();
    const action = `/api/v1/unsubscribe?token=${encodeURIComponent(token)}`;
    return page(
      200,
      'Unsubscribe from these emails?',
      `<p>You'll stop getting ${escapeHtml(label)} emails from ${BRAND}. You'll still see these notifications in the app.</p>
<form method="post" action="${escapeHtml(action)}">
<button type="submit">Unsubscribe</button>
</form>`,
    );
  },
});

export const POST = apiRoute({
  auth: 'none',
  handler: async ({ req, db }) => {
    const target = await unsubscribe(db, tokenOf(req));
    if (!target) return invalidLink();
    const label = CATEGORY_LABELS[target.category].toLowerCase();
    const required =
      MANDATORY_CATEGORIES.has(target.category) || target.category === 'operator'
        ? `<p>Some ${escapeHtml(label)} emails are required and will still arrive.</p>`
        : '';
    return page(
      200,
      "You're unsubscribed",
      `<p>You won't get ${escapeHtml(label)} emails from ${BRAND} anymore. You can turn them back on in your notification settings.</p>
${required}`,
    );
  },
});

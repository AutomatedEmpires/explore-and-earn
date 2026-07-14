import {
  applicationReceivedEmail,
  applicationStatusEmail,
  inviteAcceptedEmail,
  inviteEmail,
  inviteReceivedEmail,
  newMessageEmail,
  welcomeHostEmail,
  welcomeSeekerEmail,
} from "../../../../lib/emails";

export interface EmailPreview {
  readonly slug: string;
  readonly label: string;
  readonly subject: string;
  readonly render: () => string;
}

const APP = "https://exploreandearn.com";

/**
 * Fixture-backed previews of every transactional email, used by the admin-only
 * /admin/email-preview QA surface. Each render() calls the real template
 * function with hardcoded sample data so the output matches production HTML.
 */
export const EMAIL_PREVIEWS: readonly EmailPreview[] = [
  {
    slug: "welcomeSeeker",
    label: "Welcome — seeker",
    subject: "Welcome to Explore & Earn",
    render: () =>
      welcomeSeekerEmail({ name: "Sam", exploreUrl: `${APP}/swipe` }),
  },
  {
    slug: "welcomeHost",
    label: "Welcome — host",
    subject: "Your host account is ready",
    render: () =>
      welcomeHostEmail({
        name: "Cedar Hollow Farm",
        createListingUrl: `${APP}/host`,
      }),
  },
  {
    slug: "inviteEmail",
    label: "Invite — host invited a seeker",
    subject: "Cedar Hollow Farm invited you to apply to Spring Farmhand",
    render: () =>
      inviteEmail({
        hostName: "Cedar Hollow Farm",
        listingTitle: "Spring Farmhand",
        listingLocation: "Sonoma County, CA",
        message:
          "We loved your profile and would be thrilled to have you this season.",
        inviteUrl: `${APP}/invites`,
      }),
  },
  {
    slug: "inviteReceived",
    label: "Invite received — seeker",
    subject: "Cedar Hollow Farm invited you to apply",
    render: () =>
      inviteReceivedEmail({
        hostCompany: "Cedar Hollow Farm",
        listingTitle: "Spring Farmhand",
        message: "Hope you can join us for the spring season!",
        invitesUrl: `${APP}/invites`,
      }),
  },
  {
    slug: "inviteAccepted",
    label: "Invite accepted — host",
    subject: "Sam Rivera accepted your invite to Spring Farmhand",
    render: () =>
      inviteAcceptedEmail({
        seekerName: "Sam Rivera",
        listingTitle: "Spring Farmhand",
        applicantsUrl: `${APP}/host/applicants`,
      }),
  },
  {
    slug: "applicationReceived",
    label: "Application received — host",
    subject: "Sam Rivera applied to Spring Farmhand",
    render: () =>
      applicationReceivedEmail({
        seekerName: "Sam Rivera",
        listingTitle: "Spring Farmhand",
        reviewUrl: `${APP}/host/applicants`,
      }),
  },
  {
    slug: "applicationStatus",
    label: "Application status — seeker",
    subject: "Your application to Spring Farmhand — You Got an Offer!",
    render: () =>
      applicationStatusEmail({
        listingTitle: "Spring Farmhand",
        newStatus: "offered",
        statusLabel: "You Got an Offer! \uD83C\uDF89",
        dashboardUrl: `${APP}/applied`,
      }),
  },
  {
    slug: "newMessage",
    label: "New message",
    subject: "New message about Spring Farmhand",
    render: () =>
      newMessageEmail({
        senderName: "Cedar Hollow Farm",
        listingTitle: "Spring Farmhand",
        messagePreview:
          "Hi Sam! Thanks for applying — when could you start? We're hoping for early April.",
        conversationUrl: `${APP}/messages/demo-conversation`,
      }),
  },
];

export function getEmailPreview(slug: string): EmailPreview | undefined {
  return EMAIL_PREVIEWS.find((preview) => preview.slug === slug);
}

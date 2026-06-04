export function renderPlaceholderMailTemplate(templateName) {
    // TODO: Replace with Resend-backed templates after transactional message
    // rules are approved for implementation.
    return {
        subject: `${templateName} placeholder`,
        body: "TODO: Add canonical email copy and rendering logic."
    };
}

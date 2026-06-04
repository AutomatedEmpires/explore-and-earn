export interface MailTemplate {
    readonly subject: string;
    readonly body: string;
}
export declare function renderPlaceholderMailTemplate(templateName: string): MailTemplate;

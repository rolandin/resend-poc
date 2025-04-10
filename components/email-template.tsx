import * as React from 'react';

interface EmailTemplateProps {
  to: string;
  subject: string;
  html: string;
}

export const EmailTemplate: React.FC<Readonly<EmailTemplateProps>> = ({
  to,
  subject,
  html,
}) => (
  <div>
    <h1>{subject}</h1>
    <div dangerouslySetInnerHTML={{ __html: html }} />
  </div>
); 
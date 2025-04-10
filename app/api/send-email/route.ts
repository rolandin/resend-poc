import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { convert } from 'html-to-text';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const SENDER_EMAIL = 'Roland Niubo <roland@pototico.com>';
const REPLY_TO = 'support@pototico.com';

export async function POST(request: Request) {
  try {
    const { to, subject, html } = await request.json();

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Convert HTML to text for better email deliverability
    const text = convert(html, {
      wordwrap: 130,
      selectors: [
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
        { selector: 'img', format: 'skip' }
      ]
    });

    // Step 1: Save email metadata to Supabase
    const { data: emailInsert, error: emailError } = await supabase
      .from('emails_metadata_resend')
      .insert({ 
        to_email: to, 
        subject,
        sent_at: new Date().toISOString(),
        status: 'pending'
      })
      .select()
      .single();

    if (emailError) {
      console.error('Supabase insert error:', emailError);
      return NextResponse.json(
        { error: 'Failed to save email metadata' },
        { status: 500 }
      );
    }

    // Step 2: Send email using Resend REST API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: SENDER_EMAIL,
        reply_to: REPLY_TO,
        to,
        subject,
        html,
        text, // Add plain text version
        headers: {
          'List-Unsubscribe': `<mailto:${REPLY_TO}?subject=unsubscribe>`,
          'X-Entity-Ref-ID': emailInsert.id,
        },
        tags: [
          {
            name: 'category',
            value: 'test-email'
          },
          {
            name: 'email_id',
            value: emailInsert.id
          }
        ]
      }),
    });

    const sendResult = await resendResponse.json();

    if (!resendResponse.ok) {
      // Update status to failed if the send failed
      await supabase
        .from('emails_metadata_resend')
        .update({ status: 'failed' })
        .eq('id', emailInsert.id);

      throw new Error(sendResult.message || 'Failed to send email');
    }

    // Update status to sent and store message_id if successful
    const { error: updateError } = await supabase
      .from('emails_metadata_resend')
      .update({ 
        status: 'sent',
        message_id: sendResult.id, // Resend returns the message_id in the id field
        delivered_at: new Date().toISOString()
      })
      .eq('id', emailInsert.id);

    if (updateError) {
      console.error('Failed to update email status:', updateError);
    }

    return NextResponse.json({
      message: 'Email sent successfully',
      email: emailInsert,
      resend: sendResult,
    });
  } catch (error: any) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
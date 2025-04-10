import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const { to, subject, html } = await request.json();

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Step 1: Save email metadata to Supabase
    const { data: emailInsert, error: emailError } = await supabase
      .from('emails_metadata_resend')
      .insert({ to_email: to, subject })
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
        from: 'noreply@pototico.com',
        to,
        subject,
        html,
      }),
    });

    const sendResult = await resendResponse.json();

    if (!resendResponse.ok) {
      throw new Error(sendResult.message || 'Failed to send email');
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
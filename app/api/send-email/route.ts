import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

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

    // Step 2: Send email using Resend
    const sendResult = await resend.emails.send({
      from: 'noreply@pototico.com',
      to,
      subject,
      html,
    });

    return NextResponse.json({
      message: 'Email sent successfully',
      email: emailInsert,
      resend: sendResult,
    });
  } catch (error: any) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
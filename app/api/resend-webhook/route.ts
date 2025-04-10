import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const event = await req.json();

    const { type, created_at, data } = event;

    // Try to match the event to an existing email log (based on recipient)
    const { data: emailRecord } = await supabase
      .from('emails_metadata_resend')
      .select('*')
      .eq('to_email', data?.recipient)
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    // Store the event in the database
    const { error: insertError } = await supabase
      .from('emails_events_resend')
      .insert({
        email_id: emailRecord?.id || null,
        event_type: type,
        event_timestamp: created_at || new Date().toISOString(),
        event_payload: data,
        recipient: data?.recipient,
        message_id: data?.message_id,
      });

    if (insertError) {
      console.error('Error inserting event:', insertError);
      return NextResponse.json(
        { error: 'Failed to store event' },
        { status: 500 }
      );
    }

    // If this is a delivery event, update the email record
    if (type === 'email.delivered' && emailRecord?.id) {
      const { error: updateError } = await supabase
        .from('emails_metadata_resend')
        .update({ 
          delivered_at: created_at,
          status: 'delivered'
        })
        .eq('id', emailRecord.id);

      if (updateError) {
        console.error('Error updating email status:', updateError);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook error' },
      { status: 500 }
    );
  }
} 
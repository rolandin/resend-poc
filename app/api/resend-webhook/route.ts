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

    console.log('Received webhook event:', JSON.stringify({ type, data }, null, 2));

    // Validate required fields
    if (!type || !data) {
      console.error('Missing required fields in webhook:', { type, data });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Try to match the event to an existing email log using message_id and recipient
    const { data: emailRecord, error: selectError } = await supabase
      .from('emails_metadata_resend')
      .select('*')
      .eq('message_id', data?.message_id)
      .eq('to_email', data?.recipient)
      .single();

    if (selectError) {
      console.log('Error finding email by message_id:', selectError);
    }

    // If we can't find by message_id, try to find by recipient as fallback
    let matchedEmail = emailRecord;
    if (!matchedEmail) {
      console.log('Could not find email by message_id, trying recipient only');
      const { data: fallbackRecord, error: fallbackError } = await supabase
        .from('emails_metadata_resend')
        .select('*')
        .eq('to_email', data?.recipient)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      if (fallbackError) {
        console.log('Error finding email by recipient:', fallbackError);
      } else if (fallbackRecord) {
        console.log('Found email by recipient fallback:', fallbackRecord.id);
        matchedEmail = fallbackRecord;
      }
    } else {
      console.log('Found email by message_id:', matchedEmail.id);
    }

    // Store the event in the database
    const { error: insertError } = await supabase
      .from('emails_events_resend')
      .insert({
        email_id: matchedEmail?.id || null,
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

    console.log('Successfully stored event:', {
      type,
      email_id: matchedEmail?.id,
      message_id: data?.message_id
    });

    // Update email status based on event type
    if (matchedEmail?.id) {
      let newStatus;
      let updateData: any = {};

      switch (type) {
        case 'email.sent':
          newStatus = 'sent';
          updateData.delivered_at = created_at;
          break;
        case 'email.delivered':
          newStatus = 'delivered';
          updateData.delivered_at = created_at;
          break;
        case 'email.delivery_delayed':
          newStatus = 'delayed';
          break;
        case 'email.complained':
        case 'email.bounced':
          newStatus = 'failed';
          break;
        default:
          console.log('No status update needed for event type:', type);
          newStatus = null;
      }

      if (newStatus) {
        updateData.status = newStatus;
        const { error: updateError } = await supabase
          .from('emails_metadata_resend')
          .update(updateData)
          .eq('id', matchedEmail.id);

        if (updateError) {
          console.error('Error updating email status:', updateError);
        } else {
          console.log('Updated email status:', {
            id: matchedEmail.id,
            status: newStatus,
            delivered_at: updateData.delivered_at
          });
        }
      }
    } else {
      console.log('Could not find matching email record for event:', {
        type,
        message_id: data?.message_id,
        recipient: data?.recipient
      });
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
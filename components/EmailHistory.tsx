'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, CheckCircle2, XCircle, Clock } from 'lucide-react';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface EmailMetadata {
  id: string;
  to_email: string;
  subject: string;
  sent_at: string;
  status: string;
  delivered_at: string | null;
}

interface EmailEvent {
  id: string;
  email_id: string;
  event_type: string;
  event_timestamp: string;
  recipient: string;
  message_id: string;
}

export function EmailHistory() {
  const [emails, setEmails] = useState<EmailMetadata[]>([]);
  const [events, setEvents] = useState<EmailEvent[]>([]);

  useEffect(() => {
    // Initial fetch of emails
    const fetchEmails = async () => {
      const { data: emailsData } = await supabase
        .from('emails_metadata_resend')
        .select('*')
        .order('sent_at', { ascending: false });
      
      if (emailsData) setEmails(emailsData);
    };

    // Initial fetch of events
    const fetchEvents = async () => {
      const { data: eventsData } = await supabase
        .from('emails_events_resend')
        .select('*')
        .order('event_timestamp', { ascending: false });
      
      if (eventsData) setEvents(eventsData);
    };

    fetchEmails();
    fetchEvents();

    // Subscribe to real-time changes
    const emailsSubscription = supabase
      .channel('emails-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emails_metadata_resend',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setEmails((current) => [payload.new as EmailMetadata, ...current]);
          } else if (payload.eventType === 'UPDATE') {
            setEmails((current) =>
              current.map((email) =>
                email.id === payload.new.id ? (payload.new as EmailMetadata) : email
              )
            );
          }
        }
      )
      .subscribe();

    const eventsSubscription = supabase
      .channel('events-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emails_events_resend',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setEvents((current) => [payload.new as EmailEvent, ...current]);
          }
        }
      )
      .subscribe();

    return () => {
      emailsSubscription.unsubscribe();
      eventsSubscription.unsubscribe();
    };
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
      case 'sent':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
      case 'sent':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'MMM d, HH:mm:ss');
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="h-[600px] overflow-auto">
        <CardHeader className="space-y-1 sticky top-0 bg-white z-10 border-b">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Mail className="h-5 w-5" />
            Recent Emails
          </CardTitle>
          <CardDescription>
            A list of recently sent emails and their status
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="whitespace-nowrap">Sent At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="whitespace-nowrap">Delivered At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email) => (
                  <TableRow key={email.id}>
                    <TableCell className="max-w-[150px] truncate" title={email.to_email}>
                      {email.to_email}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate" title={email.subject}>
                      {email.subject}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(email.sent_at), 'MMM d, HH:mm')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(email.status)}
                        <Badge variant="secondary" className={getStatusColor(email.status)}>
                          {email.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(email.delivered_at)}
                    </TableCell>
                  </TableRow>
                ))}
                {emails.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No emails sent yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="h-[600px] overflow-auto">
        <CardHeader className="space-y-1 sticky top-0 bg-white z-10 border-b">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Mail className="h-5 w-5" />
            Email Events
          </CardTitle>
          <CardDescription>
            Real-time events from email delivery and interactions
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead className="whitespace-nowrap">Timestamp</TableHead>
                  <TableHead>Message ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {event.event_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate" title={event.recipient}>
                      {event.recipient}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(event.event_timestamp), 'MMM d, HH:mm')}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[150px] truncate" title={event.message_id}>
                      {event.message_id}
                    </TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No events received yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 
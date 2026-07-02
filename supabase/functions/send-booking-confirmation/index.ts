// Supabase Edge Function stub — deploy with: supabase functions deploy send-booking-confirmation
// Wire Resend/SendGrid/etc. in production. Client falls back to mailto + HTML cache when unavailable.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { to, subject, html, text, bookingId } = body as {
      to?: string;
      subject?: string;
      html?: string;
      text?: string;
      bookingId?: string;
    };

    if (!to || !subject) {
      return new Response(JSON.stringify({ error: 'Missing to or subject' }), { status: 400 });
    }

    // TODO: integrate transactional email provider (Resend, SendGrid, etc.)
    console.log('send-booking-confirmation', { to, subject, bookingId, htmlLength: html?.length, textLength: text?.length });

    return new Response(JSON.stringify({ ok: true, bookingId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[send-booking-confirmation]', error);
    return new Response(
      JSON.stringify({
        error: 'Something went wrong. Please try again later.',
      }),
      { status: 500 },
    );
  }
});

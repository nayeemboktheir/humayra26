import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature, x-lovable-signature, x-lovable-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

const SITE_NAME = "TradeOn Global"
const ROOT_DOMAIN = "tradeon.global"
const FROM_EMAIL = `noreply@${ROOT_DOMAIN}`

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<{ id: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY not configured')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${SITE_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(`Resend API error [${response.status}]: ${JSON.stringify(data)}`)
  }

  return data
}

// Preview endpoint handler
async function handlePreview(req: Request): Promise<Response> {
  const previewCorsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: previewCorsHeaders })
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const authHeader = req.headers.get('Authorization')

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let type: string
  try {
    const body = await req.json()
    type = body.type
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]
  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const SAMPLE_URL = "https://humayra26.lovable.app"
  const sampleData: Record<string, object> = {
    signup: { siteName: SITE_NAME, siteUrl: SAMPLE_URL, recipient: "user@example.test", confirmationUrl: SAMPLE_URL },
    magiclink: { siteName: SITE_NAME, confirmationUrl: SAMPLE_URL },
    recovery: { siteName: SITE_NAME, confirmationUrl: SAMPLE_URL },
    invite: { siteName: SITE_NAME, siteUrl: SAMPLE_URL, confirmationUrl: SAMPLE_URL },
    email_change: { siteName: SITE_NAME, email: "user@example.test", newEmail: "user@example.test", confirmationUrl: SAMPLE_URL },
    reauthentication: { token: '123456' },
  }

  const html = await renderAsync(React.createElement(EmailTemplate, sampleData[type] || {}))
  return new Response(html, {
    status: 200,
    headers: { ...previewCorsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}


// ---------------------------------------------------------------------------
// Webhook authentication
//
// This endpoint renders a fully-branded TradeOn email and hands it to Resend.
// It ran with `verify_jwt = false` and *no* verification of any kind, which made
// it an open relay: anyone could POST an arbitrary recipient and an arbitrary
// `url`, and Resend would deliver a genuine-looking "reset your password" mail
// from noreply@tradeon.global pointing at the attacker's link — on our own
// sending reputation. `handlePreview` below already did a bearer check; the
// webhook path simply never got one.
//
// Two accepted proofs, in order:
//   1. The Supabase auth-hook signature (standard-webhooks): HMAC-SHA256 over
//      `${webhook-id}.${webhook-timestamp}.${body}` keyed by SEND_EMAIL_HOOK_SECRET.
//   2. `Authorization: Bearer ${LOVABLE_API_KEY}` — the same secret /preview uses,
//      for the Lovable-managed direct-call path.
//
// If neither secret is configured we reject. Failing open here is what the bug
// was; an outage in auth email is recoverable, an open phishing relay is not.
// ---------------------------------------------------------------------------

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function decodeHookSecret(secret: string): Uint8Array {
  // Supabase hands this out as `v1,whsec_<base64>`; tolerate the bare forms too.
  const raw = secret.replace(/^v1,/, '').replace(/^whsec_/, '')
  try {
    return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
  } catch {
    return new TextEncoder().encode(secret)
  }
}

async function verifyHookSignature(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const id = req.headers.get('webhook-id')
  const timestamp = req.headers.get('webhook-timestamp')
  const signatureHeader = req.headers.get('webhook-signature')
  if (!id || !timestamp || !signatureHeader) return false

  // Reject stale payloads so a captured request can't be replayed indefinitely.
  const sent = Number(timestamp)
  if (!Number.isFinite(sent)) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - sent) > SIGNATURE_TOLERANCE_SECONDS) return false

  const key = await crypto.subtle.importKey(
    'raw',
    decodeHookSecret(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
  )
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  // The header carries one or more space-separated `v1,<sig>` values.
  return signatureHeader
    .split(' ')
    .map((part) => part.split(',')[1] ?? '')
    .some((candidate) => timingSafeEqual(candidate, expected))
}

async function isAuthorizedWebhook(req: Request, rawBody: string): Promise<boolean> {
  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  if (hookSecret && (await verifyHookSignature(req, rawBody, hookSecret))) return true

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (apiKey && req.headers.get('Authorization') === `Bearer ${apiKey}`) return true

  if (!hookSecret && !apiKey) {
    console.error('auth-email-hook: neither SEND_EMAIL_HOOK_SECRET nor LOVABLE_API_KEY is set; rejecting')
  }
  return false
}

// Webhook handler - sends email via Resend
async function handleWebhook(req: Request): Promise<Response> {
  // Read the body as text first: signature verification is over the exact bytes.
  const rawBody = await req.text()

  if (!(await isAuthorizedWebhook(req, rawBody))) {
    console.warn('auth-email-hook: rejected unauthenticated webhook call')
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Support both direct calls and Lovable webhook format
  const emailType = payload.data?.action_type || payload.action_type || payload.type
  const recipientEmail = payload.data?.email || payload.email
  const confirmationUrl = payload.data?.url || payload.url
  const token = payload.data?.token || payload.token
  const newEmail = payload.data?.new_email || payload.new_email

  console.log('Received auth event', { emailType, email: recipientEmail })

  if (!emailType || !recipientEmail) {
    return new Response(JSON.stringify({ error: 'Missing emailType or email' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${emailType}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: `https://${ROOT_DOMAIN}`,
    recipient: recipientEmail,
    confirmationUrl,
    token,
    email: recipientEmail,
    newEmail,
  }

  const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
  const text = await renderAsync(React.createElement(EmailTemplate, templateProps), { plainText: true })

  try {
    const result = await sendViaResend(
      recipientEmail,
      EMAIL_SUBJECTS[emailType] || 'Notification',
      html,
      text
    )
    console.log('Email sent via Resend', { id: result.id })
    return new Response(JSON.stringify({ success: true, message_id: result.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email'
    console.error('Resend error', { error: message })
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req)
  }

  try {
    return await handleWebhook(req)
  } catch (error) {
    console.error('Handler error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

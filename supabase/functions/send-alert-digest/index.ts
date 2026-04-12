import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const SEVERITY_COLORS: Record<string, string> = {
  red: '#dc2626',
  yellow: '#d97706',
}

const SEVERITY_LABELS: Record<string, string> = {
  red: 'CRITICAL',
  yellow: 'WARNING',
}

function buildEmailHtml(
  alerts: Array<{
    severity: string
    metric_label: string
    message: string
    triggered_at: string
  }>
): string {
  const rows = alerts
    .map((a) => {
      const color = SEVERITY_COLORS[a.severity] ?? '#6b7280'
      const label = SEVERITY_LABELS[a.severity] ?? a.severity.toUpperCase()
      const time = new Date(a.triggered_at).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background:${color};">
              ${label}
            </span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:500;">
            ${a.metric_label}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            ${a.message}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">
            ${time}
          </td>
        </tr>`
    })
    .join('')

  const redCount = alerts.filter((a) => a.severity === 'red').length
  const yellowCount = alerts.filter((a) => a.severity === 'yellow').length
  const summary = [
    redCount > 0 ? `${redCount} critical` : '',
    yellowCount > 0 ? `${yellowCount} warning` : '',
  ]
    .filter(Boolean)
    .join(', ')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;margin:0;padding:0;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <h2 style="margin:0 0 4px;">FinPulse Alert Digest</h2>
    <p style="color:#6b7280;margin:0 0 16px;font-size:14px;">
      ${alerts.length} new alert${alerts.length !== 1 ? 's' : ''} (${summary})
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Severity</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Metric</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Message</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Time</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <p style="color:#9ca3af;font-size:11px;margin-top:24px;">
      Sent by FinPulse. Manage thresholds in Settings.
    </p>
  </div>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabase: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: syncLog } = await supabase
    .from('fin_sync_log')
    .insert({ source: 'alert_digest', status: 'running', rows_synced: 0 })
    .select()
    .single()
  const syncId: string = syncLog?.id ?? ''

  try {
    // Query new unacknowledged alerts from the last 24 hours
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString()

    const { data: alerts, error: alertErr } = await supabase
      .from('fin_alerts')
      .select('severity, metric_key, metric_label, message, triggered_at')
      .eq('acknowledged', false)
      .gte('triggered_at', twentyFourHoursAgo)
      .order('severity', { ascending: true })
      .order('triggered_at', { ascending: false })

    if (alertErr) throw new Error(`Failed to load alerts: ${alertErr.message}`)

    if (!alerts || alerts.length === 0) {
      await supabase
        .from('fin_sync_log')
        .update({
          status: 'success',
          completed_at: new Date().toISOString(),
          rows_synced: 0,
          error_message: 'No new alerts in last 24h',
        })
        .eq('id', syncId)
      return new Response(
        JSON.stringify({ success: true, sent: false, reason: 'no_alerts' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Get notification email from settings
    const { data: settingsRow } = await supabase
      .from('fin_settings')
      .select('value')
      .eq('key', 'notification_email')
      .single()

    const raw = settingsRow?.value
    let emailTo: string | null = null
    if (typeof raw === 'string') {
      const s = raw.trim()
      if (s.includes('@')) emailTo = s
    } else if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>
      const digest = o.alert_digest_email
      const legacy = o.email
      if (typeof digest === 'string' && digest.includes('@')) {
        emailTo = digest.trim()
      } else if (typeof legacy === 'string' && legacy.includes('@')) {
        emailTo = legacy.trim()
      }
    }

    if (!emailTo) {
      const msg = 'No valid notification_email configured in fin_settings'
      await supabase
        .from('fin_sync_log')
        .update({
          status: 'error',
          completed_at: new Date().toISOString(),
          error_message: msg,
        })
        .eq('id', syncId)
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Send via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) throw new Error('Missing RESEND_API_KEY env var')

    const html = buildEmailHtml(
      alerts as Array<{
        severity: string
        metric_label: string
        message: string
        triggered_at: string
      }>
    )

    const redCount = alerts.filter((a) => a.severity === 'red').length
    const subject =
      redCount > 0
        ? `FinPulse: ${redCount} critical alert${redCount !== 1 ? 's' : ''} need attention`
        : `FinPulse: ${alerts.length} new alert${alerts.length !== 1 ? 's' : ''}`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FinPulse <alerts@notifications.finpulse.app>',
        to: emailTo,
        subject,
        html,
      }),
    })

    if (!resendRes.ok) {
      const text = await resendRes.text()
      throw new Error(`Resend API error (${resendRes.status}): ${text}`)
    }

    await supabase
      .from('fin_sync_log')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        rows_synced: alerts.length,
      })
      .eq('id', syncId)

    return new Response(
      JSON.stringify({ success: true, sent: true, alertCount: alerts.length }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase
      .from('fin_sync_log')
      .update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq('id', syncId)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})

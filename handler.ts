// ClawHub Local Skill - runs entirely in your agent, no API key required
// Batch Email Sender - Send transactional emails with template variables
// Note: Requires user-provided RESEND_API_KEY environment variable

function env(key: string): string {
  if (typeof process !== 'undefined' && process.env) return process.env[key] || '';
  return '';
}

async function sendEmail(to: string, subject: string, html: string, from: string, apiKey: string): Promise<{ id: string; success: boolean; error?: string }> {
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    if (!resp.ok) return { id: '', success: false, error: data.message || resp.statusText };
    return { id: data.id, success: true };
  } catch (e: any) {
    return { id: '', success: false, error: e.message };
  }
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  }
  return result;
}

export async function run(input: { recipients: Array<string | { email: string; [key: string]: string }>; subject: string; html_template: string; from?: string; variables?: Record<string, string> }) {
  if (!input.recipients || !Array.isArray(input.recipients) || input.recipients.length === 0) throw new Error('recipients array is required');
  if (!input.subject) throw new Error('subject is required');
  if (!input.html_template) throw new Error('html_template is required');
  if (input.recipients.length > 100) throw new Error('Max 100 recipients per batch');

  const resendKey = env('RESEND_API_KEY');
  if (!resendKey) throw new Error('RESEND_API_KEY environment variable is required. Get a free key at https://resend.com');

  const sender = input.from || 'noreply@claw0x.com';
  const startTime = Date.now();
  const results: Array<{ to: string; success: boolean; id?: string; error?: string }> = [];

  for (const recipient of input.recipients) {
    const to = typeof recipient === 'string' ? recipient : recipient.email;
    const vars = typeof recipient === 'object' ? { ...input.variables, ...recipient } : (input.variables || {});
    const html = applyTemplate(input.html_template, vars);
    const subjectFinal = applyTemplate(input.subject, vars);
    const result = await sendEmail(to, subjectFinal, html, sender, resendKey);
    results.push({ to, ...result });
  }

  const sent = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return {
    results, sent, failed, total: input.recipients.length,
    _meta: { skill: 'batch-email-sender', latency_ms: Date.now() - startTime },
  };
}

export default run;

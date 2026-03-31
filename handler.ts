import { VercelRequest, VercelResponse } from '@vercel/node';
import { authMiddleware } from '../../lib/auth';
import { successResponse, errorResponse } from '../../lib/response';

/**
 * Batch Email Sender
 * Send transactional emails using Resend API (free tier: 100 emails/day).
 * Supports template variables, HTML content, and batch sending.
 */

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

async function handler(req: VercelRequest, res: VercelResponse) {
  const { recipients, subject, html_template, from, variables } = req.body || {};
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) return errorResponse(res, 'recipients array is required', 400);
  if (!subject) return errorResponse(res, 'subject is required', 400);
  if (!html_template) return errorResponse(res, 'html_template is required', 400);
  if (recipients.length > 100) return errorResponse(res, 'Max 100 recipients per batch', 400);

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return errorResponse(res, 'RESEND_API_KEY not configured on server', 500);

  const sender = from || 'noreply@claw0x.com';
  const startTime = Date.now();
  const results: Array<{ to: string; success: boolean; id?: string; error?: string }> = [];

  for (const recipient of recipients) {
    const to = typeof recipient === 'string' ? recipient : recipient.email;
    const vars = typeof recipient === 'object' ? { ...variables, ...recipient } : (variables || {});
    const html = applyTemplate(html_template, vars);
    const subjectFinal = applyTemplate(subject, vars);
    const result = await sendEmail(to, subjectFinal, html, sender, resendKey);
    results.push({ to, ...result });
  }

  const sent = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return successResponse(res, {
    results, sent, failed, total: recipients.length,
    _meta: { skill: 'batch-email-sender', latency_ms: Date.now() - startTime },
  });
}

export default authMiddleware(handler);

// Every /api/* request on the hosted site: the feedback form, and the optional Google sign-in (server/auth.js).
import { handle as auth } from './auth.js';
import { feedback } from './feedback.js';

export function api(request, env, { EmailMessage } = {}) {
  const p = new URL(request.url).pathname.replace(/\/+$/, '');
  if (p === '/api/feedback') return feedback(request, env, EmailMessage);
  return auth(request, env);
}

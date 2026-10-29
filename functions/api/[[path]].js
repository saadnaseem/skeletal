// Every /api/* request on a Cloudflare Pages copy of the site goes to the same handlers as the Worker (server/api.js).
// The feedback form needs the Worker's send_email binding, so on Pages it answers "not set up".
import { api } from '../../server/api.js';
export const onRequest = ({ request, env }) => api(request, env);

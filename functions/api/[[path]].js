// Every /api/* request on the hosted site goes to the sign-in handler (server/auth.js).
import { handle } from '../../server/auth.js';
export const onRequest = ({ request, env }) => handle(request, env);

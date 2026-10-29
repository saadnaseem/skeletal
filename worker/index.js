// The lonepair.app Worker. Cloudflare serves site/ (the app, icons, privacy page) directly and runs this only for
// paths that aren't files there, i.e. /api/*: the feedback form and the optional sign-in.
import { EmailMessage } from 'cloudflare:email';
import { api } from '../server/api.js';

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return api(request, env, { EmailMessage });
    return env.ASSETS.fetch(request);
  },
};

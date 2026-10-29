import { newId } from './ids.js';

/** Default tracked services for a fresh install. All can be removed in the admin UI. */
export function seedServices() {
  const now = new Date().toISOString();
  const mk = (s, i) => ({
    id: newId(),
    enabled: true,
    owner: 'vendor',
    group: 'Vendors',
    description: '',
    order: i,
    createdAt: now,
    updatedAt: now,
    ...s,
  });
  return [
    {
      name: 'Google Workspace',
      provider: 'google',
      statusPageUrl: 'https://www.google.com/appsstatus/dashboard/',
      config: { feedUrl: 'https://www.google.com/appsstatus/dashboard/incidents.json', products: '' },
    },
    {
      name: 'Slack',
      provider: 'slack',
      statusPageUrl: 'https://slack-status.com/',
      config: {},
    },
    {
      name: 'Zoom',
      provider: 'statuspage',
      statusPageUrl: 'https://status.zoom.us/',
      config: { baseUrl: 'https://status.zoom.us', components: '' },
    },
    {
      name: 'Jamf',
      provider: 'statuspage',
      statusPageUrl: 'https://status.jamf.com/',
      config: { baseUrl: 'https://status.jamf.com', components: '' },
    },
  ].map(mk);
}

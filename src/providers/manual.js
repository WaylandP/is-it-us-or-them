import { result } from './util.js';
import { STATES, STATE_LABELS } from '../states.js';

export default {
  id: 'manual',
  label: 'Manual (set the status yourself)',
  description:
    'No feed. The IT team sets the state by hand, from the admin page or the API. Useful for printers, Wi-Fi, badge readers, phones, and other things nothing monitors for you.',
  defaultOwner: 'internal',
  fields: [
    {
      key: 'state',
      label: 'Current state',
      type: 'select',
      options: STATES.filter((s) => s !== 'unknown').map((s) => ({ value: s, label: STATE_LABELS[s] })),
      required: true,
    },
    { key: 'message', label: 'Message', type: 'text', placeholder: 'e.g. 3rd floor printers offline, vendor on site' },
  ],

  async check(service) {
    const state = STATES.includes(service.config?.state) ? service.config.state : 'operational';
    const message = service.config?.message || '';
    const incidents =
      state === 'operational' || !message
        ? []
        : [
            {
              id: 'manual',
              title: message,
              status: 'manual',
              impact: state === 'maintenance' ? 'maintenance' : state === 'degraded' ? 'minor' : 'critical',
              url: service.statusPageUrl || '',
              startedAt: service.updatedAt || null,
              updatedAt: service.updatedAt || null,
              latestUpdate: '',
              components: [],
            },
          ];
    return result({ state, summary: message || STATE_LABELS[state], incidents });
  },
};

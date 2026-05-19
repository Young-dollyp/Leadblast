/**
 * campaignRunner.js
 * Orchestrates parallel Playwright workers for the campaign
 */

import pLimit from 'p-limit';
import { processLead } from './leadProcessor.js';

export async function campaignRunner(campaignId, campaigns, emitter) {
  const campaign = campaigns.get(campaignId);
  const { leads, config } = campaign;
  const { columnMap, senderDetails, messageTemplate, concurrency } = config;

  const limit = pLimit(Math.max(1, Math.min(concurrency, 5))); // cap at 5 parallel
  let completed = 0;

  emitter.emit('log', {
    type: 'info',
    message: `Campaign started — ${leads.length} leads, concurrency: ${concurrency}`,
  });

  const tasks = leads.map((row, index) =>
    limit(async () => {
      if (campaign.stopRequested) {
        return null;
      }

      const company = columnMap.company ? row[columnMap.company] : `Lead ${index + 1}`;
      const url     = columnMap.website ? row[columnMap.website] : '';
      const contact = columnMap.contact ? row[columnMap.contact] : '';
      const email   = columnMap.email   ? row[columnMap.email]   : '';
      const phone   = columnMap.phone   ? row[columnMap.phone]   : '';

      emitter.emit('log', {
        type: 'info',
        message: `[${index + 1}/${leads.length}] Starting: ${company}`,
        index,
      });

      const result = await processLead({
        index,
        company,
        url,
        contact,
        email,
        phone,
        senderDetails,
        messageTemplate,
        emitter,
      });

      // Store result
      campaign.results.push(result);
      emitter.emit('result', result);

      completed++;
      const pct = Math.round((completed / leads.length) * 100);
      emitter.emit('log', {
        type: result.status === 'success' ? 'success' : result.status === 'noform' ? 'warn' : 'error',
        message: `[${index + 1}/${leads.length}] ${company}: ${result.note} (${pct}% done)`,
        index,
        progress: pct,
      });

      return result;
    })
  );

  await Promise.all(tasks);

  campaign.status     = campaign.stopRequested ? 'stopped' : 'done';
  campaign.finishedAt = new Date().toISOString();

  const success = campaign.results.filter(r => r.status === 'success').length;
  const failed  = campaign.results.filter(r => r.status !== 'success').length;

  emitter.emit('log', {
    type: 'info',
    message: `Campaign complete — ✓ ${success} submitted, ✗ ${failed} failed/skipped`,
  });

  emitter.emit('done', {
    total:      campaign.results.length,
    success,
    failed,
    finishedAt: campaign.finishedAt,
  });
}

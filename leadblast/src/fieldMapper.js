/**
 * fieldMapper.js
 * Intelligently maps detected form fields to sender data using
 * keyword scoring across label, name, placeholder, and type.
 */

// Scoring rules: { pattern, fillKey, score }
// fillKey references a key from the resolved senderData object
const RULES = [
  // Name fields
  { pattern: /^(full.?name|your.?name|name)$/i,          fillKey: 'senderName',    score: 10 },
  { pattern: /first.?name|firstname/i,                    fillKey: 'senderFirst',   score: 9  },
  { pattern: /last.?name|lastname|surname/i,              fillKey: 'senderLast',    score: 9  },
  { pattern: /name/i,                                     fillKey: 'senderName',    score: 5  },
  // Email
  { pattern: /e.?mail/i,                                  fillKey: 'senderEmail',   score: 10 },
  // Phone
  { pattern: /phone|mobile|tel|cell/i,                    fillKey: 'senderPhone',   score: 10 },
  // Company / organisation
  { pattern: /company|organisation|organization|firm|business/i, fillKey: 'senderCompany', score: 10 },
  // Website
  { pattern: /website|url|your.?site|your.?web/i,         fillKey: 'senderWebsite', score: 10 },
  // Subject / heading
  { pattern: /subject|title|heading|re:/i,                fillKey: 'subject',       score: 10 },
  // Service / interest / product
  { pattern: /service|product|interest|offer|looking.?for/i, fillKey: 'senderService', score: 8 },
  // Message / body — catch-all at low priority
  { pattern: /message|body|comment|description|detail|inquiry|enquir|question|how.can.we.help|tell.us/i,
    fillKey: 'message', score: 10 },
  // Textarea is almost always the message field
  { pattern: /.*/,  fillKey: 'message', score: 1, typeOnly: 'textarea' },
];

/**
 * @param {Array}  fields          - detected form fields from formDetector
 * @param {Object} options
 * @param {Object} options.senderDetails
 * @param {Object} options.messageTemplate
 * @param {string} options.company  - the target company's name (for {company} substitution)
 * @returns {Array} [{ field, value }]
 */
export function buildFieldValues(fields, { senderDetails, messageTemplate, company }) {
  const sd = senderDetails || {};

  // Expand sender first/last name from full name
  const nameParts = (sd.name || '').trim().split(/\s+/);

  // Build the substituted message and subject
  const sub = str => (str || '').replace(/\{company\}/gi, company || '');

  const senderData = {
    senderName:    sd.name    || '',
    senderFirst:   nameParts[0] || sd.name || '',
    senderLast:    nameParts.slice(1).join(' ') || '',
    senderEmail:   sd.email   || '',
    senderPhone:   sd.phone   || '',
    senderCompany: sd.company || '',
    senderWebsite: sd.website || '',
    senderService: sd.service || '',
    subject:       sub(messageTemplate?.subject || `Exciting Opportunity for ${company}`),
    message:       sub(messageTemplate?.body    || `Hi,\n\nI'm reaching out to explore how we might work together.\n\nBest regards,\n${sd.name}`),
  };

  const results = [];

  for (const field of fields) {
    const candidate = `${field.label} ${field.name} ${field.placeholder} ${field.id}`.toLowerCase();
    let bestScore = -1;
    let bestKey   = null;

    for (const rule of RULES) {
      if (rule.typeOnly && field.type !== rule.typeOnly) continue;
      if (rule.pattern.test(candidate)) {
        if (rule.score > bestScore) {
          bestScore = rule.score;
          bestKey   = rule.fillKey;
        }
      }
    }

    if (bestKey && senderData[bestKey]) {
      results.push({ field, value: senderData[bestKey] });
    }
  }

  return results;
}

/**
 * formDetector.js
 * Scans a page for contact forms and extracts structured field information.
 * Works with static forms, React/Vue/Angular-rendered forms, and iframes.
 */

export async function detectFormFields(page) {
  // Try main document first, then iframes
  let result = await scanForForm(page);
  if (result.hasForm) return result;

  // Check iframes (some sites embed Typeform, HubSpot, Gravity Forms, etc.)
  const frames = page.frames();
  for (const frame of frames.slice(1)) { // skip main frame
    try {
      result = await scanForForm(frame);
      if (result.hasForm) return result;
    } catch { /* cross-origin frame, skip */ }
  }

  return { hasForm: false, fields: [], submitSelector: null };
}

async function scanForForm(context) {
  try {
    const data = await context.evaluate(() => {
      // ── Find the best form ───────────────────────────────────
      const forms = Array.from(document.querySelectorAll('form'));

      // Score each form (more fields + visible = better)
      function scoreForm(form) {
        const inputs = form.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=checkbox]):not([type=radio]), textarea, select');
        const style  = window.getComputedStyle(form);
        const rect   = form.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden') return -1;
        if (rect.width === 0 && rect.height === 0) return 0;
        return inputs.length;
      }

      let bestForm = null;
      let bestScore = 0;
      for (const f of forms) {
        const s = scoreForm(f);
        if (s > bestScore) { bestScore = s; bestForm = f; }
      }

      if (!bestForm || bestScore === 0) return null;

      // ── Extract field metadata ───────────────────────────────
      function getLabel(el) {
        // 1. aria-label
        if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
        // 2. <label for="...">
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          if (lbl) return lbl.innerText.trim();
        }
        // 3. Wrapping label
        const wrapping = el.closest('label');
        if (wrapping) {
          const text = wrapping.innerText.replace(el.value || '', '').trim();
          if (text) return text;
        }
        // 4. Preceding sibling text / label
        let prev = el.previousElementSibling;
        while (prev) {
          const t = prev.innerText?.trim();
          if (t && t.length < 80) return t;
          prev = prev.previousElementSibling;
        }
        // 5. placeholder
        if (el.placeholder) return el.placeholder.trim();
        // 6. name attribute
        if (el.name) return el.name.replace(/[-_]/g, ' ');
        return el.type || 'field';
      }

      function uniqueSelector(el) {
        if (el.id) return `#${CSS.escape(el.id)}`;
        if (el.name) return `[name="${el.name}"]`;
        // Build a path
        const parts = [];
        let cur = el;
        while (cur && cur !== document.body) {
          let seg = cur.tagName.toLowerCase();
          if (cur.id) { seg += '#' + CSS.escape(cur.id); parts.unshift(seg); break; }
          const siblings = Array.from(cur.parentNode?.children || []).filter(c => c.tagName === cur.tagName);
          if (siblings.length > 1) seg += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
          parts.unshift(seg);
          cur = cur.parentElement;
        }
        return parts.join(' > ');
      }

      const fieldEls = Array.from(bestForm.querySelectorAll(
        'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=checkbox]):not([type=radio]), textarea, select'
      )).filter(el => {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden';
      });

      const fields = fieldEls.map(el => ({
        selector: uniqueSelector(el),
        type:     el.tagName.toLowerCase() === 'textarea' ? 'textarea'
                : el.tagName.toLowerCase() === 'select'   ? 'select'
                : (el.getAttribute('type') || 'text').toLowerCase(),
        name:     el.name  || '',
        id:       el.id    || '',
        label:    getLabel(el),
        required: el.required,
        placeholder: el.placeholder || '',
      }));

      // ── Find submit button ───────────────────────────────────
      const submitCandidates = [
        ...Array.from(bestForm.querySelectorAll('button[type=submit], input[type=submit]')),
        ...Array.from(bestForm.querySelectorAll('button')).filter(b =>
          /send|submit|go|contact|enquire|reach|message|get in touch/i.test(b.innerText)
        ),
      ];
      const submitBtn = submitCandidates[0];

      return {
        fields,
        submitSelector: submitBtn ? uniqueSelector(submitBtn) : null,
        formSelector:   uniqueSelector(bestForm),
      };
    });

    if (!data || !data.fields.length) return { hasForm: false, fields: [], submitSelector: null };

    return {
      hasForm: true,
      fields:  data.fields,
      submitSelector: data.submitSelector,
      formSelector:   data.formSelector,
    };
  } catch {
    return { hasForm: false, fields: [], submitSelector: null };
  }
}

function asString(value, { min = 0, max = 500, trim = true } = {}) {
  const clean = trim ? String(value || '').trim() : String(value || '');
  if (clean.length < min) return null;
  return clean.slice(0, max);
}

function asInt(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function asMoney(value, { min = 0.01, max = 1000000 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return Number(parsed.toFixed(2));
}

function validateBody(schema) {
  return (req, res, next) => {
    const source = req.body || {};
    const body = {};
    const errors = [];

    for (const [field, rule] of Object.entries(schema)) {
      const raw = source[field];
      const required = !!rule.required;
      if ((raw === undefined || raw === null || raw === '') && !required) {
        if (rule.default !== undefined) body[field] = rule.default;
        continue;
      }

      let value = null;
      if (rule.type === 'string') value = asString(raw, rule);
      if (rule.type === 'int') value = asInt(raw, rule);
      if (rule.type === 'money') value = asMoney(raw, rule);
      if (rule.type === 'boolean') value = !!raw;
      if (rule.type === 'enum') {
        const clean = String(raw || '').trim();
        value = rule.values.includes(clean) ? clean : null;
      }
      if (rule.type === 'array') {
        value = Array.isArray(raw) ? raw.slice(0, rule.maxItems || 20) : null;
      }

      if (value === null || value === undefined) {
        errors.push(field);
      } else {
        body[field] = value;
      }
    }

    if (errors.length) {
      return res.status(400).json({
        error: `Invalid request fields: ${errors.join(', ')}`,
        code: 'VALIDATION_ERROR',
        fields: errors
      });
    }

    req.body = { ...source, ...body };
    return next();
  };
}

module.exports = {
  asInt,
  asMoney,
  asString,
  validateBody
};

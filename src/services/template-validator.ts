const COMMENT_FIELD = {
  key: 'comment',
  type: 'text',
  label: '备注',
  system: true,
  required: false,
  multiline: true,
  max_length: 500,
};

const VALID_TYPES = ['number', 'select', 'text', 'boolean', 'date', 'array'];
const DEFAULT_MAX_ITEMS = 200;
const HARD_MAX_ITEMS = 1000;
const MAX_DEPTH = 3;

function normalizeFields(fieldsSchema: any): any[] {
  return Array.isArray(fieldsSchema)
    ? fieldsSchema
    : (fieldsSchema?.fields ?? []);
}

/**
 * Normalize fields_schema to {"fields": [...]} format and inject the
 * system `comment` field. Accepts either a flat array or {"fields": [...]}.
 */
export function injectDefaultField(fieldsSchema: any): any {
  const fields = normalizeFields(fieldsSchema);
  return { fields: [...fields, COMMENT_FIELD] };
}

/**
 * Validate fields_schema structure recursively.
 * Accepts either a flat array or {"fields": [...]}.
 * Returns { ok, error }.
 */
export function validateFieldsSchema(
  fieldsSchema: any,
  depth: number = 0,
  maxDepth: number = MAX_DEPTH,
): { ok: boolean; error?: string } {
  const fields = normalizeFields(fieldsSchema);

  if (!Array.isArray(fields)) {
    return { ok: false, error: 'fields_schema must be an array' };
  }

  for (const field of fields) {
    if (!field.key) {
      return { ok: false, error: 'each field must contain key' };
    }
    if (field.key === 'comment') {
      return { ok: false, error: 'comment is a reserved field' };
    }
    if (!field.type) {
      return { ok: false, error: `field ${field.key} must contain type` };
    }
    if (!VALID_TYPES.includes(field.type)) {
      return { ok: false, error: `field ${field.key} has invalid type: ${field.type}` };
    }

    if (field.type === 'array') {
      if (!Array.isArray(field.item_fields)) {
        return { ok: false, error: `field ${field.key}: item_fields must be an array` };
      }
      if (typeof field.min_items === 'number' && field.min_items < 0) {
        return { ok: false, error: `field ${field.key}: min_items must be >= 0` };
      }
      if (typeof field.max_items === 'number' && field.max_items <= 0) {
        return { ok: false, error: `field ${field.key}: max_items must be > 0` };
      }
      if (
        typeof field.min_items === 'number' &&
        typeof field.max_items === 'number' &&
        field.min_items > field.max_items
      ) {
        return { ok: false, error: `field ${field.key}: min_items cannot exceed max_items` };
      }
      if (depth >= maxDepth) {
        return { ok: false, error: `field ${field.key}: exceed max nesting depth` };
      }
      const result = validateFieldsSchema(field.item_fields, depth + 1, maxDepth);
      if (!result.ok) {
        return result;
      }
    }
  }

  return { ok: true };
}

/**
 * Validate payload against fields_schema recursively. Errors carry full
 * paths (e.g. "exercises[0].sets[1].weight_kg: must be a number").
 * Accepts schema as flat array or {"fields": [...]}.
 */
export function validatePayload(
  fieldsSchema: any,
  payload: Record<string, any>,
  pathPrefix: string = '',
): { ok: boolean; errors: string[] } {
  const fields = normalizeFields(fieldsSchema);
  const errors: string[] = [];

  const knownKeys = new Set(fields.map((f: any) => f.key ?? f.name));

  for (const key of Object.keys(payload)) {
    if (!knownKeys.has(key)) {
      const prefix = pathPrefix ? `${pathPrefix}.` : '';
      errors.push(`${prefix}${key}: unknown field`);
    }
  }

  for (const field of fields) {
    const key = field.key ?? field.name;
    const { type, required } = field;
    const value = payload[key];
    const absent = value === undefined || value === null || value === '';
    const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (type === 'array') {
      if (required && (absent || (Array.isArray(value) && value.length === 0))) {
        errors.push(`${fieldPath}: is required`);
        continue;
      }
      if (absent) continue;

      if (!Array.isArray(value)) {
        errors.push(`${fieldPath}: must be an array`);
        continue;
      }

      const maxItems = Math.min(
        field.max_items ?? DEFAULT_MAX_ITEMS,
        HARD_MAX_ITEMS,
      );

      if (typeof field.min_items === 'number' && value.length < field.min_items) {
        errors.push(`${fieldPath}: at least ${field.min_items} items`);
      }
      if (value.length > maxItems) {
        errors.push(`${fieldPath}: at most ${maxItems} items`);
      }

      for (let i = 0; i < Math.min(value.length, maxItems); i++) {
        const elementPath = `${fieldPath}[${i}]`;
        const elemResult = validatePayload(field.item_fields, value[i], elementPath);
        if (!elemResult.ok) {
          errors.push(...elemResult.errors);
        }
      }
      continue;
    }

    // Non-array types
    if (required && absent) {
      errors.push(`${fieldPath}: is required`);
      continue;
    }
    if (absent) continue;

    switch (type) {
      case 'number':
        if (typeof value !== 'number') errors.push(`${fieldPath}: must be a number`);
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`${fieldPath}: must be a boolean`);
        break;
      case 'select':
        if (!Array.isArray(field.options) || !field.options.includes(value)) {
          errors.push(`${fieldPath}: value not in options`);
        }
        break;
      case 'text':
      case 'date':
        if (typeof value !== 'string') errors.push(`${fieldPath}: must be a string`);
        break;
      default:
        // array handled above
        break;
    }
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}

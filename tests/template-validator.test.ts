import { validateFieldsSchema, validatePayload } from '../src/services/template-validator.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fitnessSchema = {
  fields: [
    {
      key: 'exercises',
      type: 'array',
      label: '动作',
      required: true,
      min_items: 1,
      item_fields: [
        { key: 'name', type: 'text', label: '动作名', required: true },
        { key: 'equipment', type: 'select', options: ['哑铃', '杠铃', '固定器械', '自重', '其他'] },
        {
          key: 'sets',
          type: 'array',
          label: '组',
          required: true,
          min_items: 1,
          item_fields: [
            { key: 'weight_kg', type: 'number', label: '重量(kg)' },
            { key: 'reps', type: 'number', label: '次数', required: true },
            { key: 'rpe', type: 'number', label: 'RPE', required: false },
          ],
        },
      ],
    },
  ],
};

// ─── V1–V4: validateFieldsSchema ──────────────────────────────────────────────

describe('validateFieldsSchema', () => {
  it('V1: array type missing item_fields → fails', () => {
    const result = validateFieldsSchema([{ key: 'x', type: 'array' }]);
    expect(result.ok).toBe(false);
  });

  it('V2: array nested 4 levels → fails "exceed max nesting depth"', () => {
    const schema = [
      {
        key: 'l1',
        type: 'array',
        item_fields: [
          {
            key: 'l2',
            type: 'array',
            item_fields: [
              {
                key: 'l3',
                type: 'array',
                item_fields: [
                  {
                    key: 'l4',
                    type: 'array',
                    item_fields: [{ key: 'leaf', type: 'text' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    const result = validateFieldsSchema(schema);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('exceed max nesting depth');
  });

  it('V3: array nested 3 levels (legal) → passes', () => {
    const schema = [
      {
        key: 'l1',
        type: 'array',
        item_fields: [
          {
            key: 'l2',
            type: 'array',
            item_fields: [
              {
                key: 'l3',
                type: 'array',
                item_fields: [{ key: 'leaf', type: 'text' }],
              },
            ],
          },
        ],
      },
    ];
    const result = validateFieldsSchema(schema);
    expect(result.ok).toBe(true);
  });

  it('V4: item_fields with key=comment → fails reserved field', () => {
    const schema = [
      {
        key: 'x',
        type: 'array',
        item_fields: [{ key: 'comment', type: 'text' }],
      },
    ];
    const result = validateFieldsSchema(schema);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('reserved field');
  });
});

// ─── V5–V12: validatePayload ──────────────────────────────────────────────────

describe('validatePayload', () => {
  it('V5: array required=true but payload missing the field', () => {
    const schema = [
      { key: 'exercises', type: 'array', required: true, item_fields: [{ key: 'a', type: 'text' }] },
    ];
    const result = validatePayload(schema, {});
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('exercises: is required');
  });

  it('V6: array required=true but payload gives empty array', () => {
    const schema = [
      { key: 'exercises', type: 'array', required: true, item_fields: [{ key: 'a', type: 'text' }] },
    ];
    const result = validatePayload(schema, { exercises: [] });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('exercises: is required');
  });

  it('V7: array has fewer elements than min_items', () => {
    const schema = [
      { key: 'exercises', type: 'array', required: true, min_items: 3, item_fields: [{ key: 'a', type: 'text' }] },
    ];
    const result = validatePayload(schema, { exercises: [{ a: 'x' }] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('at least 3 items'))).toBe(true);
  });

  it('V8: array has more elements than max_items', () => {
    const schema = [
      { key: 'exercises', type: 'array', max_items: 2, item_fields: [{ key: 'a', type: 'text' }] },
    ];
    const result = validatePayload(schema, { exercises: [{ a: '1' }, { a: '2' }, { a: '3' }] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('at most 2 items'))).toBe(true);
  });

  it('V9: number field in element receives string → path error with element index', () => {
    const result = validatePayload(fitnessSchema, {
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight_kg: 20, reps: 10 },
            { weight_kg: 'not-a-number', reps: 10 },
          ],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('exercises[0].sets[1].weight_kg: must be a number'))).toBe(true);
  });

  it('V10: element has undeclared key → "exercises[0].foo: unknown field"', () => {
    const result = validatePayload(fitnessSchema, {
      exercises: [{ name: 'Push ups', foo: 'unknown' }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('exercises[0].foo: unknown field'))).toBe(true);
  });

  it('V11: full fitness payload from design doc → passes', () => {
    const result = validatePayload(fitnessSchema, {
      exercises: [
        {
          name: '哑铃卧推',
          equipment: '哑铃',
          sets: [
            { weight_kg: 20, reps: 12 },
            { weight_kg: 22.5, reps: 10 },
            { weight_kg: 25, reps: 8 },
          ],
        },
        {
          name: '上斜卧推',
          equipment: '杠铃',
          sets: [
            { weight_kg: 40, reps: 10 },
            { weight_kg: 50, reps: 8 },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('V12: old flat template (pre-1.9) → passes (backward compatible)', () => {
    const schema = [
      { key: 'distance', type: 'number', required: true },
      { key: 'feeling', type: 'select', required: false, options: ['good', 'ok', 'bad'] },
      { key: 'note', type: 'text', required: false },
    ];
    const result = validatePayload(schema, { distance: 5.5, feeling: 'good' });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

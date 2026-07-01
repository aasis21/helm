import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { ElicitationRequest } from '@aasis21/helm-shared';

type FieldValue = string | number | boolean | string[];

interface Option {
  value: string;
  label: string;
}

type Field =
  | { name: string; title: string; description?: string; required: boolean; control: 'text'; format?: string; minLength?: number; maxLength?: number; default: string }
  | { name: string; title: string; description?: string; required: boolean; control: 'number'; integer: boolean; min?: number; max?: number; default: string }
  | { name: string; title: string; description?: string; required: boolean; control: 'boolean'; default: boolean }
  | { name: string; title: string; description?: string; required: boolean; control: 'select'; options: Option[]; default: string }
  | { name: string; title: string; description?: string; required: boolean; control: 'multiselect'; options: Option[]; minItems?: number; maxItems?: number; default: string[] };

interface ElicitationCardProps {
  req: ElicitationRequest;
  error?: string;
  onSubmit(content: Record<string, FieldValue>): void;
  onDecline(): void;
  onCancel(): void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function titleFor(name: string, schema: Record<string, unknown>): string {
  const t = schema.title;
  if (typeof t === 'string' && t.trim()) return t.trim();
  // Fall back to a humanized field name: snake/camel -> spaced, capitalized.
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Extract {value,label} options from enum(+enumNames) or oneOf/anyOf [{const,title}]. */
function optionsFrom(schema: Record<string, unknown>): Option[] {
  if (Array.isArray(schema.enum)) {
    const names = Array.isArray(schema.enumNames) ? (schema.enumNames as unknown[]) : [];
    return (schema.enum as unknown[]).map((v, i) => ({
      value: String(v),
      label: typeof names[i] === 'string' ? (names[i] as string) : String(v),
    }));
  }
  const variants = (Array.isArray(schema.oneOf) && schema.oneOf) || (Array.isArray(schema.anyOf) && schema.anyOf) || null;
  if (variants) {
    return (variants as unknown[])
      .map((v) => asRecord(v))
      .filter((v) => v.const != null)
      .map((v) => ({ value: String(v.const), label: typeof v.title === 'string' ? v.title : String(v.const) }));
  }
  return [];
}

function parseField(name: string, raw: unknown, required: boolean): Field {
  const schema = asRecord(raw);
  const title = titleFor(name, schema);
  const description = typeof schema.description === 'string' ? schema.description : undefined;
  const base = { name, title, description, required };

  if (schema.type === 'boolean') {
    return { ...base, control: 'boolean', default: schema.default === true };
  }
  if (schema.type === 'array') {
    const items = asRecord(schema.items);
    const options = optionsFrom(items);
    const def = Array.isArray(schema.default) ? (schema.default as unknown[]).map(String) : [];
    return {
      ...base,
      control: 'multiselect',
      options,
      minItems: typeof schema.minItems === 'number' ? schema.minItems : undefined,
      maxItems: typeof schema.maxItems === 'number' ? schema.maxItems : undefined,
      default: def,
    };
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    return {
      ...base,
      control: 'number',
      integer: schema.type === 'integer',
      min: typeof schema.minimum === 'number' ? schema.minimum : undefined,
      max: typeof schema.maximum === 'number' ? schema.maximum : undefined,
      default: schema.default != null ? String(schema.default) : '',
    };
  }
  // string (or unspecified): a select when enumerated, else free text.
  const options = optionsFrom(schema);
  if (options.length > 0) {
    return { ...base, control: 'select', options, default: schema.default != null ? String(schema.default) : '' };
  }
  return {
    ...base,
    control: 'text',
    format: typeof schema.format === 'string' ? schema.format : undefined,
    minLength: typeof schema.minLength === 'number' ? schema.minLength : undefined,
    maxLength: typeof schema.maxLength === 'number' ? schema.maxLength : undefined,
    default: typeof schema.default === 'string' ? schema.default : '',
  };
}

function useFields(req: ElicitationRequest): Field[] {
  return useMemo(() => {
    const props = asRecord(req.requestedSchema?.properties);
    const required = new Set(req.requestedSchema?.required ?? []);
    return Object.keys(props).map((name) => parseField(name, props[name], required.has(name)));
  }, [req]);
}

function initialValues(fields: Field[]): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const f of fields) out[f.name] = f.control === 'boolean' || f.control === 'multiselect' ? f.default : f.default;
  return out;
}

const HTML_INPUT_TYPE: Record<string, string> = {
  email: 'email',
  uri: 'url',
  date: 'date',
  'date-time': 'datetime-local',
};

/**
 * Renders an `ask_user` elicitation as an answerable form: it maps the request's JSON Schema
 * to native inputs (enum -> select, boolean -> toggle, array -> multi-select, number -> number,
 * string -> text honoring `format`), validates required fields, and reports the answer as
 * accept (with content), decline, or cancel — mirroring the terminal's ask_user choices.
 */
export function ElicitationCard({ req, error, onSubmit, onDecline, onCancel }: ElicitationCardProps): JSX.Element {
  const fields = useFields(req);
  const [values, setValues] = useState<Record<string, FieldValue>>(() => initialValues(fields));
  const [touched, setTouched] = useState(false);

  const setValue = (name: string, value: FieldValue): void =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const missing = useMemo(
    () =>
      fields
        .filter((f) => {
          if (!f.required) return false;
          const v = values[f.name];
          if (f.control === 'multiselect') return !Array.isArray(v) || v.length === 0;
          if (f.control === 'boolean') return false; // a boolean is always answered (false is valid)
          return v == null || String(v).trim() === '';
        })
        .map((f) => f.name),
    [fields, values],
  );

  const isUrlMode = req.mode === 'url';

  const submit = (): void => {
    if (missing.length > 0) {
      setTouched(true);
      return;
    }
    const content: Record<string, FieldValue> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.control === 'number') {
        if (String(v).trim() === '') continue;
        const num = f.integer ? Number.parseInt(String(v), 10) : Number(v);
        if (Number.isFinite(num)) content[f.name] = num;
      } else if (f.control === 'boolean') {
        content[f.name] = Boolean(v);
      } else if (f.control === 'multiselect') {
        content[f.name] = Array.isArray(v) ? v : [];
      } else {
        if (String(v).trim() === '' && !f.required) continue;
        content[f.name] = String(v);
      }
    }
    onSubmit(content);
  };

  return (
    <div className="elicit-card" role="group" aria-label={`Copilot asks: ${req.message}`}>
      <div className="elicit-head">
        <span className="elicit-icon" aria-hidden="true">?</span>
        <p className="elicit-message">{req.message || 'Copilot needs your input.'}</p>
      </div>

      {isUrlMode ? (
        <p className="elicit-url-note">
          This step opens a page on your computer{req.url ? ':' : '.'}
          {req.url ? <code className="elicit-url">{req.url}</code> : null}
        </p>
      ) : (
        <div className="elicit-fields">
          {fields.map((f) => {
            const showError = touched && f.required && missing.includes(f.name);
            const fieldId = `elicit-${req.requestId}-${f.name}`;
            return (
              <div key={f.name} className={`elicit-field${showError ? ' invalid' : ''}`}>
                <label className="elicit-label" htmlFor={fieldId}>
                  {f.title}
                  {f.required ? <span className="elicit-req" aria-hidden="true"> *</span> : null}
                </label>
                {f.description ? <p className="elicit-desc">{f.description}</p> : null}

                {f.control === 'text' ? (
                  <input
                    id={fieldId}
                    className="elicit-input"
                    type={f.format ? HTML_INPUT_TYPE[f.format] ?? 'text' : 'text'}
                    value={String(values[f.name] ?? '')}
                    maxLength={f.maxLength}
                    minLength={f.minLength}
                    onChange={(e) => setValue(f.name, e.target.value)}
                  />
                ) : null}

                {f.control === 'number' ? (
                  <input
                    id={fieldId}
                    className="elicit-input"
                    type="number"
                    inputMode={f.integer ? 'numeric' : 'decimal'}
                    value={String(values[f.name] ?? '')}
                    min={f.min}
                    max={f.max}
                    step={f.integer ? 1 : 'any'}
                    onChange={(e) => setValue(f.name, e.target.value)}
                  />
                ) : null}

                {f.control === 'boolean' ? (
                  <label className="elicit-toggle">
                    <input
                      id={fieldId}
                      type="checkbox"
                      checked={Boolean(values[f.name])}
                      onChange={(e) => setValue(f.name, e.target.checked)}
                    />
                    <span>{Boolean(values[f.name]) ? 'Yes' : 'No'}</span>
                  </label>
                ) : null}

                {f.control === 'select' ? (
                  <select
                    id={fieldId}
                    className="elicit-input"
                    value={String(values[f.name] ?? '')}
                    onChange={(e) => setValue(f.name, e.target.value)}
                  >
                    <option value="" disabled={f.required}>
                      {f.required ? 'Select…' : '— none —'}
                    </option>
                    {f.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : null}

                {f.control === 'multiselect' ? (
                  <div className="elicit-checks" role="group" aria-labelledby={fieldId}>
                    {f.options.map((opt) => {
                      const selected = Array.isArray(values[f.name]) && (values[f.name] as string[]).includes(opt.value);
                      return (
                        <label key={opt.value} className={`elicit-check${selected ? ' on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              const cur = Array.isArray(values[f.name]) ? (values[f.name] as string[]) : [];
                              setValue(
                                f.name,
                                e.target.checked ? [...cur, opt.value] : cur.filter((v) => v !== opt.value),
                              );
                            }}
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {touched && missing.length > 0 ? (
        <p className="elicit-error" role="alert">
          ⚠ Please fill in the required field{missing.length > 1 ? 's' : ''}.
        </p>
      ) : null}
      {error ? (
        <p className="elicit-error" role="alert">
          ⚠ {error}
        </p>
      ) : null}

      <div className="elicit-actions">
        {isUrlMode ? null : (
          <button type="button" className="elicit-btn submit" onClick={submit}>
            <span className="elicit-btn-icon" aria-hidden="true">✓</span>
            Submit
          </button>
        )}
        <button type="button" className="elicit-btn decline" onClick={onDecline}>
          Decline
        </button>
        <button type="button" className="elicit-btn cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

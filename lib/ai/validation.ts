import Ajv, { ErrorObject } from 'ajv';

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  allowUnionTypes: true,
});

const compiled = new Map<string, ReturnType<Ajv['compile']>>();

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: ErrorObject[] };

export function validateSchema<T>(schemaId: string, schema: object, candidate: unknown): ValidationResult<T> {
  const key = schemaId;
  let validator = compiled.get(key);

  if (!validator) {
    validator = ajv.compile(schema);
    compiled.set(key, validator);
  }

  const valid = validator(candidate);
  if (!valid) {
    return {
      ok: false,
      errors: validator.errors ?? [],
    };
  }

  return {
    ok: true,
    data: candidate as T,
  };
}

export function formatAjvErrors(errors: ErrorObject[]): string {
  if (!errors.length) {
    return 'Schema validation failed with no detailed errors.';
  }

  return errors
    .map((error) => {
      const path = error.instancePath || '/';
      return `${path} ${error.message ?? 'validation error'}`.trim();
    })
    .join('; ');
}

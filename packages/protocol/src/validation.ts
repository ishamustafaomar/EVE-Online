/**
 * Minimal runtime validation combinators. Strict by default: unknown object
 * fields are rejected (doc 12 §3). Zero dependencies; the same validators run
 * in the gateway and (for server messages) in the client SDK.
 */

export class ValidationError extends Error {
  constructor(path: string, expected: string, got: unknown) {
    super(`${path}: expected ${expected}, got ${describe(got)}`);
    this.name = 'ValidationError';
  }
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array(${v.length})`;
  return typeof v;
}

export type Check<T> = (value: unknown, path: string) => T;

export const vString = (opts: { min?: number; max?: number } = {}): Check<string> =>
  (value, path) => {
    if (typeof value !== 'string') throw new ValidationError(path, 'string', value);
    const min = opts.min ?? 0;
    const max = opts.max ?? 4096;
    if (value.length < min || value.length > max) {
      throw new ValidationError(path, `string length in [${min}, ${max}]`, value.length);
    }
    return value;
  };

export const vNumber = (opts: { min?: number; max?: number } = {}): Check<number> =>
  (value, path) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError(path, 'finite number', value);
    }
    if (opts.min !== undefined && value < opts.min) throw new ValidationError(path, `>= ${opts.min}`, value);
    if (opts.max !== undefined && value > opts.max) throw new ValidationError(path, `<= ${opts.max}`, value);
    return value;
  };

export const vInt = (opts: { min?: number; max?: number } = {}): Check<number> =>
  (value, path) => {
    const n = vNumber(opts)(value, path);
    if (!Number.isInteger(n)) throw new ValidationError(path, 'integer', value);
    return n;
  };

export const vBool: Check<boolean> = (value, path) => {
  if (typeof value !== 'boolean') throw new ValidationError(path, 'boolean', value);
  return value;
};

export const vEnum = <T extends string>(...values: readonly T[]): Check<T> =>
  (value, path) => {
    if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
      throw new ValidationError(path, `one of [${values.join(', ')}]`, value);
    }
    return value as T;
  };

export interface Vec3Json {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Simulation-space coordinates: bounded to ±1e13 m (system-local sanity cap). */
export const vVec3: Check<Vec3Json> = (value, path) => {
  const obj = asObject(value, path);
  assertNoExtraKeys(obj, ['x', 'y', 'z'], path);
  const bound = { min: -1e13, max: 1e13 };
  return {
    x: vNumber(bound)(obj['x'], `${path}.x`),
    y: vNumber(bound)(obj['y'], `${path}.y`),
    z: vNumber(bound)(obj['z'], `${path}.z`),
  };
};

export const vArray = <T>(item: Check<T>, opts: { max?: number } = {}): Check<T[]> =>
  (value, path) => {
    if (!Array.isArray(value)) throw new ValidationError(path, 'array', value);
    const max = opts.max ?? 1024;
    if (value.length > max) throw new ValidationError(path, `array length <= ${max}`, value.length);
    return value.map((entry, i) => item(entry, `${path}[${i}]`));
  };

export const vOptional = <T>(item: Check<T>): Check<T | undefined> =>
  (value, path) => (value === undefined ? undefined : item(value, path));

type Shape = Record<string, Check<unknown>>;
type CheckedOf<C> = C extends Check<infer T> ? T : never;
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: undefined extends CheckedOf<S[K]> ? K : never;
}[keyof S];
/** vOptional fields become genuinely optional properties (exactOptionalPropertyTypes-safe). */
type Shaped<S extends Shape> = {
  [K in Exclude<keyof S, OptionalKeys<S>>]: CheckedOf<S[K]>;
} & {
  [K in OptionalKeys<S>]?: Exclude<CheckedOf<S[K]>, undefined>;
};

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(path, 'object', value);
  }
  return value as Record<string, unknown>;
}

function assertNoExtraKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw new ValidationError(`${path}.${key}`, 'no such field', obj[key]);
  }
}

/** Strict object validator: missing required or unknown fields both reject. */
export const vObject = <S extends Shape>(shape: S): Check<Shaped<S>> =>
  (value, path) => {
    const obj = asObject(value, path);
    const allowed = Object.keys(shape);
    assertNoExtraKeys(obj, allowed, path);
    const out: Record<string, unknown> = {};
    for (const key of allowed) {
      const checked = (shape[key] as Check<unknown>)(obj[key], `${path}.${key}`);
      if (checked !== undefined) out[key] = checked;
    }
    return out as Shaped<S>;
  };

/** Tagged union on a `kind` field. */
export const vTagged = <T>(cases: Record<string, Check<T>>): Check<T> =>
  (value, path) => {
    const obj = asObject(value, path);
    const kind = obj['kind'];
    if (typeof kind !== 'string' || !(kind in cases)) {
      throw new ValidationError(`${path}.kind`, `one of [${Object.keys(cases).join(', ')}]`, kind);
    }
    return (cases[kind] as Check<T>)(value, path);
  };

export function eq(a: any, b: any, seen = new WeakMap()): boolean {
    if (Object.is(a, b)) return true;

    if (
        typeof a !== "object" ||
        typeof b !== "object" ||
        a === null ||
        b === null
    )
        return false;

    if (seen.get(a) === b) return true;

    seen.set(a, b);

    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;

        for (let i = 0; i < a.length; i++) {
            if (!eq(a[i], b[i], seen)) return false;
        }

        return true;
    }

    if (a instanceof Date) return a.getTime() === b.getTime();

    if (a instanceof RegExp)
        return a.source === b.source && a.flags === b.flags;

    if (a instanceof Map) {
        if (!(b instanceof Map) || a.size !== b.size) return false;

        for (const [key, val] of a) {
            if (!b.has(key)) return false;

            if (!eq(val, b.get(key), seen)) return false;
        }

        return true;
    }

    if (a instanceof Set) {
        if (!(b instanceof Set) || a.size !== b.size) return false;

        for (const val of a) {
            if (!b.has(val)) return false;
        }

        return true;
    }

    const keys_a = Reflect.ownKeys(a);
    const keys_b = Reflect.ownKeys(b);

    if (keys_a.length !== keys_b.length) return false;

    for (const key of keys_a) {
        if (!Reflect.has(b, key)) return false;

        if (!eq(a[key], b[key], seen)) return false;
    }

    return true;
}

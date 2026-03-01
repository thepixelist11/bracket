export function prune(value: unknown, prune_terms = new Set(["builtins", "__builtins", "__stdout"]), seen = new WeakMap()): unknown {
    if (value && typeof value === "object") {
        if (seen.has(value)) {
            return seen.get(value);
        }

        let result: any;

        if (Array.isArray(value)) {
            result = [];
            seen.set(value, result);
            for (const item of value) {
                result.push(prune(item, prune_terms, seen));
            }
        } else if (value instanceof Map) {
            result = new Map();
            seen.set(value, result);
            for (const [k, v] of value.entries()) {
                if (prune_terms.has(k)) continue;
                result.set(k, prune(v, prune_terms, seen));
            }
        } else if (value instanceof Set) {
            result = new Set();
            seen.set(value, result);
            for (const v of value) {
                result.add(prune(v, prune_terms, seen));
            }
        } else {
            result = {};
            seen.set(value, result);
            for (const [key, val] of Object.entries(value)) {
                if (prune_terms.has(key)) continue;
                result[key] = prune(val, prune_terms, seen);
            }
        }

        return result;
    }

    return value;
}


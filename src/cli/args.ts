export type Arity = 0 | 1;

type ValueSpec<T = unknown> = {
    arity: Arity;
    multiple?: boolean;
    parse?: (raw: string) => T;
    default?: T;
};

type CLIArgBase<T = unknown> = {
    name: string;
    doc?: string;
    value: ValueSpec<T>;
};

type OptionBinding = {
    kind: "flag" | "option";
    aliases?: string[]
};

type PositionalBinding =
    | { kind: "positional"; index: number }
    | { kind: "positional"; range: { start: number; end?: number } };

export type CLIArg<T = unknown> =
    | (CLIArgBase<T> & OptionBinding)
    | (CLIArgBase<T> & PositionalBinding);

export type ParsedArgs<Defs extends readonly CLIArg[]> = {
    [K in Defs[number]as K["name"]]:
    K["value"]["arity"] extends 0
    ? boolean
    : K["value"]["multiple"] extends true
    ? ReturnType<NonNullable<K["value"]["parse"]>>[]
    : ReturnType<NonNullable<K["value"]["parse"]>>;
};

export function parseArgs<const Defs extends readonly CLIArg[]>(defs: Defs, argv = process.argv.slice(2)): ParsedArgs<Defs> {
    type AnyValueSpec = ValueSpec<any>;

    const option_specs = new Map<string, AnyValueSpec>();
    const flag_specs = new Map<string, AnyValueSpec>();
    const alias_to_name = new Map<string, string>();
    const positionals: {
        name: string;
        pred: (i: number) => boolean;
        spec: AnyValueSpec
    }[] = [];

    for (const def of defs) {
        if (def.kind === "positional") {
            const pred = "index" in def
                ? (i: number) => i === def.index
                : (i: number) =>
                    i >= def.range.start &&
                    (def.range.end === undefined || i <= def.range.end);

            positionals.push({ pred, name: def.name, spec: def.value });
            continue;
        }

        const target = def.kind === "flag" ? flag_specs : option_specs;

        target.set(def.name, def.value);

        if (def.aliases) {
            for (const a of def.aliases) {
                alias_to_name.set(a, def.name);
            }
        }
    }

    const result: Record<string, any> = {};
    const raw_positionals: string[] = [];

    const resolveName = (raw: string) => alias_to_name.get(raw) ?? raw;

    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];

        if (token === "--") {
            raw_positionals.push(...argv.slice(i + 1));
            break;
        }

        if (!token.startsWith("-")) {
            raw_positionals.push(token);
            continue;
        }

        const name = resolveName(token.replace(/^--?/, ""));

        if (flag_specs.has(name)) {
            result[name] = true;
            continue;
        }

        if (option_specs.has(name)) {
            const spec = option_specs.get(name)!;
            const raw = argv[++i];
            if (raw === undefined) continue;

            const value = spec.parse ? spec.parse(raw) : raw;

            if (spec.multiple) {
                (result[name] ??= []).push(value);
            } else {
                result[name] = value;
            }
            continue;
        }

        raw_positionals.push(token);
    }

    const positional_results: Record<string, any[]> = {};

    for (let i = 0; i < raw_positionals.length; i++) {
        for (const p of positionals) {
            if (p.pred(i)) {
                const parsed = p.spec.parse
                    ? p.spec.parse(raw_positionals[i])
                    : raw_positionals[i];

                (positional_results[p.name] ??= []).push(parsed);
            }
        }
    }

    for (const p of positionals) {
        const values = positional_results[p.name];

        if (values === undefined) {
            result[p.name] =
                p.spec.default ??
                (p.spec.multiple ? [] : undefined);
            continue;
        }

        result[p.name] = p.spec.multiple ? values : values[0];
    }

    for (const [name, spec] of flag_specs) {
        if (result[name] === undefined) {
            result[name] = spec.default ?? false;
        }
    }

    for (const [name, spec] of option_specs) {
        if (result[name] === undefined) {
            result[name] = spec.default ?? false;
        }
    }

    return result as ParsedArgs<Defs>;
}

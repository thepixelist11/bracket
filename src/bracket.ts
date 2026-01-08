#!/usr/bin/env node

import { BracketEnvironment } from "./env.js";
import { DEFAULT_HELP_LABEL, FEAT_IO, FEAT_REPL, HELP_TOPICS, InterpreterContext, LANG_NAME, REPL_ENVIRONMENT_LABEL, VERSION_NUMBER, getDefaultReaderFeatures } from "./globals.js";
import { REPL } from "./repl.js";
import { runFile } from "./run_file.js";
import { Output } from "./utils.js";

type Arity = 0 | 1;

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

type CLIArg<T = unknown> =
    | (CLIArgBase<T> & OptionBinding)
    | (CLIArgBase<T> & PositionalBinding);

type ParsedArgs<Defs extends readonly CLIArg[]> = {
    [K in Defs[number]as K["name"]]:
    K["value"]["arity"] extends 0
    ? boolean
    : K["value"]["multiple"] extends true
    ? ReturnType<NonNullable<K["value"]["parse"]>>[]
    : ReturnType<NonNullable<K["value"]["parse"]>>;
};

function parseArgs<const Defs extends readonly CLIArg[]>(defs: Defs, argv = process.argv.slice(2)): ParsedArgs<Defs> {
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

const CLI_ARGS = [
    {
        name: "version",
        aliases: ["V"],
        kind: "flag",
        doc: "Displays the current version.",
        value: { arity: 0 },
    },
    {
        name: "interactive",
        aliases: ["repl", "i"],
        kind: "flag",
        doc: "Run interactively in a REPL. Any files specified will be run beforehand in the environment.",
        value: { arity: 0 },
    },
    {
        name: "penv",
        aliases: ["p"],
        kind: "flag",
        doc: "Use a persistent environment if running multiple files. Redundant if --interactive is set.",
        value: { arity: 0 },
    },
    { // TODO: Automatically generate help for CLI options.
        name: "help",
        aliases: ["h"],
        kind: "flag",
        doc: "Displays help for Bracket.",
        value: { arity: 0 },
    },
    {
        name: "files",
        kind: "positional",
        range: { start: 0 },
        doc: "Files to run in Bracket. If running interactively, the same environment will be used across all files and the REPL.",
        value: { arity: 1, parse: s => s, multiple: true },
    }
] as const satisfies readonly CLIArg[];

function displayVersion() { console.log(`${LANG_NAME} v${VERSION_NUMBER}`); }
function displayHelp() { console.log(HELP_TOPICS[DEFAULT_HELP_LABEL]); }

(async function main() {
    const args: ParsedArgs<typeof CLI_ARGS> = parseArgs(CLI_ARGS);

    if (args.help) {
        displayHelp();
        return;
    }

    if (args.version) {
        displayVersion();
        return;
    }

    const features = [FEAT_IO];

    let env: BracketEnvironment | null = null;
    const stdout = new Output();

    if (args.interactive) {
        const ctx: InterpreterContext = {
            file_directives: new Map(),
            features: new Set([
                ...[FEAT_REPL, ...features],
                ...getDefaultReaderFeatures(LANG_NAME, VERSION_NUMBER)
            ]),
        }

        env = new BracketEnvironment(REPL_ENVIRONMENT_LABEL, ctx, undefined, stdout);
    } else if (args.penv) {
        const ctx: InterpreterContext = {
            file_directives: new Map(),
            features: new Set([
                ...features,
                ...getDefaultReaderFeatures(LANG_NAME, VERSION_NUMBER)
            ]),
        }

        env = new BracketEnvironment("GLOBAL", ctx, undefined, stdout);
    }

    for (const file of args.files) {
        if (!env) {
            const ctx: InterpreterContext = {
                file_directives: new Map(),
                features: new Set([
                    ...features,
                    ...getDefaultReaderFeatures(LANG_NAME, VERSION_NUMBER)
                ]),
            }

            const env = new BracketEnvironment(file, ctx, undefined, stdout);

            runFile(file, env, stdout);
        } else {
            runFile(file, env, stdout);
        }
    }

    if (args.interactive) {
        if (!env) throw new Error(`Expected environment to exist in interactive mode, but it does not.`);
        const repl = new REPL(true, env, stdout);
        repl.start();
    }
})();

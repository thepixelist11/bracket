#!/usr/bin/env node

import { CLIArg, parseArgs, ParsedArgs } from "./cli/args.js";
import { BracketEnvironment } from "./runtime/env.js";
import { DEFAULT_HELP_LABEL, FEAT_IO, FEAT_REPL, HELP_TOPICS, InterpreterContext, LANG_NAME, REPL_ENVIRONMENT_LABEL, STDOUT, VERSION_NUMBER, getDefaultReaderFeatures } from "./shared/globals.js";
import { REPL } from "./cli/repl/repl.js";
import { runFile } from "./cli/run_file.js";
import { Output } from "./cli/io/output.js";

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

function displayVersion() { STDOUT.write(`${LANG_NAME} v${VERSION_NUMBER}\n`); }
function displayHelp() { STDOUT.write(`${HELP_TOPICS[DEFAULT_HELP_LABEL]}\n`); }

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

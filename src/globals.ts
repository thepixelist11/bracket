import path from "path";
import os from "os";
import { Output } from "./utils.js";

export const VERSION_NUMBER = `0.0.1` as const;
export const LANG_NAME = `Bracket` as const;
export const WELCOME_MESSAGE = `Welcome to ${LANG_NAME} v${VERSION_NUMBER}.` as const;
export const GOODBYE_MESSAGE = `Goodbye.` as const;
export const TEMP_ENVIRONMENT_LABEL = "TMP" as const;
export const REPL_ENVIRONMENT_LABEL = "REPL" as const;
export const REPL_PROMPT = "> " as const;
export const REPL_CONTINUATION_PROMPT = "  " as const;
export const REPL_INPUT_HISTORY_SIZE = 1000 as const;
export const REPL_HISTORY_FILE = path.join(process.env.HOME ?? "./", ".bracket_repl_history");
export const REPL_BANNER_ENABLED = true as const;
export const REPL_VERBOSITY = 0 as const;
export const REPL_SAVE_COMMANDS_TO_HIST = true as const;
export const REPL_LOAD_COMMANDS_FROM_HIST = true as const;
export const REPL_AUTOCOMPLETE = false as const;
export const REPL_AUTOCOMPLETE_GHOST_COLOR = 238 as const;
export const REPL_HIST_APPEND_ERRORS = true as const;
export const REPL_COMMAND_MAX_LINE_LENGTH = 78 as const;
export const REPL_COMMAND_CORRECTION_MAX_DISTANCE = 3 as const;

export const DECOMPILER_CLOSING_ON_NEW_LINE = false as const;

export const FD_SHEBANG = "exec_with" as const;
export const FD_LANGUAGE = "language" as const;

export const FEAT_OS_LINUX = "linux" as const;
export const FEAT_OS_WINDOWS = "windows" as const;
export const FEAT_OS_MACOS = "macos" as const;

export const FEAT_ARCH_x86_64 = "x86_64" as const;
export const FEAT_ARCH_ARM = "arm64" as const;

export const FEAT_ENDIAN_LITTLE = "little-endian" as const;
export const FEAT_ENDIAN_BIG = "big-endian" as const;

export const FEAT_ENV_DEVELOPMENT = "development" as const;
export const FEAT_ENV_PRODUCTION = "production" as const;
export const FEAT_ENV_DEBUG = "debug" as const;

export const FEAT_SHEBANG = "shebang" as const;
export const FEAT_UNICODE = "unicode" as const;
export const FEAT_VERTICAL_BARS = "vbars" as const;

export const FEAT_CASE_INSENSITIVE = "insensitive" as const;

export const FEAT_COMMENTS_SEMICOLON = "comments-semicolon" as const;
export const FEAT_COMMENTS_BLOCK = "comments-block" as const;
export const FEAT_COMMENTS_NESTED = "comments-nested" as const;
export const FEAT_COMMENTS_DATUM = "comments-datum" as const;

export const FEAT_READER_COND = "reader:cond" as const;
export const FEAT_READER_CASE_FOLDING = "reader:case-folding" as const;
export const FEAT_READER_SHARED_STRUCTURE = "reader:shared-structure" as const;
export const FEAT_READER_LABELS = "reader:labels" as const;
export const FEAT_READER_POSITIONAL_METADATA = "reader:pos-meta" as const;
export const FEAT_READER_SYNTAX_QUOTE = "reader:syntax-quote" as const;
export const FEAT_READER_QUASIQUOTE = "reader:quasiquote" as const;
export const FEAT_READER_UNQUOTE_SPLICING = "reader:unquote-splicing" as const;

export const FEAT_IMPL_NAME = (n: string) => `name:${n}` as const;
export const FEAT_IMPL_VERSION = (n: string) => `version:${n}` as const;

export const FEAT_VM = "vm" as const;
export const FEAT_GC_PRECISE = "gc-precise" as const;
export const FEAT_GC_CONSERVATIVE = "gc-conservative" as const;

export const FEAT_IO = "io" as const;
export const FEAT_LOAD = "load" as const;
export const FEAT_SYS_EXEC = "sys-exec" as const;
export const FEAT_FFI = "ffi" as const;
export const FEAT_SANDBOXED = "sandboxed" as const;

export const FEAT_DEBUG = "debug" as const;
export const FEAT_REPL = "repl" as const;

export const FEAT_DEFAULTS: Map<string, string[]> = new Map([
    [`${LANG_NAME}@${VERSION_NUMBER}`, [
        FEAT_SHEBANG,
        FEAT_UNICODE,
        FEAT_VERTICAL_BARS,
        FEAT_COMMENTS_SEMICOLON,
        FEAT_COMMENTS_BLOCK,
        FEAT_COMMENTS_NESTED,
        FEAT_COMMENTS_DATUM,
        FEAT_IMPL_NAME(LANG_NAME),
        FEAT_IMPL_VERSION(VERSION_NUMBER),
    ]]
]);

export const BUILTIN_CUSTOM_SET = "__custom" as const;

export function getDefaultReaderFeatures(lang: string, version: string) {
    const feats: string[] = [...FEAT_DEFAULTS.get(`${lang}@${version}`) ?? []];

    if (process.arch === "x64") feats.push(FEAT_ARCH_x86_64);
    if (process.arch === "arm" ||
        process.arch === "arm64") feats.push(FEAT_ARCH_ARM);
    if (process.platform === "linux") feats.push(FEAT_OS_LINUX);
    if (process.platform === "win32") feats.push(FEAT_OS_WINDOWS);
    if (process.platform === "darwin") feats.push(FEAT_OS_MACOS);
    if (os.endianness() === "BE") feats.push(FEAT_ENDIAN_BIG);
    else if (os.endianness() === "LE") feats.push(FEAT_ENDIAN_LITTLE);

    return feats;
}

export let STDOUT = new Output({ forward_to: process.stdout });

export type InterpreterContext = {
    file_directives: Map<string, any>;
    features: Set<string>;
};

export const enum PartialExitCode {
    SUCCESS,
    ERROR,
    INCOMPLETE,
};

export const DEFAULT_HELP_LABEL = "short";
export const HELP_TOPICS: Record<string, string> = {
    [DEFAULT_HELP_LABEL]: `
${LANG_NAME} v${VERSION_NUMBER}
Default Help Text Here`,
}

export const BOOL_TRUE = "#t" as const,
    BOOL_FALSE = "#f" as const;

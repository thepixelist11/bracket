import path from "path";
import os from "os";
import { TokenType, Token, ValueType, BOOL_FALSE, BOOL_TRUE } from "./token.js";
import { BracketEnvironment } from "./env.js";
import { Evaluator } from "./evaluator.js";
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

export const FD_SHEBANG = "exec_with" as const;
export const FD_LANGUAGE = "language" as const;

export const FEAT_OS_LINUX = "os:linux" as const;
export const FEAT_OS_WINDOWS = "os:windows" as const;
export const FEAT_OS_MACOS = "os:macos" as const;

export const FEAT_ARCH_x86_64 = "arch:x86_64" as const;
export const FEAT_ARCH_ARM = "arch:arm64" as const;

export const FEAT_ENDIAN_LITTLE = "endian:le" as const;
export const FEAT_ENDIAN_BIG = "endian:be" as const;

export const FEAT_ENV_DEVELOPMENT = "env:development" as const;
export const FEAT_ENV_PRODUCTION = "env:production" as const;
export const FEAT_ENV_DEBUG = "env:debug" as const;

export const FEAT_SHEBANG = "shebang" as const;
export const FEAT_UNICODE = "unicode" as const;
export const FEAT_VERTICAL_BARS = "vbars" as const;

export const FEAT_CASE_INSENSITIVE = "case:insensitive" as const;

export const FEAT_COMMENTS_SEMICOLON = "comments:semicolon" as const;
export const FEAT_COMMENTS_BLOCK = "comments:block" as const;
export const FEAT_COMMENTS_NESTED = "comments:nested" as const;
export const FEAT_COMMENTS_DATUM = "comments:datum" as const;

export const FEAT_READER_COND = "reader:cond" as const;
export const FEAT_READER_CASE_FOLDING = "reader:case-folding" as const;
export const FEAT_READER_SHARED_STRUCTURE = "reader:shared-structure" as const;
export const FEAT_READER_LABELS = "reader:labels" as const;
export const FEAT_READER_POSITIONAL_METADATA = "reader:pos-meta" as const;
export const FEAT_READER_SYNTAX_QUOTE = "reader:syntax-quote" as const;
export const FEAT_READER_QUASIQUOTE = "reader:quasiquote" as const;
export const FEAT_READER_UNQUOTE_SPLICING = "reader:unquote-splicing" as const;

export const FEAT_IMPL_NAME = (n: string) => `impl:name:${n}` as const;
export const FEAT_IMPL_VERSION = (n: string) => `impl:version:${n}` as const;

export const FEAT_VM_BYTECODE = "vm:bytecode" as const;
export const FEAT_GC_PRECISE = "gc:precise" as const;
export const FEAT_GC_CONSERVATIVE = "gc:conservative" as const;

export const FEAT_IO = "io" as const;
export const FEAT_LOAD = "load" as const;
export const FEAT_EVAL = "eval" as const;
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
        FEAT_IO,
        FEAT_IMPL_NAME(LANG_NAME),
        FEAT_IMPL_VERSION(VERSION_NUMBER),
    ]]
])

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

export type InterpreterContext = {
    file_directives: Map<string, any>;
    features: Set<string>;
};

export let STDOUT = new Output({ forward_to: process.stdout });

export const enum ParenType {
    PAREN,
    BRACKET,
    BRACE
};

export const EOF_CHAR = "$" as const;

export const CHAR_TOK_MAP: Record<string, TokenType> = {
    "(": TokenType.LPAREN,
    "[": TokenType.LPAREN,
    "{": TokenType.LPAREN,

    ")": TokenType.RPAREN,
    "]": TokenType.RPAREN,
    "}": TokenType.RPAREN,
} as const;

export const PAREN_TYPE_MAP: Record<string, ParenType> = {
    "(": ParenType.PAREN,
    ")": ParenType.PAREN,

    "[": ParenType.BRACKET,
    "]": ParenType.BRACKET,

    "{": ParenType.BRACE,
    "}": ParenType.BRACE,
} as const;

export const LPAREN_TYPE_MAP: Record<ParenType, string> = {
    [ParenType.PAREN]: "(",
    [ParenType.BRACKET]: "[",
    [ParenType.BRACE]: "{",
} as const;

export const RPAREN_TYPE_MAP: Record<ParenType, string> = {
    [ParenType.PAREN]: ")",
    [ParenType.BRACKET]: "]",
    [ParenType.BRACE]: "}",
} as const;

export const TOKEN_PRINT_TYPE_MAP: Record<TokenType, string> = {
    [TokenType.ANY]: "Any",
    [TokenType.NUM]: "Num",
    [TokenType.SYM]: "Sym",
    [TokenType.BOOL]: "Bool",
    [TokenType.STR]: "Str",
    [TokenType.CHAR]: "Char",
    [TokenType.VOID]: "Void",
    [TokenType.ERROR]: "Err",
    [TokenType.EOF]: "EOF",
    [TokenType.LPAREN]: "LP",
    [TokenType.RPAREN]: "RP",
    [TokenType.IDENT]: "Ident",
    [TokenType.PROCEDURE]: "Procedure",
    [TokenType.LIST]: "List",
    [TokenType.QUOTE]: "Quote",
    [TokenType.FORM]: "Form",
    [TokenType.META]: "Meta",
} as const;

export const JS_PRINT_TYPE_MAP: Record<string, string> = {
    "number": "Num",
    "string": "Str",
    "boolean": "Bool",
} as const;

export const ARGUMENT_TYPE_COERCION: Record<ValueType, (tok: Token, env?: BracketEnvironment) => any> = {
    [TokenType.NUM]: (tok: Token) => parseFloat(tok.literal),
    [TokenType.STR]: (tok: Token) => tok.literal,
    [TokenType.CHAR]: (tok: Token) => tok.literal,
    [TokenType.SYM]: (tok: Token) => tok.literal,
    [TokenType.BOOL]: (tok: Token) => tok.literal === BOOL_TRUE,
    [TokenType.ANY]: (tok: Token) => tok,
    [TokenType.ERROR]: (tok: Token) => tok,
    [TokenType.VOID]: (tok: Token) => tok,
    [TokenType.IDENT]: (tok: Token) => tok,
    [TokenType.PROCEDURE]: (tok: Token, env?: BracketEnvironment) => Evaluator.procedureToJS(tok, env!),
    [TokenType.LIST]: (tok: Token) => tok.value,
} as const;

export const RETURN_TYPE_COERCION: Record<ValueType, (result: any) => string> = {
    [TokenType.NUM]: (result: any) => result.toString(),
    [TokenType.STR]: (result: any) => result,
    [TokenType.CHAR]: (result: any) => result,
    [TokenType.SYM]: (result: any) => result,
    [TokenType.BOOL]: (result: any) => result ? BOOL_TRUE : BOOL_FALSE,
    [TokenType.ANY]: (result: any) => result,
    [TokenType.ERROR]: (result: any) => result,
    [TokenType.VOID]: (result: any) => result,
    [TokenType.IDENT]: (result: any) => result,
    [TokenType.PROCEDURE]: (result: any) => result,
    [TokenType.LIST]: (result: any) => result,
} as const;

export const VALUE_TYPE_JS_TYPE_MAP: Record<ValueType, string> = {
    [TokenType.ANY]: "undefined",
    [TokenType.NUM]: "number",
    [TokenType.STR]: "string",
    [TokenType.BOOL]: "boolean",
    [TokenType.SYM]: "string",
    [TokenType.CHAR]: "string",
    [TokenType.ERROR]: "object",
    [TokenType.VOID]: "undefined",
    [TokenType.IDENT]: "string",
    [TokenType.PROCEDURE]: "object",
    [TokenType.LIST]: "object",
} as const;

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

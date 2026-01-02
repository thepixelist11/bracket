import path from "path";
import { TokenType, Token, ValueType } from "./token.js";
import { BracketEnvironment } from "./env.js";
import { Evaluator } from "./evaluator.js";
import { Output } from "./utils.js";

export const VERSION_NUMBER = `0.0.1` as const;
export const WELCOME_MESSAGE = `Welcome to Bracket v${VERSION_NUMBER}.` as const;
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

export let STDOUT = new Output({ forward_to: process.stdout });

export const enum ParenType {
    PAREN,
    BRACKET,
    BRACE
};

export const EOF_CHAR = "$" as const;
export const BOOL_TRUE = "#t" as const, BOOL_FALSE = "#f" as const;

export const enum ErrorTokenLiteral {
    INVALID_IDENT_NAME = "invalid identifier name",
    INVALID_CHARACTER_LITERAL = "invalid character literal",
    INVALID_SYMBOL_LITERAL = "invalid symbol literal",
    NUMERIC_EXTRANEOUS_PERIODS = "extraneous periods in numeric",
    INVALID_NEGATIVE_NUMERIC = "the character following a minus sign in a negative numeric was invalid",
    ILLEGAL_SYMBOL_HASH_START = "symbols cannot begin with # unless followed by %",
};

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

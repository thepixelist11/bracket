#!/usr/bin/env node

import util from "util";
import path from "path";
import fs from "fs";
import { Writable } from "stream";

declare module "readline" {
    interface Interface {
        history: string[];
        output: NodeJS.WritableStream;
        input: NodeJS.ReadableStream;
    }
}

class Output extends Writable {
    public write_count = 0;
    public buffer = "";

    private readonly target: NodeJS.WritableStream | null;

    constructor(options: { forward_to?: NodeJS.WritableStream } = {}) {
        super({ decodeStrings: false });
        this.target = options?.forward_to ?? null;
    }

    _write(chunk: string | Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        const text = typeof chunk === "string"
            ? chunk
            : chunk.toString(encoding);

        this.write_count++;
        this.buffer += text;

        if (this.target) {
            this.target.write(text);
        }

        callback();
    }

    reset(): void {
        this.write_count = 0;
        this.buffer = "";
    }
}

function printDeep(obj: unknown, depth = 12) {
    console.log(util.inspect(obj, { showHidden: false, depth: depth, colors: true }))
}

const VERSION_NUMBER = `0.0.1` as const;
const WELCOME_MESSAGE = `Welcome to Bracket v${VERSION_NUMBER}.` as const;
const GOODBYE_MESSAGE = `Goodbye.` as const;
const TEMP_ENVIRONMENT_LABEL = "TMP" as const;
const REPL_ENVIRONMENT_LABEL = "REPL" as const;
const REPL_PROMPT = "> " as const;
const REPL_CONTINUATION_PROMPT = "  " as const;
const REPL_INPUT_HISTORY_SIZE = 1000 as const;
const REPL_HISTORY_FILE = path.join(process.env.HOME ?? "./", ".bracket_repl_history");
const REPL_BANNER_ENABLED = true as const;
const REPL_VERBOSITY = 0 as const;
const REPL_SAVE_COMMANDS_TO_HIST = true as const;
const REPL_LOAD_COMMANDS_FROM_HIST = true as const;
const REPL_AUTOCOMPLETE = false as const;
const REPL_AUTOCOMPLETE_GHOST_COLOR = 238 as const;
const REPL_HIST_APPEND_ERRORS = true as const;

let STDOUT = new Output({ forward_to: process.stdout });

const enum TokenType {
    ANY,
    ERROR,
    EOF,
    VOID,
    LPAREN,
    RPAREN,
    NUM,
    SYM,
    BOOL,
    STR,
    IDENT,
    CHAR,
    PROCEDURE,
    LIST,
};

function TokenError(msg: string, row: number = -1, col: number = -1) { return new Token(TokenType.ERROR, msg, row, col) };
function TokenEOF(row: number = -1, col: number = -1) { return new Token(TokenType.EOF, EOF_CHAR, row, col) };
function TokenVoid(row: number = -1, col: number = -1) { return new Token(TokenType.VOID, "", row, col) };
function TokenLParen(type: ParenType = ParenType.PAREN, row: number = -1, col: number = -1) { return new Token(TokenType.LPAREN, LPAREN_TYPE_MAP[type], row, col) };
function TokenRParen(type: ParenType = ParenType.PAREN, row: number = -1, col: number = -1) { return new Token(TokenType.RPAREN, RPAREN_TYPE_MAP[type], row, col) };
function TokenNum(num: number | string, row: number = -1, col: number = -1) { return new Token(TokenType.NUM, num.toString(), row, col) };
function TokenSym(sym: string, row: number = -1, col: number = -1) { return new Token(TokenType.SYM, sym.toString(), row, col) };
function TokenBool(bool: boolean, row: number = -1, col: number = -1) { return new Token(TokenType.BOOL, bool ? BOOL_TRUE : BOOL_FALSE, row, col) };
function TokenStr(str: string, row: number = -1, col: number = -1) { return new Token(TokenType.STR, str, row, col) };
function TokenIdent(ident: string, row: number = -1, col: number = -1) { return new Token(TokenType.IDENT, ident, row, col) };
function TokenChar(char: string, row: number = -1, col: number = -1) { return new Token(TokenType.CHAR, char, row, col) };
function TokenProc(proc: ASTProcedureNode, row: number = -1, col: number = -1) { return new Token(TokenType.PROCEDURE, "", row, col, proc) };
function TokenList(list: Token[], row: number = -1, col: number = -1) { return new Token(TokenType.LIST, "", row, col, list) };

type ValueType =
    | TokenType.ANY
    | TokenType.NUM
    | TokenType.SYM
    | TokenType.STR
    | TokenType.BOOL
    | TokenType.ERROR
    | TokenType.VOID
    | TokenType.CHAR
    | TokenType.IDENT
    | TokenType.LIST
    | TokenType.PROCEDURE;

const enum ParenType {
    PAREN,
    BRACKET,
    BRACE
};

const EOF_CHAR = "$" as const;
const BOOL_TRUE = "#t" as const, BOOL_FALSE = "#f" as const;

const enum ErrorTokenLiteral {
    INVALID_IDENT_NAME = "invalid identifier name",
    INVALID_CHARACTER_LITERAL = "invalid character literal",
    INVALID_SYMBOL_LITERAL = "invalid symbol literal",
    NUMERIC_EXTRANEOUS_PERIODS = "extraneous periods in numeric",
    INVALID_NEGATIVE_NUMERIC = "the character following a minus sign in a negative numeric was invalid",
    ILLEGAL_SYMBOL_HASH_START = "symbols cannot begin with # unless followed by %",
};

const CHAR_TOK_MAP: Record<string, TokenType> = {
    "(": TokenType.LPAREN,
    "[": TokenType.LPAREN,
    "{": TokenType.LPAREN,

    ")": TokenType.RPAREN,
    "]": TokenType.RPAREN,
    "}": TokenType.RPAREN,
} as const;

const PAREN_TYPE_MAP: Record<string, ParenType> = {
    "(": ParenType.PAREN,
    ")": ParenType.PAREN,

    "[": ParenType.BRACKET,
    "]": ParenType.BRACKET,

    "{": ParenType.BRACE,
    "}": ParenType.BRACE,
} as const;

const LPAREN_TYPE_MAP: Record<ParenType, string> = {
    [ParenType.PAREN]: "(",
    [ParenType.BRACKET]: "[",
    [ParenType.BRACE]: "{",
} as const;

const RPAREN_TYPE_MAP: Record<ParenType, string> = {
    [ParenType.PAREN]: ")",
    [ParenType.BRACKET]: "]",
    [ParenType.BRACE]: "}",
} as const;

const TOKEN_PRINT_TYPE_MAP: Record<TokenType, string> = {
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

const JS_PRINT_TYPE_MAP: Record<string, string> = {
    "number": "Num",
    "string": "Str",
    "boolean": "Bool",
} as const;

const ARGUMENT_TYPE_COERCION: Record<ValueType, (tok: Token, env?: BracketEnvironment) => any> = {
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

const RETURN_TYPE_COERCION: Record<ValueType, (result: any) => string> = {
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

const VALUE_TYPE_JS_TYPE_MAP: Record<ValueType, string> = {
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

interface TokenMetadata { row: number, col: number }

class Token {
    public meta: TokenMetadata = { row: -1, col: -1 };

    constructor(
        public type: TokenType,
        public literal: string,
        row: number = -1,
        col: number = -1,
        public value?: unknown
    ) {
        this.meta.row = row;
        this.meta.col = col;
    }

    private escapeString(str: string) {
        return str
            .replaceAll("\x07", "\\a")
            .replaceAll("\x08", "\\b")
            .replaceAll("\x09", "\\t")
            .replaceAll("\x0a", "\\n")
            .replaceAll("\x0b", "\\v")
            .replaceAll("\x0c", "\\f")
            .replaceAll("\x0d", "\\r")
            .replaceAll("\x1b", "\\e")
            .replaceAll("\x22", "\\\"");
    }

    toString(): string {
        switch (this.type) {
            case TokenType.ERROR:
                if (this.meta.row >= -1 && this.meta.col >= 0)
                    return `#<error:${this.literal} at ${this.meta.row}:${this.meta.col}>`;
                else
                    return `#<error:${this.literal}>`;
            case TokenType.EOF:
                throw new Error("Unable to convert EOF token to string. This should never be attempted.");
            case TokenType.LPAREN:
                return `#(`;
            case TokenType.RPAREN:
                return `#)`;
            case TokenType.NUM:
                return `${parseFloat(this.literal)}`;
            case TokenType.SYM:
                if (this.literal.split("").some(ch => Lexer.isIllegalSymbolChar(ch)))
                    return `'|${this.literal}|`;
                else
                    return `'${this.literal}`;
            case TokenType.BOOL:
                return `${this.literal}`;
            case TokenType.STR:
                return `"${this.escapeString(this.literal)}"`;
            case TokenType.IDENT:
                return `#<ident:${this.literal}>`;
            case TokenType.CHAR:
                return `#\\${this.literal}`;
            case TokenType.VOID:
                return "";
            case TokenType.PROCEDURE:
                return "#<procedure>";
            case TokenType.LIST:
                return `'(${(this.value as Token[] ?? []).map(t => t.toString()).join(" ")})`; // FIXME: Prevent nested lists from having '
            case TokenType.ANY:
                return `<any>`
        }
    }

    withPos(row: number, col: number) {
        return new Token(this.type, this.literal, row, col, this.value);
    }
}

interface ASTBase {
    meta?: TokenMetadata;
}

class ASTLiteralNode implements ASTBase {
    public tok: Token;
    public meta: TokenMetadata;

    constructor(tok: Token) {
        this.tok = tok;
        this.meta = tok.meta;
    }
}

class ASTSExprNode implements ASTBase {
    public elements: ASTNode[] = [];
    public meta?: TokenMetadata;

    constructor(...elements: (ASTNode | Token)[]) {
        this.elements = elements.map(e =>
            e instanceof Token ? new ASTLiteralNode(e) : e
        )

        if (this.elements.length === 0)
            this.meta = { row: -1, col: -1 };
        else
            this.meta = this.elements[0].meta;
    }

    get first() { return this.elements[0]; }
    get rest() { return this.elements.slice(1); }
    get last() { return this.elements.at(-1)!; }
}

class ASTProcedureNode implements ASTBase {
    public params: string[];
    public body: ASTNode[];
    public closure: BracketEnvironment;
    public meta?: TokenMetadata;

    constructor(name: string, params: string[], body: ASTNode[], env: BracketEnvironment) {
        this.params = params;
        this.body = body;
        this.closure = new BracketEnvironment(name, env);
        this.closure.define(name, Evaluator.Void());
    }
}

type ASTNode = ASTLiteralNode | ASTSExprNode | ASTProcedureNode;

type MacroExpander = (args: ASTNode[], env: BracketEnvironment) => ASTNode;

type BuiltinFunction =
    ({ constant: true } & { value: Token }) |
    ({ constant?: false } & (
        ({ special: true } & { special_fn: (args: ASTNode[], env: BracketEnvironment) => Token }) |
        ({ special?: false } &
            ({ macro: true } & {
                expander: MacroExpander,
                hygienic?: boolean,
            } | { macro?: false } & {
                fn: (...args: any) => any,
                ret_type: ValueType,
                arg_type: ValueType[],
                raw?: ("token" | "normal")[],
                eval_strategy?: "normal" | "lazy",
                env_param?: boolean,
            }) & {
                min_args: number,
                variadic?: boolean,
                arg_names?: string[],
                arg_predicates?: ((v: any) => boolean)[],
                error_messsage?: string,
                source_name?: string,
                doc?: string,
                pure?: boolean,
                constant_fold?: boolean,
                memoize?: boolean,
            })));

class Evaluator {
    evaluate(ast: ASTNode, env?: BracketEnvironment): Token {
        const real_env = env ?? new BracketEnvironment(TEMP_ENVIRONMENT_LABEL);
        const expanded = Evaluator.expand(ast, real_env);
        return Evaluator.evalExpanded(expanded, real_env);
    }

    static evalExpanded(ast: ASTNode, env: BracketEnvironment) {
        if (ast instanceof ASTLiteralNode) {
            if (ast.tok.type === TokenType.IDENT) {
                if (env.has(ast.tok.literal)) {
                    const result = env.get(ast.tok.literal);

                    if (result instanceof ASTLiteralNode)
                        return result.tok;
                    else if (result instanceof ASTSExprNode)
                        throw new Error(`${ast.tok.literal}: unexpected AST list`);
                } else if (env.builtins.has(ast.tok.literal)) {
                    const builtin = env.builtins.get(ast.tok.literal)!;
                    if (builtin.constant)
                        return builtin.value.withPos(ast.tok.meta.row, ast.tok.meta.col);

                    if (builtin.special)
                        return builtin.special_fn([], env);

                    return ast.tok;
                } else {
                    throw new Error(`${ast.tok.literal}: undefined; cannot reference an identifier before its definition`);
                }
            }

            return ast.tok;
        } else if (ast instanceof ASTSExprNode) {
            return Evaluator.evalListFunctionNode(ast, env);
        }

        return TokenVoid();
    }

    static evalListFunctionNode(node: ASTSExprNode, env: BracketEnvironment): Token {
        if (!node.first)
            throw new Error(`missing procedure expression: probably originally (), which is an illegal empty application`);

        const op =
            (node.first instanceof ASTLiteralNode) ?
                node.first.tok :
                Evaluator.evalExpanded(node.first, env);

        if (op.type === TokenType.ERROR) return op;

        if (env.builtins.has(op.literal)) {
            const builtin = env.builtins.get(op.literal)!;
            if (builtin.constant)
                throw new Error(`application: not a procedure; expected a procedure that can be applied to arguments`);

            if (builtin.special)
                return builtin.special_fn(node.rest, env);

            if (builtin.macro === true)
                throw new Error(`${op.literal}: macro appeared in runtime evaluation`);

            let args = [];
            for (let i = 0; i < node.rest.length; i++) {
                const arg_type = (i >= builtin.arg_type.length ? builtin.arg_type.at(-1) : builtin.arg_type[i])!;

                if (arg_type === TokenType.IDENT) {
                    if (!(node.rest[i] instanceof ASTLiteralNode))
                        throw new Error(`${op.literal}: expected a literal argument.`);

                    args.push((node.rest[i] as ASTLiteralNode).tok);
                } else {
                    args.push(Evaluator.evalExpanded(node.rest[i], env));
                }
            }

            let argument_error = args.find(a => a.type === TokenType.ERROR);
            if (argument_error) return argument_error;

            try {
                const result = Evaluator.callBuiltin(env, op.literal, args, op.meta.row, op.meta.col);
                return result;
            } catch (err) {
                const msg = (err as any).message ?? String(err);
                // console.log(env.label, msg);
                return TokenError(msg, op.meta.row, op.meta.col);
            }
        }

        const proc = Evaluator.procedureToJS(op, env);

        // let fn: ASTProcedureNode;
        //
        // if (op.type === TokenType.PROCEDURE) {
        //     fn = op.value as ASTProcedureNode;
        // } else if (op.type === TokenType.IDENT) {
        //     if (!env.has(op.literal))
        //         throw new Error(`${op.literal}: undefined; cannot reference an identifier before its definition`);
        //
        //     const bound = env.get(op.literal)!;
        //     if (bound instanceof ASTProcedureNode) {
        //         fn = bound;
        //     } else if (bound instanceof ASTLiteralNode && bound.tok.type === TokenType.PROCEDURE) {
        //         if (!(bound.tok.value instanceof ASTProcedureNode))
        //             throw new Error(`malformed Procedure token.`);
        //         fn = bound.tok.value as ASTProcedureNode;
        //     } else {
        //         throw new Error(`application: not a procedure; expected a procedure that can be applied to arguments`);
        //     }
        // } else {
        //     throw new Error(`application: not a procedure; expected a procedure that can be applied to arguments`);
        // }

        const args = node.rest.map(e =>
            Evaluator.evalExpanded(e, env));

        // // TODO: Allow for more extensibility with variadic user-defined functions.
        // if (args.length !== fn.params.length)
        //     throw new Error(`arity mismatch: expected ${fn.params.length} arguments, got ${args.length} arguments`);
        //
        // const closure = new BracketEnvironment(op.literal, fn.closure);
        // for (let i = 0; i < args.length; i++) {
        //     closure.define(fn.params[i], new ASTLiteralNode(args[i]));
        // }
        //
        // let result = Evaluator.Void().tok;
        //
        // for (const expr of fn.body) {
        //     result = Evaluator.evalExpanded(expr, closure);
        //     if (result.type === TokenType.ERROR)
        //         return result;
        // }

        return proc(...args);
    }

    static expand(ast: ASTNode, env: BracketEnvironment): ASTNode {
        if (ast instanceof ASTLiteralNode || ast instanceof ASTProcedureNode) return ast;

        if (ast.elements.length === 0)
            return ast;

        const expanded_op = Evaluator.expand(ast.first, env);

        if (!ast.first) {
            if (expanded_op instanceof ASTLiteralNode && expanded_op.tok.literal === "lambda")
                return ast;

            throw new Error(`missing procedure expression: probably originally (), which is an illegal empty application`);
        }

        if (
            expanded_op instanceof ASTLiteralNode &&
            expanded_op.tok.type === TokenType.IDENT &&
            env.builtins.has(expanded_op.tok.literal)
        ) {
            const builtin = env.builtins.get(expanded_op.tok.literal)!;

            if (!builtin.constant && !builtin.special && builtin.macro === true) {
                const result = builtin.expander(ast.rest, env);

                return Evaluator.expand(result, env);
            }
        }

        const expanded_args = ast.rest.map(arg => Evaluator.expand(arg, env));

        return new ASTSExprNode(expanded_op, ...expanded_args);
    }

    static callBuiltin(env: BracketEnvironment, fn_name: string, args: Token[], row: number = -1, col: number = -1): Token {
        if (!env.builtins.has(fn_name)) throw new Error(`${fn_name}: this function is not defined`);

        const builtin = env.builtins.get(fn_name)!;

        if (builtin.constant) return builtin.value.withPos(row, col);

        if (builtin.special) throw new Error(`${fn_name}: bad syntax`);

        if (builtin.macro === true)
            throw new Error(`${fn_name}: macro appeared in runtime evaluation`);

        let typed_args = [];

        if (!builtin.variadic && args.length > builtin.min_args)
            throw new Error(`Too many arguments passed to ${fn_name}. Got ${args.length} arguments, expected ${builtin.min_args} arguments.`);

        if (args.length < builtin.min_args)
            throw new Error(`Not enough arguments passed to ${fn_name}. Got ${args.length} arguments, expected ${builtin.min_args} arguments.`);

        for (let i = 0; i < args.length; i++) {
            const current_arg_type = (i >= builtin.arg_type.length ? builtin.arg_type.at(-1) : builtin.arg_type[i])!;
            const current_raw_type = builtin.raw ? (i >= builtin.raw.length ? builtin.raw.at(-1) : builtin.raw[i]) : "normal";

            if (current_arg_type === TokenType.ANY) {
                if (builtin.raw && builtin.raw[i] !== "token")
                    throw new Error(`Functions with arguments of type Any must take in a raw token. Got ${TOKEN_PRINT_TYPE_MAP[args[i].type]} ${args[i].toString()}`);

                typed_args.push(args[i]);
                continue;
            }

            if (current_arg_type === TokenType.PROCEDURE) {
                if (args[i].type === TokenType.PROCEDURE || args[i].type === TokenType.IDENT) {
                    typed_args.push((builtin.raw && builtin.raw[i] !== "token") ? args[i] : ARGUMENT_TYPE_COERCION[current_arg_type](args[i], env));
                } else {
                    throw new Error(`Unexpected type. Expected ${TOKEN_PRINT_TYPE_MAP[current_arg_type]}, got ${TOKEN_PRINT_TYPE_MAP[args[i].type]} ${args[i].toString()}`);
                }

                continue;
            }

            if (args[i].type !== current_arg_type) {
                throw new Error(`Unexpected type. Expected ${TOKEN_PRINT_TYPE_MAP[current_arg_type]}, got ${TOKEN_PRINT_TYPE_MAP[args[i].type]} ${args[i].toString()}`);
            }

            typed_args.push((current_raw_type === "normal") ? ARGUMENT_TYPE_COERCION[current_arg_type](args[i], env) : args[i]);
        }

        let result = builtin.env_param ? builtin.fn(env, ...typed_args) : builtin.fn(...typed_args);

        if (builtin.ret_type === TokenType.ANY) {
            if (!(result instanceof Token))
                throw new Error(`Functions of return type Any must return a raw token. Got ${JS_PRINT_TYPE_MAP[typeof result]} (${result})`);

            return result;
        }

        if (builtin.ret_type === TokenType.VOID)
            return TokenVoid(row, col);

        if (builtin.ret_type === TokenType.LIST) {
            if (!Array.isArray(result))
                throw new Error(`Unexpected return type. Expected ${TOKEN_PRINT_TYPE_MAP[TokenType.LIST]}, got ${JS_PRINT_TYPE_MAP[typeof result]} (${result})`);

            return TokenList(result, row, col);
        }

        if (typeof result !== VALUE_TYPE_JS_TYPE_MAP[builtin.ret_type])
            throw new Error(`Unexpected return type. Expected ${TOKEN_PRINT_TYPE_MAP[builtin.ret_type]}, got ${JS_PRINT_TYPE_MAP[typeof result]} (${result})`)

        return new Token(builtin.ret_type, RETURN_TYPE_COERCION[builtin.ret_type](result), row, col);
    }

    static Ident(name: string): ASTLiteralNode {
        return new ASTLiteralNode(TokenIdent(name));
    }

    static Sym(name: string): ASTLiteralNode {
        return new ASTLiteralNode(TokenSym(name));
    }

    static Num(value: number): ASTLiteralNode {
        return new ASTLiteralNode(TokenNum(value));
    }

    static Bool(value: boolean): ASTLiteralNode {
        return new ASTLiteralNode(TokenBool(value));
    }

    static Void(): ASTLiteralNode {
        return new ASTLiteralNode(TokenVoid());
    }

    static Str(value: string): ASTLiteralNode {
        return new ASTLiteralNode(TokenStr(value));
    }

    static Char(value: string): ASTLiteralNode {
        return new ASTLiteralNode(TokenChar(value));
    }

    static Error(msg: string, row: number = -1, col: number = -1): ASTLiteralNode {
        return new ASTLiteralNode(TokenError(msg, row, col));
    }

    static Call(op: string, ...args: ASTNode[]): ASTSExprNode {
        return new ASTSExprNode(Evaluator.Ident(op), ...args);
    }

    static evalIf(args: ASTNode[], env: BracketEnvironment): Token {
        if (args.length !== 3)
            throw new Error(`if: expected 3 arguments, got ${args.length} arguments`);

        const cond = Evaluator.evalExpanded(args[0], env);

        return cond.literal !== BOOL_FALSE
            ? Evaluator.evalExpanded(args[1], env)
            : Evaluator.evalExpanded(args[2], env);
    }

    static evalSet(args: ASTNode[], env: BracketEnvironment): Token {
        if (args.length !== 2) throw new Error("set!: bad syntax");
        const [ident, expr] = args;

        if (!(ident instanceof ASTLiteralNode))
            throw new Error("set!: bad syntax; expected a literal identifier");

        if (ident.tok.type !== TokenType.IDENT)
            throw new Error("set!: bad syntax: expected an identifier");

        function mutate(name: string, value: Token, env: BracketEnvironment) {
            if (env.bindings.has(name)) {
                env.define(name, new ASTLiteralNode(value));
            } else if (env.parent) {
                mutate(name, value, env.parent);
            } else {
                throw new Error(`set!: cannot set variable before its definition`);
            }
        }

        mutate(ident.tok.literal, Evaluator.evalExpanded(expr, env), env);

        return TokenVoid();
    }

    static evalDefine(args: ASTNode[], env: BracketEnvironment): Token {
        if (args.length === 0) throw new Error("define: bad syntax; no arguments provided");
        if (args.length === 1) throw new Error("define: bad syntax; missing expression after identifier");

        const ident = args[0];
        const body_nodes = args.slice(1);

        if (ident instanceof ASTLiteralNode) {
            if (args.length > 2) throw new Error("define: bad syntax; multiple expressions after identifier");
            const final_value = Evaluator.evalExpanded(body_nodes[0], env);

            // TODO: This currently errors twice. Once for the original error,
            // once for this define.
            if (final_value.type === TokenType.ERROR)
                throw new Error(final_value.literal);

            env.define(ident.tok.literal, new ASTLiteralNode(final_value));
        } else if (ident instanceof ASTSExprNode) {
            if (ident.elements.length === 0)
                throw new Error(`define: bad syntax; no function name or arguments provided`);

            if (ident.elements.some(e => e instanceof ASTSExprNode))
                throw new Error(`define: not an identifier; expected a literal, instead found a list`);

            if ((ident.elements as ASTLiteralNode[]).some(e => e.tok.type !== TokenType.IDENT))
                throw new Error(`define: expected an Ident, found ${TOKEN_PRINT_TYPE_MAP[(ident.elements as ASTLiteralNode[]).find(e => e.tok.type !== TokenType.IDENT)!.tok.type]}`);

            const name = (ident.first as ASTLiteralNode).tok.literal;
            const params = (ident.rest as ASTLiteralNode[]).map(a => a.tok.literal);

            const procedure = new ASTProcedureNode(name, params, body_nodes, env);
            procedure.closure.define(name, procedure);

            env.define(name, procedure);
        }

        return Evaluator.Void().tok;
    }

    static evalLambda(args: ASTNode[], env: BracketEnvironment): Token {
        if (args.length < 2)
            throw new Error(`lambda: bad syntax; missing body`);

        const params_node = args[0];
        const body_nodes = args.slice(1);

        // TODO: Allow for rest arguments
        if (!(params_node instanceof ASTSExprNode))
            throw new Error(`lambda: bad syntax; rest arguments are not yet supported`);

        const params: string[] = [];

        for (const p of params_node.elements) {
            if (!(p instanceof ASTLiteralNode) || p.tok.type !== TokenType.IDENT)
                throw new Error(`lambda: bad syntax; parameters must be identifiers`);
            params.push(p.tok.literal);
        }

        const proc = new ASTProcedureNode(
            "lambda",
            params,
            body_nodes,
            env,
        );

        return TokenProc(proc, params_node.meta?.row, params_node.meta?.col);
    }

    static procedureToJS(tok: Token, env: BracketEnvironment): (...args: Token[]) => Token {
        let fn: ASTProcedureNode;

        if (tok.type === TokenType.PROCEDURE) {
            fn = tok.value as ASTProcedureNode;
        } else if (tok.type === TokenType.IDENT) {
            if (env.has(tok.literal)) {
                const bound = env.get(tok.literal)!;
                if (bound instanceof ASTProcedureNode) {
                    fn = bound;
                } else if (bound instanceof ASTLiteralNode && bound.tok.type === TokenType.PROCEDURE) {
                    if (!(bound.tok.value instanceof ASTProcedureNode))
                        throw new Error(`malformed Procedure token.`);
                    fn = bound.tok.value as ASTProcedureNode;
                } else {
                    throw new Error(`application: not a procedure; expected a procedure that can be applied to arguments`);
                }
            } else if (env.builtins.has(tok.literal)) {
                return (...args: Token[]) => Evaluator.callBuiltin(env, tok.literal, args);
            } else {
                throw new Error(`${tok.literal}: undefined; cannot reference an identifier before its definition`);
            }
        } else {
            throw new Error(`application: not a procedure; expected a procedure that can be applied to arguments`);
        }

        return (...args: Token[]) => {
            if (args.length !== fn.params.length) {
                throw new Error(`arity mismatch: expected ${fn.params.length} arguments, got ${args.length} arguments`);
            }

            const closure = new BracketEnvironment(tok.literal, fn.closure);

            for (let i = 0; i < args.length; i++) {
                closure.define(fn.params[i], new ASTLiteralNode(args[i]));
            }

            let result = Evaluator.Void().tok;
            for (const expr of fn.body) {
                result = Evaluator.evalExpanded(expr, closure);
                if (result.type === TokenType.ERROR)
                    return result;
            }

            return result;
        };
    }
};

const builtins = new Map<string, BuiltinFunction>([
    ["+", { fn: (...args) => args.length === 0 ? 0 : args.reduce((acc, v) => acc + v), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 0, variadic: true, pure: true }],
    ["-", { fn: (...args) => args.length === 1 ? -args[0] : args.reduce((acc, v) => acc - v), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true }],
    ["*", { fn: (...args) => args.length === 0 ? 1 : args.reduce((acc, v) => acc * v), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 0, variadic: true, pure: true }],
    ["/", {
        fn: (...args) => {
            if (args.length === 1) {
                if (args[0] === 0)
                    throw new Error("Division by zero is not allowed.");
                return 1 / args[0];
            }

            return args.reduce((acc, v) => {
                if (v === 0)
                    throw new Error("Division by zero is not allowed.");
                return acc / v;
            });
        },
        ret_type: TokenType.NUM,
        arg_type: [TokenType.NUM],
        min_args: 1,
        variadic: true,
        pure: true
    }],
    ["quotient", {
        fn: (a, b) => {
            if (b === 0)
                throw new Error("Division by zero is not allowed.");
            return Math.trunc(a / b);
        },
        ret_type: TokenType.NUM,
        arg_type: [TokenType.NUM, TokenType.NUM],
        min_args: 2,
        pure: true
    }],
    ["remainder", {
        fn: (a, b) => {
            if (b === 0)
                throw new Error("Division by zero is not allowed.");
            return a % b;
        },
        ret_type: TokenType.NUM,
        arg_type: [TokenType.NUM, TokenType.NUM],
        min_args: 2,
        pure: true
    }],
    ["expt", { fn: (a, b) => a ** b, ret_type: TokenType.NUM, arg_type: [TokenType.NUM, TokenType.NUM], min_args: 2, pure: true }],
    ["exp", { fn: (x) => Math.exp(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["log", { fn: (a, b) => Math.log(a) / Math.log(b ?? Math.E), ret_type: TokenType.NUM, arg_type: [TokenType.NUM, TokenType.NUM], min_args: 1, variadic: true, pure: true }], // TODO: Allow for max args
    ["sin", { fn: (x) => Math.sin(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["cos", { fn: (x) => Math.cos(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["tan", { fn: (x) => Math.tan(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["asin", { fn: (x) => Math.asin(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["acos", { fn: (x) => Math.acos(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["atan", { fn: (x) => Math.atan(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["sqr", { fn: (x) => x * x, ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["sqrt", { fn: (x) => Math.sqrt(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["cbrt", { fn: (x) => Math.cbrt(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["<", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] < v), ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true }],
    ["<=", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] <= v), ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true }],
    [">", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] > v), ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true }],
    [">=", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] >= v), ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true }],
    ["=", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] === v), ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true }],
    ["not", { fn: (x) => (x.type === TokenType.BOOL && x.literal === BOOL_FALSE), ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, pure: true, raw: ["token"] }],
    ["xor", {
        fn: (a, b) => {
            if (
                a.literal !== BOOL_FALSE && b.literal === BOOL_FALSE ||
                a.literal === BOOL_FALSE && b.literal !== BOOL_FALSE
            ) return true;
            return false;
        },
        ret_type: TokenType.BOOL,
        arg_type: [TokenType.ANY, TokenType.ANY],
        min_args: 2,
        pure: true,
        raw: ["token", "token"]
    }],
    ["and", {
        macro: true,
        variadic: true,
        min_args: 0,
        expander: (args: ASTNode[]): ASTNode => {
            if (args.length === 0) return Evaluator.Bool(true);
            if (args.length === 1) return args[0];
            return new ASTSExprNode(
                Evaluator.Ident("if"),
                args[0],
                new ASTSExprNode(
                    Evaluator.Ident("and"),
                    ...args.slice(1)
                ),
                Evaluator.Bool(false),
            );
        }
    }],
    ["or", {
        macro: true,
        variadic: true,
        min_args: 0,
        expander: (args: ASTNode[]): ASTNode => {
            if (args.length === 0) return Evaluator.Bool(false);
            if (args.length === 1) return args[0];
            return new ASTSExprNode(
                Evaluator.Ident("if"),
                args[0],
                Evaluator.Bool(true),
                new ASTSExprNode(
                    Evaluator.Ident("or"),
                    ...args.slice(1)
                ),
            );
        }
    }],
    ["when", {
        macro: true,
        variadic: true,
        min_args: 2,
        expander: (args: ASTNode[]): ASTNode => {
            return new ASTSExprNode(
                Evaluator.Ident("if"),
                args[0],
                ...args.slice(1),
                Evaluator.Void(),
            );
        }
    }],
    ["unless", {
        macro: true,
        variadic: true,
        min_args: 2,
        expander: (args: ASTNode[]): ASTNode => {
            return new ASTSExprNode(
                Evaluator.Ident("if"),
                new ASTSExprNode(
                    TokenIdent("not"),
                    args[0],
                ),
                ...args.slice(1),
                Evaluator.Void(),
            );
        }
    }],
    ["cond", {
        macro: true,
        variadic: true,
        min_args: 0,
        expander: (args: ASTNode[]): ASTNode => {
            if (args.length === 0)
                return Evaluator.Void();

            if (args.some(v => v instanceof ASTLiteralNode))
                throw new Error(`cond: bad syntax, expected a test-value pair but found ${args.find(v => v instanceof ASTLiteralNode)?.tok.literal}`)

            // TODO: Values between test and value should still be
            // evaluated for side effects, though only value is returned.

            const test = (args[0] as ASTSExprNode).first;
            const value = (args[0] as ASTSExprNode).last;
            const rest = args.slice(1);

            if (
                test instanceof ASTLiteralNode &&
                test.tok.type === TokenType.IDENT &&
                test.tok.literal === "else"
            ) {
                return value;
            }

            return new ASTSExprNode(
                Evaluator.Ident("if"),
                test,
                value,
                rest.length > 0 ? new ASTSExprNode(
                    TokenIdent("cond"),
                    ...rest,
                ) : Evaluator.Void(),
            )
        }
    }],
    ["begin", {
        macro: true,
        variadic: true,
        min_args: 0,
        expander: (args: ASTNode[]): ASTNode => {
            if (args.length === 0) return Evaluator.Void();
            if (args.length === 1) return args[0];

            return new ASTSExprNode(
                new ASTSExprNode(
                    Evaluator.Ident("lambda"),
                    new ASTSExprNode(),
                    ...args
                ),
            );
        },
    }],
    ["let", {
        macro: true,
        variadic: true,
        min_args: 2,
        expander: (args: ASTNode[]): ASTNode => {
            if (!(args[0] instanceof ASTSExprNode))
                throw new Error(`let: bad syntax; not an identifier and expression for a binding`);

            const pairs = args[0].elements;
            const bodies = args.slice(1);

            if (pairs.length === 0) {
                return new ASTSExprNode(
                    Evaluator.Ident("begin"),
                    ...bodies
                )
            }

            const identifiers: ASTNode[] = [];
            const values: ASTNode[] = [];

            for (const pair of pairs) {
                if (!(pair instanceof ASTSExprNode))
                    throw new Error(`let: bad syntax; not an identifier and expression for a binding`);

                identifiers.push(pair.elements[0]);
                values.push(pair.elements[1]);
            }

            return new ASTSExprNode(
                new ASTSExprNode(
                    Evaluator.Ident("lambda"),
                    new ASTSExprNode(
                        ...identifiers
                    ),
                    ...bodies
                ),
                ...values,
            );
        }
    }],
    ["print", {
        fn: (env, val) => {
            env.stdout.write(val.toString());
        },
        min_args: 1,
        arg_type: [TokenType.ANY],
        ret_type: TokenType.VOID,
        raw: ["token"],
        pure: false,
        env_param: true
    }],
    ["display", { // FIXME: Chars and strings should print literally. Do not print unprintable characters
        fn: (env, val) => {
            if (
                val.literal.length === 0 &&
                (val.type === TokenType.STR || val.type === TokenType.SYM)
            ) return;

            function toDisplay(tok: Token): string {
                if (tok.type === TokenType.PROCEDURE) {
                    return `#<procedure:${val.literal.toString()}>`;
                } else if (tok.type === TokenType.LIST) {
                    return `(${(tok.value as Token[]).map(t => toDisplay(t)).join(" ")})`;
                } else {
                    return tok.literal.toString();
                }
            }

            env.stdout.write(toDisplay(val));
        },
        min_args: 1,
        arg_type: [TokenType.ANY],
        ret_type: TokenType.VOID,
        raw: ["token"],
        pure: false,
        env_param: true
    }],
    ["set!", {
        special: true,
        special_fn: Evaluator.evalSet,
    }],
    ["else", { fn: () => { throw new Error("else: not allowed as an expression") }, ret_type: TokenType.ERROR, arg_type: [TokenType.ANY], min_args: 0, variadic: true }],
    ["if", { special: true, special_fn: Evaluator.evalIf }],
    ["define", { special: true, special_fn: Evaluator.evalDefine }],
    ["lambda", { special: true, special_fn: Evaluator.evalLambda }],
    ["λ", { special: true, special_fn: Evaluator.evalLambda }],
    ["abs", { fn: (x) => Math.abs(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["floor", { fn: (x) => Math.floor(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["ceiling", { fn: (x) => Math.ceil(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["round", { fn: (x) => Math.round(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["truncate", { fn: (x) => Math.trunc(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["positive?", { fn: (x) => x > 0, ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["negative?", { fn: (x) => x < 0, ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["max", { fn: (...args) => { let m = null; for (const a of args) m = m ? Math.max(a, m) : a; return m }, ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true }],
    ["min", { fn: (...args) => { let m = null; for (const a of args) m = m ? Math.min(a, m) : a; return m }, ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true }],
    ["zero?", { fn: (x) => x === 0, ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["even?", { fn: (x) => x % 2 === 0, ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["add1", { fn: (x) => x + 1, ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["odd?", { fn: (x) => x % 2 === 1, ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["sub1", { fn: (x) => x - 1, ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true }],
    ["identity", { fn: (x) => x, ret_type: TokenType.ANY, arg_type: [TokenType.ANY], min_args: 1, pure: true }],
    ["symbol?", { fn: (x) => x.type === TokenType.SYM, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, raw: ["token"], pure: true }],
    ["number?", { fn: (x) => x.type === TokenType.NUM, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, raw: ["token"], pure: true }],
    ["string?", { fn: (x) => x.type === TokenType.STR, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, raw: ["token"], pure: true }],
    ["boolean?", { fn: (x) => x.type === TokenType.BOOL, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, raw: ["token"], pure: true }],
    ["list?", { fn: (x) => x.type === TokenType.LIST, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, raw: ["token"], pure: true }],
    ["string->symbol", { fn: (x) => x, ret_type: TokenType.SYM, arg_type: [TokenType.STR], min_args: 1, pure: true }],
    ["symbol->string", { fn: (x) => x, ret_type: TokenType.STR, arg_type: [TokenType.SYM], min_args: 1, pure: true }],
    ["string-length", { fn: (x) => x.length, ret_type: TokenType.NUM, arg_type: [TokenType.STR], min_args: 1, pure: true }],
    ["string-ref", { fn: (x, i) => { if (i < x.length) return x[i]; else throw new Error("string-ref: index is out of range") }, ret_type: TokenType.CHAR, arg_type: [TokenType.STR, TokenType.NUM], min_args: 2, pure: true }],
    ["string-append", { fn: (...args) => ["", ...args].reduce((acc, cur) => acc + cur), ret_type: TokenType.STR, arg_type: [TokenType.STR], min_args: 0, variadic: true, pure: true }],
    ["substring", {
        fn: (str, s, e) => {
            if (s > str.length)
                throw new Error("substring: starting index is out of range");

            if (s > e) {
                throw new Error("substring: ending index is smaller than starting index");
            }

            return str.substring(s, e);
        },
        ret_type: TokenType.STR,
        arg_type: [TokenType.STR, TokenType.NUM, TokenType.NUM],
        min_args: 2,
        variadic: true,
        pure: true
    }],
    ["string=?", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] === v), ret_type: TokenType.BOOL, arg_type: [TokenType.STR], min_args: 1, variadic: true, pure: true }],
    ["pi", { constant: true, value: TokenNum(3.141592653589793) }],
    ["list", { fn: (...args) => [...args], ret_type: TokenType.LIST, arg_type: [TokenType.ANY], variadic: true, min_args: 0, pure: true }],
    ["pair?", { fn: (x) => x.type === TokenType.LIST && x.value.length >= 1, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], pure: true, min_args: 1 }],
    ["cons?", { fn: (x) => x.type === TokenType.LIST && x.value.length >= 1, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], pure: true, min_args: 1 }],
    ["null?", { fn: (x) => x.type === TokenType.LIST && x.value.length === 0, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], pure: true, min_args: 1 }],
    ["empty?", { fn: (x) => x.type === TokenType.LIST && x.value.length === 0, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], pure: true, min_args: 1 }],
    ["cons", { fn: (a, d) => [a, ...d], ret_type: TokenType.LIST, arg_type: [TokenType.ANY, TokenType.LIST], pure: true, min_args: 2 }],
    ["empty", { constant: true, value: TokenList([]) }],
    ["null", { constant: true, value: TokenList([]) }],
    ["car", { fn: (p) => { if (p.length > 0) return p[0]; else throw new Error(`car: expected a pair`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["first", { fn: (p) => { if (p.length > 0) return p[0]; else throw new Error(`first: expected a list of at least 1 element`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["second", { fn: (p) => { if (p.length > 1) return p[1]; else throw new Error(`second: expected a list of at least 2 element`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["third", { fn: (p) => { if (p.length > 2) return p[2]; else throw new Error(`third: expected a list of at least 3 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["fourth", { fn: (p) => { if (p.length > 3) return p[3]; else throw new Error(`fourth: expected a list of at least 4 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["fifth", { fn: (p) => { if (p.length > 4) return p[4]; else throw new Error(`fifth: expected a list of at least 5 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["sixth", { fn: (p) => { if (p.length > 5) return p[5]; else throw new Error(`sixth: expected a list of at least 6 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["seventh", { fn: (p) => { if (p.length > 6) return p[6]; else throw new Error(`seventh: expected a list of at least 7 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["eighth", { fn: (p) => { if (p.length > 7) return p[7]; else throw new Error(`eighth: expected a list of at least 8 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["ninth", { fn: (p) => { if (p.length > 8) return p[8]; else throw new Error(`ninth: expected a list of at least 9 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["tenth", { fn: (p) => { if (p.length > 9) return p[9]; else throw new Error(`tenth: expected a list of at least 10 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["eleventh", { fn: (p) => { if (p.length > 10) return p[10]; else throw new Error(`eleventh: expected a list of at least 11 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["twelfth", { fn: (p) => { if (p.length > 11) return p[11]; else throw new Error(`twelfth: expected a list of at least 12 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["thirteenth", { fn: (p) => { if (p.length > 12) return p[12]; else throw new Error(`thirteenth: expected a list of at least 13 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["fourteenth", { fn: (p) => { if (p.length > 13) return p[13]; else throw new Error(`fourteenth: expected a list of at least 14 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["fifteenth", { fn: (p) => { if (p.length > 14) return p[14]; else throw new Error(`fifteenth: expected a list of at least 15 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["last", { fn: (p) => { if (p.length > 0) return p.at(-1); else throw new Error(`last: expected a list of at least 1 element`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["last-pair", { fn: (p) => { if (p.length > 0) return [p.at(-1)]; else throw new Error(`last-pair: expected a list of at least 1 element`) }, ret_type: TokenType.LIST, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["cdr", { fn: (p) => { if (p.length > 0) return p.slice(1); else throw new Error(`cdr: expected a pair`) }, ret_type: TokenType.LIST, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["rest", { fn: (p) => { if (p.length > 0) return p.slice(1); else throw new Error(`rest: expected a list of at least 1 element`) }, ret_type: TokenType.LIST, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["build-list", {
        fn: (n, proc) => {
            if (n < 0) throw new Error(`build-list: expected a non-negative integer, got ${n}`);

            const result = [];
            for (let i = 0; i < n; i++) {
                result.push(proc(TokenNum(i)));
            }
            return result;
        },
        ret_type: TokenType.LIST,
        arg_type: [TokenType.NUM, TokenType.PROCEDURE],
        pure: true,
        min_args: 2
    }],
    ["make-list", {
        fn: (n, v) => {
            if (n < 0) throw new Error(`make-list: expected a non-negative integer, got ${n}`);

            const result = [];
            for (let i = 0; i < n; i++) {
                result.push(v);
            }
            return result;
        },
        ret_type: TokenType.LIST,
        arg_type: [TokenType.NUM, TokenType.ANY],
        pure: true,
        min_args: 2,
        raw: ["normal", "token"]
    }],
    ["list-update", {
        fn: (lst, pos, updater) => {
            if (pos < 0 || pos >= lst.length) throw new Error(`list-update: pos out of bounds; expected 0 <= pos < ${lst.length}, got ${pos}`);

            return [
                ...lst.slice(0, pos),
                updater(lst[pos]),
                ...lst.slice(pos + 1),
            ];
        },
        ret_type: TokenType.LIST,
        arg_type: [TokenType.LIST, TokenType.NUM, TokenType.PROCEDURE],
        pure: true,
        min_args: 3,
    }],
    ["list-set", {
        fn: (lst, pos, val) => {
            if (pos < 0 || pos >= lst.length) throw new Error(`list-set: pos out of bounds; expected 0 <= pos < ${lst.length}, got ${pos}`);

            return [
                ...lst.slice(0, pos),
                val,
                ...lst.slice(pos + 1),
            ];
        },
        ret_type: TokenType.LIST,
        arg_type: [TokenType.LIST, TokenType.NUM, TokenType.ANY],
        pure: true,
        min_args: 3,
        raw: ["normal", "normal", "token"]
    }],
    ["length", { fn: (lst) => lst.length, ret_type: TokenType.NUM, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["list-ref", { fn: (lst, pos) => { if (pos >= 0 && pos < lst.length) return lst[pos]; else throw new Error("list-ref: index out of range") }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST, TokenType.NUM], pure: true, min_args: 2 }],
    // FIXME: The lst argument must start with a chain of at least pos pairs, it does not need to be a list.
    ["list-tail", { fn: (lst, pos) => { if (pos >= 0 && pos < lst.length) return lst.slice(pos); else throw new Error("list-tail: index out of range") }, ret_type: TokenType.LIST, arg_type: [TokenType.LIST, TokenType.NUM], pure: true, min_args: 2 }],
    ["append", { fn: (...lsts) => [...lsts].flat(1), ret_type: TokenType.LIST, arg_type: [TokenType.LIST], pure: true, variadic: true, min_args: 0 }],
    ["reverse", { fn: (lst) => [...lst].reverse(), ret_type: TokenType.LIST, arg_type: [TokenType.LIST], pure: true, min_args: 1 }],
    ["map", {
        fn: (proc, ...lsts) => {
            const elem_count = lsts[0].length;
            const result = [];

            if (lsts.some(l => l.length !== elem_count))
                throw new Error(`map: all lists must have the same size`);

            for (let i = 0; i < elem_count; i++) {
                const args = lsts.map(l => l[i]);
                result.push(proc(...args));
            }

            return result;
        },
        ret_type: TokenType.LIST,
        arg_type: [TokenType.PROCEDURE, TokenType.LIST],
        variadic: true,
        pure: true,
        min_args: 1
    }],
    ["andmap", {
        fn: (proc, ...lsts) => {
            const elem_count = lsts[0].length;

            if (lsts.some(l => l.length !== elem_count))
                throw new Error(`andmap: all lists must have the same size`);

            for (let i = 0; i < elem_count; i++) {
                const args = lsts.map(l => l[i]);
                const result = proc(...args);
                if (result.type === TokenType.BOOL && result.literal === BOOL_FALSE)
                    return TokenBool(false);

                if (i === elem_count - 1)
                    return result;
            }

            return TokenBool(true);
        },
        ret_type: TokenType.ANY,
        arg_type: [TokenType.PROCEDURE, TokenType.LIST],
        variadic: true,
        pure: true,
        min_args: 1
    }],
    ["ormap", {
        fn: (proc, ...lsts) => {
            const elem_count = lsts[0].length;

            if (lsts.some(l => l.length !== elem_count))
                throw new Error(`ormap: all lists must have the same size`);

            for (let i = 0; i < elem_count; i++) {
                const args = lsts.map(l => l[i]);
                const result = proc(...args);
                if (result.type === TokenType.BOOL && result.literal === BOOL_FALSE)
                    continue;

                return result;
            }

            return TokenBool(false);
        },
        ret_type: TokenType.ANY,
        arg_type: [TokenType.PROCEDURE, TokenType.LIST],
        variadic: true,
        pure: true,
        min_args: 1
    }],
    ["for-each", {
        fn: (proc, ...lsts) => {
            const elem_count = lsts[0].length;

            if (lsts.some(l => l.length !== elem_count))
                throw new Error(`for-each: all lists must have the same size`);

            for (let i = 0; i < elem_count; i++) {
                const args = lsts.map(l => l[i]);
                proc(...args);
            }

            return TokenVoid();
        },
        ret_type: TokenType.VOID,
        arg_type: [TokenType.PROCEDURE, TokenType.LIST],
        variadic: true,
        pure: true,
        min_args: 1
    }],
    ["foldl", {
        fn: (proc, init, ...lsts) => {
            const elem_count = lsts[0].length;

            if (lsts.some(l => l.length !== elem_count))
                throw new Error(`foldl: all lists must have the same size`);

            let result = init;

            for (let i = 0; i < elem_count; i++) {
                const args = lsts.map(l => l[i]);
                result = proc(...args, result);
            }

            return result;
        },
        ret_type: TokenType.ANY,
        arg_type: [TokenType.PROCEDURE, TokenType.ANY, TokenType.LIST],
        variadic: true,
        pure: true,
        min_args: 1
    }],
    ["foldr", {
        fn: (proc, init, ...lsts) => {
            const elem_count = lsts[0].length;

            if (lsts.some(l => l.length !== elem_count))
                throw new Error(`foldr: all lists must have the same size`);

            let result = init;

            for (let i = elem_count - 1; i >= 0; i--) {
                const args = lsts.map(l => l[i]);
                result = proc(...args, result);
            }

            return result;
        },
        ret_type: TokenType.ANY,
        arg_type: [TokenType.PROCEDURE, TokenType.ANY, TokenType.LIST],
        variadic: true,
        pure: true,
        min_args: 1
    }],
    ["running-foldl", {
        fn: (proc, init, ...lsts) => {
            const elem_count = lsts[0].length;

            if (lsts.some(l => l.length !== elem_count))
                throw new Error(`running-foldl: all lists must have the same size`);

            let last = init;
            const results = [last];

            for (let i = 0; i < elem_count; i++) {
                const args = lsts.map(l => l[i]);
                last = proc(...args, last);
                results.push(last);
            }

            return results;
        },
        ret_type: TokenType.LIST,
        arg_type: [TokenType.PROCEDURE, TokenType.ANY, TokenType.LIST],
        variadic: true,
        pure: true,
        min_args: 1
    }],
    ["running-foldr", {
        fn: (proc, init, ...lsts) => {
            const elem_count = lsts[0].length;

            if (lsts.some(l => l.length !== elem_count))
                throw new Error(`running-foldr: all lists must have the same size`);

            let last = init;
            const results = [last];

            for (let i = elem_count - 1; i >= 0; i--) {
                const args = lsts.map(l => l[i]);
                last = proc(...args, last);
                results.unshift(last);
            }

            return results;
        },
        ret_type: TokenType.LIST,
        arg_type: [TokenType.PROCEDURE, TokenType.ANY, TokenType.LIST],
        variadic: true,
        pure: true,
        min_args: 1
    }],
    ["filter", {
        fn: (pred, lst) => {
            const results = [];
            for (const elem of lst) {
                const result = pred(elem);
                if (result.type === TokenType.BOOL && result.literal === BOOL_FALSE)
                    continue;
                results.push(elem);
            }
            return results;
        },
        ret_type: TokenType.LIST,
        arg_type: [TokenType.PROCEDURE, TokenType.LIST],
        pure: true,
        min_args: 2
    }],
]);

class BracketEnvironment {
    private readonly __parent?: BracketEnvironment;
    private readonly __label: string;
    private readonly __stdout: Output;
    private __bindings: Map<string, ASTNode> = new Map();
    private __builtins: Map<string, BuiltinFunction> = builtins;

    constructor(label: string, parent?: BracketEnvironment, stdout: Output = STDOUT) {
        this.__label = label;
        this.__parent = parent;
        this.__stdout = stdout;

        if (this.parent && this.parent.stdout)
            this.__stdout = this.parent.stdout;
    }

    get label_raw() { return this.__label; }
    get label_chained(): string { return this.__parent ? `${this.__parent.label_chained}:${this.label_raw}` : this.label_raw };
    get label() { return `<${this.label_chained}>`; }
    get bindings() { return this.__bindings; }
    get parent() { return this.__parent; }
    get builtins() { return this.__builtins; }
    get stdout() { return this.__stdout; }

    define(ident: string, node: ASTNode) {
        return this.__bindings.set(ident, node);
    }

    get(ident: string): ASTNode | undefined {
        if (this.__bindings.has(ident)) {
            return this.__bindings.get(ident);
        }
        return this.__parent?.get(ident);
    }

    has(ident: string): boolean {
        if (this.__bindings.has(ident)) return true;
        return this.__parent?.has(ident) ?? false;
    }

    public setBuiltin(ident: string, builtin: BuiltinFunction) {
        this.builtins.set(ident, builtin);
    }

    public removeBuiltin(ident: string) {
        return this.builtins.delete(ident);
    }

    static copy(env: BracketEnvironment) {
        const cp = new BracketEnvironment(env.label_raw, env.__parent);
        cp.__bindings = new Map(env.bindings);

        return cp;
    }
};

class Parser {
    private toks: Token[] = [];
    private idx: number = 0;
    private paren_stack: ParenType[] = [];

    private get cur() { return this.toks[this.idx] ?? undefined; }

    public parse(toks: Token[]): { result: ASTNode, code: PartialExitCode } {
        this.toks = toks;
        this.idx = 0;

        const exprs: ASTNode[] = [];

        while (this.cur && this.cur.type !== TokenType.EOF) {
            const expr = this.parseExpression();
            if (expr.code !== PartialExitCode.SUCCESS) return expr;
            exprs.push(expr.result);
        }

        return {
            result: new ASTSExprNode(
                TokenIdent("begin"),
                ...exprs
            ),
            code: PartialExitCode.SUCCESS
        };

        if (this.cur.type === TokenType.LPAREN) {
            this.paren_stack = [PAREN_TYPE_MAP[this.cur.literal]];
            this.idx++;
            return this.parseExpression();
        } else {
            return {
                result: new ASTLiteralNode(this.cur),
                code: PartialExitCode.SUCCESS
            };
        }
    }

    private parseExpression(): { result: ASTNode, code: PartialExitCode } {
        if (!this.cur) {
            return {
                result: Evaluator.Error("unexpected end of input"),
                code: PartialExitCode.INCOMPLETE,
            };
        }

        switch (this.cur.type) {
            case TokenType.LPAREN:
                return this.parseList();
            case TokenType.ERROR:
                return {
                    result: Evaluator.Error(
                        this.cur.literal,
                        this.cur.meta.row,
                        this.cur.meta.col,
                    ),
                    code: PartialExitCode.ERROR,
                }
            default: {
                const tok = this.cur;
                this.idx++;
                return {
                    result: new ASTLiteralNode(tok),
                    code: PartialExitCode.SUCCESS,
                }
            }
        }
    }

    private parseList(): { result: ASTNode, code: PartialExitCode } {
        const start = this.cur;
        const elements: ASTNode[] = [];
        this.idx++;

        while (this.cur) {
            if (this.cur.type === TokenType.RPAREN) {
                this.idx++;
                return {
                    result: new ASTSExprNode(...elements),
                    code: PartialExitCode.SUCCESS,
                };
            }

            if (this.cur.type === TokenType.EOF) {
                return {
                    result: Evaluator.Error(
                        `unterminated list; missing ${RPAREN_TYPE_MAP[PAREN_TYPE_MAP[start.literal]]}`,
                        start.meta.row,
                        start.meta.col,
                    ),
                    code: PartialExitCode.INCOMPLETE,
                };
            }

            const expr = this.parseExpression();
            if (expr.code !== PartialExitCode.SUCCESS) return expr;

            elements.push(expr.result);
        }

        return {
            result: Evaluator.Error(
                `unterminated list; missing ${RPAREN_TYPE_MAP[PAREN_TYPE_MAP[start.literal]]}`,
                start.meta.row,
                start.meta.col,
            ),
            code: PartialExitCode.INCOMPLETE,
        };
    }
}

const enum PartialExitCode {
    SUCCESS,
    ERROR,
    INCOMPLETE,
};

class Lexer {
    private idx: number = 0;
    private str: string = "";
    private col: number = 0;
    private row: number = 0;

    private get cur() { return this.str[this.idx] ?? ""; }
    private get peek() { return this.str[this.idx + 1] ?? ""; }

    private peekNextNChars(n: number) {
        let result = "";
        for (let i = 0; i < n; i++) {
            result += this.str[this.idx + i] ?? "";
        }
        return result;
    }

    public lex(expr: string): { result: Token[], code: PartialExitCode } {
        this.idx = 0;
        this.str = expr;
        this.col = 0;
        this.row = 0;
        this.skipWhitespace();
        this.skipComment();

        let toks: Token[] = [];
        while (this.cur) {
            if (CHAR_TOK_MAP[this.cur]) {
                toks.push(new Token(CHAR_TOK_MAP[this.cur]!, this.cur, this.row, this.col));
                this.movePosition();
            } else if (Lexer.isQuote(this.cur)) {
                const { result, code } = this.readStringTok();

                if (code !== PartialExitCode.SUCCESS) return { code, result: toks };

                toks.push(result);
            } else if (this.cur === "'") {
                const { result, code } = this.readSymbolTok();

                if (code !== PartialExitCode.SUCCESS) return { code, result: toks };

                toks.push(result);
            } else if (/\#\\./.test(this.peekNextNChars(3))) {
                const { result, code } = this.readCharTok();

                if (code !== PartialExitCode.SUCCESS) return { code, result: toks };

                toks.push(result);
            } else if (!Lexer.isWhitespace(this.cur)) {
                const { result, code } =
                    Lexer.isNumeric(this.cur) || this.cur === "-"
                        ? this.readNumericTok()
                        : this.readIdentTok();

                if (code !== PartialExitCode.SUCCESS) return { code, result: toks };

                toks.push(result);
            }

            this.skipWhitespace();
            this.skipComment();
        }

        toks.push(TokenEOF(this.row, this.col));

        return { result: toks, code: PartialExitCode.SUCCESS };
    }

    private movePosition(): void {
        if (this.cur === "\n") {
            this.row++;
            this.col = 0;
        } else {
            this.col++;
        }

        this.idx++;
    }

    private skipWhitespace(): void {
        while (Lexer.isWhitespace(this.cur)) {
            this.movePosition();
        }
    }

    private skipComment(): void {
        if (this.cur === ";") {
            // Type assertion due to irrelevant type mismatch warning
            while (this.cur && ((this.cur as string) !== "\n" || this.cur === ";")) {
                this.movePosition();
            }
        }
    }

    private readNumericTok(): { result: Token, code: PartialExitCode } {
        let num = "";
        let previous_dot = false;
        const col = this.col;
        const row = this.row;

        if (this.cur === "-") {
            if (this.peek === ".") {
                this.movePosition();
                return {
                    result: TokenError(ErrorTokenLiteral.INVALID_NEGATIVE_NUMERIC, row, col),
                    code: PartialExitCode.ERROR
                };
            }

            num += "-";
            this.movePosition();
        }

        while (this.cur && Lexer.isNumeric(this.cur)) {
            if (this.cur === ".") {
                if (previous_dot) {
                    return {
                        result: TokenError(ErrorTokenLiteral.NUMERIC_EXTRANEOUS_PERIODS, row, col),
                        code: PartialExitCode.ERROR
                    };
                }

                previous_dot = true;
            } else {
                previous_dot = false;
            }

            num += this.cur;
            this.movePosition();
        }

        return { result: TokenNum(num, row, col), code: PartialExitCode.SUCCESS };
    }

    private readStringEscapeSeq(): string {
        function convertSeqToString(ch: string) {
            const code = ch.codePointAt(0)!;

            switch (code) {
                case 7: return "\a";
                case 8: return "\b";
                case 9: return "\t";
                case 10: return "\n";
                case 11: return "\v";
                case 12: return "\f";
                case 13: return "\r";
                case 27: return "\x1b";
            }

            if (!/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(ch)) {
                return ch;
            }

            const hex = code.toString(16).toUpperCase();
            const prefix = (code <= 0xFFFF ? "\\u" : "\\U");
            return prefix + hex.padStart(code <= 0xFFFF ? 4 : 8, "0");
        }

        // Any assertion to prevent overly specific type narrowing
        if ((this.cur as any) !== "\\") return "";
        this.movePosition();

        let seq = this.cur;

        if (/^[0-7]$/.test(this.cur)) {
            for (let i = 0; i < 2 && /^[0-7]$/.test(this.peek); i++) {
                this.movePosition();
                seq += this.cur;
            }

            this.movePosition();

            seq = String.fromCharCode(parseInt(seq, 8));
            seq = convertSeqToString(seq);
        } else if (this.cur === "x") {
            seq = "";
            for (let i = 0; i < 2 && /^[0-9a-fA-F]$/.test(this.peek); i++) {
                this.movePosition();
                seq += this.cur;
            }

            if (seq.length === 0) throw new Error(`Invalid escape sequence: \\x`);

            this.movePosition();

            seq = String.fromCharCode(parseInt(seq, 16));
            seq = convertSeqToString(seq);
        } else if (this.cur === "u") {
            seq = "";
            for (let i = 0; i < 4 && /^[0-9a-fA-F]$/.test(this.peek); i++) {
                this.movePosition();
                seq += this.cur;
            }

            if (seq.length === 0) throw new Error(`Invalid escape sequence: \\u`);

            this.movePosition();

            if (seq.length === 4 && /^\\u[0-9a-fA-F]{4}$/.test(this.peekNextNChars(6))) {
                const low = parseInt(this.peekNextNChars(6).substring(2), 16);
                const high = parseInt(seq, 16);

                if (0xD800 <= high && high <= 0xDBFF &&
                    0xDC00 <= low && low <= 0xDFFF) {
                    const code =
                        (high - 0xD800) * 0x400 +
                        (low - 0xDC00) +
                        0x10000;

                    seq = String.fromCodePoint(code);

                    for (let i = 0; i < 6; i++)
                        this.movePosition();
                } else {
                    seq = String.fromCharCode(parseInt(seq, 16));
                }
            } else {
                seq = String.fromCharCode(parseInt(seq, 16));
            }

            seq = convertSeqToString(seq);
        } else if (this.cur === "U") {
            seq = "";
            for (let i = 0; i < 8 && /^[0-9a-fA-F]$/.test(this.peek); i++) {
                this.movePosition();
                seq += this.cur;
            }

            if (seq.length === 0) throw new Error(`Invalid escape sequence: \\U`);

            this.movePosition();

            seq = String.fromCodePoint(parseInt(seq, 16));
            seq = convertSeqToString(seq);
        } else if (this.cur === "\n") {
            seq = "";
        } else {
            switch (this.cur) {
                case "a": seq = "\a"; break;
                case "b": seq = "\b"; break;
                case "t": seq = "\t"; break;
                case "n": seq = "\n"; break;
                case "v": seq = "\v"; break;
                case "f": seq = "\f"; break;
                case "r": seq = "\r"; break;
                case "e": seq = "\x1b"; break;
                case "\"": seq = "\""; break;
                case "\'": seq = "'"; break;
                case "\\": seq = "\\"; break;
            }

            this.movePosition();
        }

        return seq;
    }

    private readStringTok(): { result: Token, code: PartialExitCode } {
        let str = "";
        let quote = this.cur;
        const col = this.col;
        const row = this.row;
        this.movePosition();

        while (this.cur) {
            if (this.cur === quote) {
                this.movePosition();
                break;
            }

            if (this.cur === "\\") {
                str += this.readStringEscapeSeq();
                continue;
            }

            if (!this.peek) {
                return {
                    result: TokenError("Missing closing \"", row, col),
                    code: PartialExitCode.INCOMPLETE
                };
            }

            str += this.cur;

            this.movePosition();
        }

        return {
            result: TokenStr(str, row, col),
            code: PartialExitCode.SUCCESS
        };
    }

    private readIdentTok(): { result: Token, code: PartialExitCode } {
        let lit = "";
        const col = this.col;
        const row = this.row;

        if (
            Lexer.isNumeric(this.cur) ||
            Lexer.isWhitespace(this.cur) ||
            Lexer.isQuote(this.cur) ||
            CHAR_TOK_MAP[this.cur]
        ) {
            this.movePosition();
            return {
                result: TokenError(ErrorTokenLiteral.INVALID_IDENT_NAME, row, col),
                code: PartialExitCode.ERROR
            };
        }

        while (
            this.cur &&
            !Lexer.isWhitespace(this.cur) &&
            !Lexer.isQuote(this.cur) &&
            !CHAR_TOK_MAP[this.cur]
        ) {
            lit += this.cur;
            this.movePosition();
        }

        if (this.builtins.has(lit)) {
            const { type, literal } = this.builtins.get(lit)!;
            return { result: new Token(type, literal, row, col), code: PartialExitCode.SUCCESS }
        } else {
            return { result: TokenIdent(lit, row, col), code: PartialExitCode.SUCCESS }
        }
    }

    private readSymbolTok(): { result: Token, code: PartialExitCode } {
        let lit = "";
        const col = this.col;
        const row = this.row;
        let quoted = false;

        // Any assertion to prevent overly specific type narrowing.
        if ((this.cur as any) !== "'") {
            return {
                result: TokenError(ErrorTokenLiteral.INVALID_SYMBOL_LITERAL, row, col),
                code: PartialExitCode.ERROR
            };
        }

        this.movePosition();
        this.skipWhitespace();

        // TODO: This does not allow for escaped pipes within quoted symbols.
        if (this.cur === "|") {
            quoted = true;
            this.movePosition();
        }

        if (this.cur === "#") {
            if (this.peek === "%") {
                lit = "#%";
                this.movePosition();
                this.movePosition();
            } else {
                return {
                    result: TokenError(ErrorTokenLiteral.ILLEGAL_SYMBOL_HASH_START, row, col),
                    code: PartialExitCode.ERROR
                };
            }
        }

        while (
            this.cur &&
            !Lexer.isIllegalSymbolChar(this.cur, quoted)
        ) {
            lit += this.cur;
            this.movePosition();
        }

        if (quoted) {
            if (this.cur !== "|")
                return {
                    result: TokenError(ErrorTokenLiteral.INVALID_SYMBOL_LITERAL, row, col),
                    code: PartialExitCode.ERROR
                };

            this.movePosition();
        }

        if (lit === "." || lit === "") {
            return {
                result: TokenError(ErrorTokenLiteral.INVALID_SYMBOL_LITERAL, row, col),
                code: PartialExitCode.ERROR
            };
        }

        return { result: TokenSym(lit, row, col), code: PartialExitCode.SUCCESS };
    }

    private readCharTok(): { result: Token, code: PartialExitCode } {
        function convertCharToString(ch: string) {
            const code = ch.codePointAt(0)!;

            switch (code) {
                case 0: return "nul";
                case 8: return "backspace";
                case 9: return "tab";
                case 10: return "newline";
                case 11: return "vtab";
                case 12: return "page";
                case 13: return "return";
                case 32: return "space";
                case 127: return "rubout";
            }

            if (!/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(ch)) {
                return ch;
            }

            const hex = code.toString(16).toUpperCase();
            const prefix = (code <= 0xFFFF ? "\\u" : "\\U");
            return prefix + hex.padStart(code <= 0xFFFF ? 4 : 8, "0");
        }

        const col = this.col;
        const row = this.row;

        if (!/\#\\./.test(this.peekNextNChars(3)))
            return {
                result: TokenError(ErrorTokenLiteral.INVALID_CHARACTER_LITERAL, row, col),
                code: PartialExitCode.ERROR
            }

        this.movePosition();
        this.movePosition();
        let ch = "";

        do {
            ch += this.cur;
            this.movePosition();
        } while (
            this.cur &&
            !Lexer.isWhitespace(this.cur) &&
            !Lexer.isQuote(this.cur) &&
            !CHAR_TOK_MAP[this.cur]
        )

        switch (ch.toLowerCase()) {
            case "nul": ch = "nul"; break;
            case "null": ch = "nul"; break;
            case "backspace": ch = "backspace"; break;
            case "tab": ch = "tab"; break;
            case "newline": ch = "newline"; break;
            case "linefeed": ch = "newline"; break;
            case "vtab": ch = "vtab"; break;
            case "page": ch = "page"; break;
            case "return": ch = "return"; break;
            case "space": ch = "space"; break;
            case "rubout": ch = "rubout"; break;
            default: {
                if (/^[0-3][0-7]{2}$/.test(ch)) {
                    ch = convertCharToString(String.fromCharCode(parseInt(ch, 8)));
                } else if (ch[0] === "u" || ch[0] === "U") {
                    let hex = ch.substring(1);

                    if (!/^[0-9A-Fa-f]{1,8}$/.test(hex))
                        throw new Error(`Invalid unicode character literal: #\\${ch}`);

                    let int = parseInt(hex, 16);

                    ch = convertCharToString(String.fromCodePoint(int));
                } else if (ch.length > 1) {
                    throw new Error(`Invalid character literal: #\\${ch}`)
                }

                ch = convertCharToString(ch);
            }
        }

        return { result: TokenChar(`${ch}`, row, col), code: PartialExitCode.SUCCESS };
    }

    static isWhitespace(ch: string): boolean { return /\s/.test(ch); }
    static isNumeric(ch: string): boolean { return /[\d.]/.test(ch); }
    static isQuote(ch: string): boolean { return /["`]/.test(ch); }
    static isIllegalSymbolChar(ch: string, quoted: boolean = false): boolean { return (quoted ? /[|]/ : /[()[\]{}",'`;|\\\s]/).test(ch); }

    private readonly builtins = new Map<string, { type: TokenType, literal: string }>([
        ["#t", { type: TokenType.BOOL, literal: BOOL_TRUE }],
        ["#T", { type: TokenType.BOOL, literal: BOOL_TRUE }],
        ["#f", { type: TokenType.BOOL, literal: BOOL_FALSE }],
        ["#F", { type: TokenType.BOOL, literal: BOOL_FALSE }],
    ])
};

// TODO: Allow for multiple top-level expressions.
// TODO: Improve error handling.
// TODO: Add fraction output rather than decimal.
// TODO: Use custom math functions. e.g. sqrt(-1) -> i instead of NaN
// TODO: Full number support according to Scheme/Racket standards
// TODO: Add REPL commands. (e.g. ,exit ,help)

const enum KeyPress {
    ETX = "\u0003",
    EOT = "\u0004",
    HT = "\u0009",
    LF = "\u000a",
    VT = "\u000b",
    FF = "\u000c",
    CR = "\u000d",
    DEL = "\u007f",
    UP = "\u001b[A",
    DOWN = "\u001b[B",
    RIGHT = "\u001b[C",
    LEFT = "\u001b[D",
};

function REPL(use_hist = true) {
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    else throw new Error("This REPL requires a TTY.");

    process.stdin.setEncoding("utf8");
    process.stdin.resume();

    process.on("SIGINT", exit.bind(null, { exit: true }));
    process.on("SIGUSR1", exit.bind(null, { exit: true }));
    process.on("SIGUSR2", exit.bind(null, { exit: true }));
    process.on("uncaughtException", err => {
        console.error(err);
        exit({ exit: true }, 1);
    });

    let buffer: string[] = [""];
    let cursor_line = 0;
    let cursor_col = 0;
    let current_hist = -1;
    let last_rendered: string[] = [];
    let last_rendered_lines = 0;
    let last_cursor_line = 0;

    const hist = use_hist ? loadREPLHistory() : [];
    const temp_hist_buffers = new Map<number, string[]>();

    const l = new Lexer();
    const p = new Parser();
    const e = new Evaluator();

    const repl_stdout = new Output();
    const env = new BracketEnvironment(REPL_ENVIRONMENT_LABEL, undefined, repl_stdout);

    function insertChar(ch: string): void {
        if (ch === "\n") {
            const before = buffer[cursor_line].slice(0, cursor_col);
            const after = buffer[cursor_line].slice(cursor_col);
            buffer[cursor_line] = before;
            cursor_line++;
            cursor_col = 0;
            buffer.splice(cursor_line, 0, after);
        } else {
            buffer[cursor_line] =
                buffer[cursor_line].slice(0, cursor_col) +
                ch +
                buffer[cursor_line].slice(cursor_col);
            cursor_col += ch.length;
        }

        temp_hist_buffers.set(current_hist, buffer);
    }

    function isEnter(key: string): boolean {
        return key === KeyPress.CR || key === KeyPress.LF;
    }

    function isEnd(key: string): boolean {
        return key === KeyPress.EOT || key === KeyPress.ETX;
    }

    function loadREPLHistory(): string[][] {
        if (!REPL_HISTORY_FILE || !fs.existsSync(REPL_HISTORY_FILE)) return [];

        const lines = fs.readFileSync(REPL_HISTORY_FILE, "utf8")
            .split(/(?<!:)::\n/)
            .filter(v => v !== "");

        return lines
            .filter(l => REPL_LOAD_COMMANDS_FROM_HIST || l[0] !== ",")
            .reverse()
            .slice(0, REPL_INPUT_HISTORY_SIZE)
            .map(l => l.replaceAll("::::", "::").split("\n"));
    }

    function appendREPLHistory(current_buffer: string[]): void {
        if (hist.at(0) === current_buffer) return;
        const escaped = current_buffer.map(line => line.replaceAll("::", "::::"));

        fs.appendFileSync(REPL_HISTORY_FILE, escaped + "::\n");
        hist.unshift(current_buffer);
    }

    function getHistEntry(idx: number): string[] {
        if (temp_hist_buffers.has(idx))
            return temp_hist_buffers.get(idx)!;

        return idx >= hist.length ? [""] : hist[idx];
    }

    function REPLRunWithVerbosity(verbosity: number, callback: () => void): void {
        if (REPL_VERBOSITY < verbosity) return;
        callback();
    }

    function stdoutFlush() {
        STDOUT.write(env.stdout.buffer);
        env.stdout.reset();
    }

    function evaluate(expr: string): { result: Token, code: PartialExitCode, ast: ASTNode } {
        let ret: { result: Token, code: PartialExitCode, ast: ASTNode };

        try {
            const { result: toks, code: lex_code } = l.lex(expr);
            if (lex_code !== PartialExitCode.SUCCESS) {
                ret = {
                    result: toks.at(-1) ?? TokenError("lexer error"),
                    code: lex_code,
                    ast: new ASTSExprNode()
                };
                return ret;
            }

            const { result: ast, code: parse_code } = p.parse(toks);
            if (parse_code !== PartialExitCode.SUCCESS) {
                ret = {
                    result:
                        ast instanceof ASTLiteralNode && ast.tok.type === TokenType.ERROR
                            ? ast.tok
                            : TokenError("parser error"),
                    code: parse_code,
                    ast
                };
                return ret;
            }

            const value = e.evaluate(ast, env);

            appendREPLHistory(expr.split("\n"));
            ret = { result: value, code: PartialExitCode.SUCCESS, ast };
        } catch (err) {
            ret = {
                result: TokenError(`${env.label} ${((err as any).message ?? String(err))}`),
                code: PartialExitCode.ERROR,
                ast: new ASTSExprNode()
            };

            if (REPL_HIST_APPEND_ERRORS)
                appendREPLHistory(expr.split("\n"));
            return ret;
        }

        return ret;
    }

    function restoreTerminal(): void {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
            process.stdin.pause();
        }
    }

    function exit(options?: { exit: boolean }, code = 0): void {
        if ((!options || options.exit) && code === 0 && REPL_BANNER_ENABLED) {
            STDOUT.write(`\n${GOODBYE_MESSAGE}\n`);
        }

        restoreTerminal();
        if (options?.exit) process.exit(code);
    }

    function commitBuffer(): void {
        const input = buffer.join("\n");
        let final_result: Token = TokenVoid();

        if (input === "") {
            STDOUT.write("\n");
            render();
            return;
        }

        const before_count = env.stdout.write_count;

        const { result, code, ast } = evaluate(input);

        switch (code) {
            case PartialExitCode.SUCCESS:
                final_result = result;
                break;
            case PartialExitCode.ERROR:
                final_result = result;
                break;
            case PartialExitCode.INCOMPLETE:
                insertChar("\n");
                render();
                return;
        }

        STDOUT.write("\n");

        stdoutFlush();

        REPLRunWithVerbosity(2, () => {
            printDeep(ast);
        });

        REPLRunWithVerbosity(1, () => {
            printDeep(final_result);
        });

        if (final_result.type !== TokenType.EOF && final_result.type !== TokenType.VOID) {
            STDOUT.write(final_result.toString());
        }

        const wrote_output = env.stdout.write_count !== before_count;

        if (wrote_output || (final_result && final_result.type !== TokenType.VOID && final_result.type !== TokenType.EOF))
            STDOUT.write("\n");

        buffer = [""];
        temp_hist_buffers.clear();
        current_hist = -1;
        cursor_line = 0;
        cursor_col = 0;
        // last_rendered = [];
        // last_cursor_line = 0;

        render();
    }

    function backspace(): void {
        // if (cursor_col === 0) {
        //     if (cursor_line === 0) return;
        //     const prev = buffer[cursor_line - 1];
        //     buffer[cursor_line - 1] += buffer[cursor_line];
        //     buffer.splice(cursor_line, 1);
        //     cursor_line--;
        //     cursor_col = Math.max(prev.length, 0);
        //     return;
        // };

        if (cursor_col === 0) return;

        buffer[cursor_line] =
            buffer[cursor_line].slice(0, cursor_col - 1) +
            buffer[cursor_line].slice(cursor_col);
        cursor_col--;

        temp_hist_buffers.set(current_hist, buffer);
    }

    // TODO: Split current input, only check current ident and only at cursor position
    function getAutocomplete() {
        const keys = [...env.bindings.keys(), ...env.builtins.keys()];
        const full = keys.find(v => v.startsWith(buffer[cursor_line].substring(0, cursor_col))) ?? "";
        const suffix = full?.substring(cursor_col);

        return { full, suffix, write_count: full.length - suffix.length };
    }

    function moveCursorLeft(): void {
        if (cursor_col > 0) {
            cursor_col--;
        } else if (cursor_line > 0) {
            // cursor_line--;
            // cursor_col = Math.max(buffer[cursor_line].length, 0);
        }
    }

    function moveCursorRight(): void {
        if (cursor_col < buffer[cursor_line].length) {
            cursor_col++;
        } else if (cursor_line < buffer.length - 1) {
            // cursor_line++;
            // cursor_col = 0;
        }
    }

    function moveCursorUp(): void {
        if (cursor_line > 0) {
            cursor_line--;
            cursor_col = Math.min(cursor_col, buffer[cursor_line].length);
        }
    }

    function moveCursorDown(): void {
        if (cursor_line < buffer.length - 1) {
            cursor_line++;
            cursor_col = Math.min(cursor_col, buffer[cursor_line].length);
        }
    }

    // function render(): void {
    //     if (last_cursor_line > 1) {
    //         STDOUT.write(`\u001b[${last_cursor_line - 1}A`);
    //     }
    //     STDOUT.write("\r");
    //
    //     let first_diff = 0;
    //     while (
    //         first_diff < last_rendered.length &&
    //         first_diff < buffer.length &&
    //         last_rendered[first_diff] === buffer[first_diff]
    //     ) {
    //         first_diff++;
    //     }
    //
    //     if (first_diff > 0)
    //         STDOUT.write(`\u001b[${first_diff}B`);
    //
    //     const dy = (last_rendered.length - 1) - first_diff;
    //     if (dy > 0) STDOUT.write(`\u001b[${dy}A`);
    //     STDOUT.write("\r");
    //
    //     for (let i = first_diff; i < buffer.length; i++) {
    //         STDOUT.write("\r\u001b[2K");
    //         STDOUT.write(i === 0 ? REPL_PROMPT : REPL_CONTINUATION_PROMPT);
    //         STDOUT.write(buffer[i]);
    //         if (i + 1 < buffer.length) STDOUT.write("\n");
    //     }
    //
    //     for (let i = buffer.length; i < last_rendered.length; i++) {
    //         STDOUT.write("\r\u001b[2K\n");
    //     }
    //
    //     const to_top = buffer.length - 1;
    //     if (to_top > 0) STDOUT.write(`\u001b[${to_top}A`);
    //
    //     if (cursor_line > 0) {
    //         STDOUT.write(`\u001b[${cursor_line}B`);
    //     }
    //
    //     const prompt_width = cursor_line === 0 ? REPL_PROMPT.length : REPL_CONTINUATION_PROMPT.length;
    //
    //     STDOUT.write(`\r\u001b[${prompt_width + cursor_col}C`);
    //
    //     // if (REPL_AUTOCOMPLETE && str !== "") {
    //     //     const autocomplete = getAutocomplete();
    //     //     STDOUT.write(`\u001b[38;5;${REPL_AUTOCOMPLETE_GHOST_COLOR}m`);
    //     //     STDOUT.write(autocomplete.suffix);
    //     //     STDOUT.write("\u001b[0m");
    //     // }
    //
    //     last_rendered = buffer.slice();
    //     last_rendered_lines = cursor_line;
    // }

    function render(): void {
        STDOUT.write("\r\u001b[2K");
        STDOUT.write(REPL_PROMPT + buffer[0]);
        STDOUT.write(`\r\u001b[${REPL_PROMPT.length + cursor_col}C`);
    }

    function clear(): void {
        STDOUT.write("\r\u001b[2J\u001b[H");
        last_rendered = [];
        last_cursor_line = 0;
    }

    process.stdin.on("data", data => {
        const key_str = String(data);

        if (isEnd(key_str)) {
            if (buffer[cursor_line].length === 0) {
                exit({ exit: true }, 0);
            } else {
                temp_hist_buffers.set(-1, [""]);
                current_hist = -1;
                buffer = getHistEntry(-1);
                cursor_line = 0;
                cursor_col = 0;
                render();
                return;
            }
        }

        if (isEnter(key_str)) {
            commitBuffer();
            return;
        }

        if (key_str === KeyPress.FF) {
            clear();
            render();
            return;
        }

        if (key_str === KeyPress.DEL) {
            backspace();
            render();
            return;
        }

        if (key_str === KeyPress.HT) {
            if (!REPL_AUTOCOMPLETE) return;
            const autocomplete = getAutocomplete();
            const start_pos = Math.max(0, cursor_col - autocomplete.write_count);
            buffer[cursor_line] =
                buffer[cursor_line].slice(0, start_pos) +
                autocomplete.full +
                buffer[cursor_line].slice(start_pos + autocomplete.write_count);

            cursor_col = buffer.length;
            render();
            return;
        }

        if (key_str === KeyPress.UP) {
            if (!use_hist) return;

            if (current_hist >= hist.length) return;
            buffer = getHistEntry(++current_hist);

            cursor_line = buffer.length - 1;
            cursor_col = buffer[cursor_line].length;

            render();
            return;
        }

        if (key_str === KeyPress.DOWN) {
            if (!use_hist) return;

            if (current_hist < 0) return;
            current_hist--;

            if (current_hist === -1) {
                buffer = temp_hist_buffers.get(-1) ?? [""];
            } else {
                buffer = getHistEntry(current_hist);
            }

            cursor_line = 0;
            cursor_col = buffer[cursor_line].length;

            render();
            return;
        }

        // if (key_str === KeyPress.UP) {
        //     moveCursorUp();
        //     render();
        //     return;
        // }
        //
        // if (key_str === KeyPress.DOWN) {
        //     moveCursorDown();
        //     render();
        //     return;
        // }

        if (key_str === KeyPress.RIGHT) {
            moveCursorRight();
            render();
            return;
        }

        if (key_str === KeyPress.LEFT) {
            moveCursorLeft();
            render();
            return;
        }

        if (key_str < " " || key_str === "\u007f") return;

        insertChar(key_str);
        render();
    });

    if (REPL_BANNER_ENABLED)
        STDOUT.write(`${WELCOME_MESSAGE}\n`);

    render();
}

function runFile(filepath: string, env?: BracketEnvironment) {
    if (!filepath)
        throw new Error("a valid filepath must be provided");

    const fp = path.resolve(filepath);
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile())
        throw new Error(`${fp} does not exist or is not a file`);

    const env_stdout = new Output();
    if (!env) env = new BracketEnvironment(path.relative(fp, "."), undefined, env_stdout);

    const contents = fs.readFileSync(fp, "utf8");

    const l = new Lexer();
    const p = new Parser();
    const e = new Evaluator();

    const { result: toks, code: lex_code } = l.lex(contents);
    if (lex_code !== PartialExitCode.SUCCESS) throw new Error(`lexer error`); // FIXME: error handling

    const { result: ast, code: parse_code } = p.parse(toks);
    if (parse_code !== PartialExitCode.SUCCESS) throw new Error(`parser error`);

    const result = e.evaluate(ast, env);

    STDOUT.write(env.stdout.buffer);
    env.stdout.reset()

    if (result.type !== TokenType.EOF && result.type !== TokenType.VOID) {
        STDOUT.write(result.toString());
    }

    STDOUT.write("\n");
}

////////////////////////////////////////////////////

// runFile(process.argv[2]);
REPL();

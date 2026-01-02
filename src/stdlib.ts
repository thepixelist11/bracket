import { BuiltinFunction } from "./evaluator.js";
import { TokenType, TokenIdent, Token, TokenList, TokenNum, TokenBool, TokenVoid, TokenProc } from "./token.js";
import { BOOL_FALSE, TOKEN_PRINT_TYPE_MAP } from "./globals.js";
import { ASTNode, ASTLiteralNode, ASTSExprNode, ASTVoid, ASTProcedureNode, ASTIdent, ASTBool } from "./ast.js";
import { BracketEnvironment } from "./env.js";
import { Evaluator } from "./evaluator.js";

export const STDLIB = new Map<string, BuiltinFunction>([
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
            if (args.length === 0) return ASTBool(true);
            if (args.length === 1) return args[0];
            return new ASTSExprNode(
                ASTIdent("if"),
                args[0],
                new ASTSExprNode(
                    ASTIdent("and"),
                    ...args.slice(1)
                ),
                ASTBool(false),
            );
        }
    }],
    ["or", {
        macro: true,
        variadic: true,
        min_args: 0,
        expander: (args: ASTNode[]): ASTNode => {
            if (args.length === 0) return ASTBool(false);
            if (args.length === 1) return args[0];
            return new ASTSExprNode(
                ASTIdent("if"),
                args[0],
                ASTBool(true),
                new ASTSExprNode(
                    ASTIdent("or"),
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
                ASTIdent("if"),
                args[0],
                ...args.slice(1),
                ASTVoid(),
            );
        }
    }],
    ["unless", {
        macro: true,
        variadic: true,
        min_args: 2,
        expander: (args: ASTNode[]): ASTNode => {
            return new ASTSExprNode(
                ASTIdent("if"),
                new ASTSExprNode(
                    TokenIdent("not"),
                    args[0],
                ),
                ...args.slice(1),
                ASTVoid(),
            );
        }
    }],
    ["cond", {
        macro: true,
        variadic: true,
        min_args: 0,
        expander: (args: ASTNode[]): ASTNode => {
            if (args.length === 0)
                return ASTVoid();

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
                ASTIdent("if"),
                test,
                value,
                rest.length > 0 ? new ASTSExprNode(
                    TokenIdent("cond"),
                    ...rest,
                ) : ASTVoid(),
            )
        }
    }],
    ["begin", {
        macro: true,
        variadic: true,
        min_args: 0,
        expander: (args: ASTNode[]): ASTNode => {
            if (args.length === 0) return ASTVoid();
            if (args.length === 1) return args[0];

            return new ASTSExprNode(
                new ASTSExprNode(
                    ASTIdent("lambda"),
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
                    ASTIdent("begin"),
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
                    ASTIdent("lambda"),
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
        special_fn: evalSet,
    }],
    ["else", { fn: () => { throw new Error("else: not allowed as an expression") }, ret_type: TokenType.ERROR, arg_type: [TokenType.ANY], min_args: 0, variadic: true }],
    ["if", { special: true, special_fn: evalIf }],
    ["define", { special: true, special_fn: evalDefine }],
    ["lambda", { special: true, special_fn: evalLambda }],
    ["λ", { special: true, special_fn: evalLambda }],
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

function evalIf(args: ASTNode[], env: BracketEnvironment): Token {
    if (args.length !== 3)
        throw new Error(`if: expected 3 arguments, got ${args.length} arguments`);

    const cond = Evaluator.evalExpanded(args[0], env);

    return cond.literal !== BOOL_FALSE
        ? Evaluator.evalExpanded(args[1], env)
        : Evaluator.evalExpanded(args[2], env);
}

function evalSet(args: ASTNode[], env: BracketEnvironment): Token {
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

function evalDefine(args: ASTNode[], env: BracketEnvironment): Token {
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

    return ASTVoid().tok;
}

function evalLambda(args: ASTNode[], env: BracketEnvironment): Token {
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

import { BuiltinFunction } from "./evaluator.js";
import { TokenType, TokenIdent, Token, TokenList, TokenNum, TokenBool, TokenVoid, TokenProc, BOOL_FALSE, TokenMetadata, TOKEN_PRINT_TYPE_MAP, TokenError, TokenStr, TokenSym, RuntimeSymbol, TokenUninternedSym } from "./token.js";
import { BUILTIN_CUSTOM_SET, FEAT_SYS_EXEC, InterpreterContext, LANG_NAME } from "./globals.js";
import { ASTNode, ASTLiteralNode, ASTSExprNode, ASTVoid, ASTProcedureNode, ASTIdent, ASTBool, ASTStr } from "./ast.js";
import { BracketEnvironment } from "./env.js";
import { Evaluator } from "./evaluator.js";
import { printDeep, toDisplay } from "./utils.js";

function resolveName(names: string[]) {
    return [LANG_NAME.toLowerCase(), ...names].join(".");
}

export type BuiltinSet = { builtins: Map<string, BuiltinFunction>, imports: string[], names: string[] };
export class Builtins {
    map: Map<string, BuiltinSet> = new Map<string, BuiltinSet>([
        [BUILTIN_CUSTOM_SET, { names: [BUILTIN_CUSTOM_SET], imports: [], builtins: new Map() }]
    ]);

    associations: Map<string, string> = new Map();

    constructor(builtin_sets: BuiltinSet[]) {
        for (const set of builtin_sets) {
            const resolved = resolveName(set.names);

            if (set.names.some(n => n.includes("."))) {
                console.warn(`Could not include module "${resolved}". Periods are not allowed in module names`);
                continue;
            }

            if (set.names.length > 0 && set.names[0].startsWith("__")) {
                console.warn(`Could not include module "${resolved}". Module names of the form __NAME are reserved for internal use.`);
                continue;
            }

            if (this.map.has(resolved)) {
                console.warn(`Found duplicate module "${resolved}". Using the original module.`);
                continue;
            }

            this.map.set(resolved, set);

            for (const builtin of set.builtins.keys())
                this.associations.set(builtin, resolved);
        }
    }

    include() { } // TODO: Dependency resolution

    get(name: string) {
        const resolved = this.associations.get(name);

        if (resolved)
            return this.map.get(resolved)!.builtins.get(name);

        return undefined;
    }

    set(name: string, builtin_fn: BuiltinFunction, unresolved_names: string[] = [BUILTIN_CUSTOM_SET]) {
        const resolved = this.associations.get(name);

        if (!resolved) {
            const new_resolved = resolveName(unresolved_names);
            let builtin_custom_set = this.map.get(new_resolved);

            if (!builtin_custom_set) {
                this.map.set(
                    new_resolved, { names: new_resolved.split("."), imports: [], builtins: new Map() }
                );

                builtin_custom_set = this.map.get(new_resolved);
            }

            builtin_custom_set!.builtins.set(name, builtin_fn);
            this.associations.set(name, new_resolved);
        } else {
            this.map.get(resolved)!.builtins.set(name, builtin_fn);
        }
    }

    has(name: string) {
        const resolved = this.associations.get(name);
        return resolved !== undefined;
    }

    delete(name: string) {
        const resolved = this.associations.get(name);

        if (resolved) {
            const deleted =
                this.map.get(resolved)!.builtins.delete(name) &&
                this.associations.delete(name);

            return deleted;
        }

        return false;
    }

    keys() {
        return this.associations.keys();
    }

    get modules() { return Array.from(this.map.keys()); }
};

const STDLIB: BuiltinSet = {
    names: [],
    imports: [],
    builtins: new Map<string, BuiltinFunction>([
        ["identity", { fn: (x) => x, ret_type: TokenType.ANY, arg_type: [TokenType.ANY], min_args: 1, pure: true, doc: "Produces its argument unchanged.", arg_names: ["x"] }],
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
            },
            doc: "Evaluates the body expressions when the test expression is not false; otherwise produces void.",
            arg_names: ["test", "bodies"]
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
            },
            doc: "Evaluates the body expressions when the test expression is false; otherwise produces void.",
            arg_names: ["test", "bodies"]
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
            },
            doc: "Evaluates test-value clauses in order and produces the value of the first clause who's test is not false. An else clause matches unconditionally.",
            arg_names: ["test-value-pairs"]
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
            doc: "Evaluates expressions in order and produces the value of the last expression.",
            arg_names: ["bodies"]
        }],
        ["local", {
            macro: true,
            variadic: true,
            min_args: 2,
            expander: (args: ASTNode[]): ASTNode => {
                if (!(args[0] instanceof ASTSExprNode))
                    throw new Error(`local: bad syntax; not a definition sequence`);

                const definitions = args[0].elements;
                const bodies = args.slice(1);

                if (definitions.some(d => {
                    return !(
                        d instanceof ASTSExprNode &&
                        d.first instanceof ASTLiteralNode &&
                        d.first.tok.literal === "define"
                    )
                })) {
                    throw new Error(`local: not a definition`);
                }

                return new ASTSExprNode(
                    ASTIdent("begin"),
                    ...definitions,
                    ...bodies
                );
            },
            doc: "Introduces local definitions only visible within the body expressions.",
            arg_names: ["definition-sequence", "bodies"]
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
            },
            doc: "Binds identifiers to values and evaluates the body expressions with those bindings.",
            arg_names: ["bindings", "bodies"]
        }],
        ["set!", {
            special: true,
            special_fn: evalSet,
            doc: "Mutates an existing binding to refer to a new value.",
            arg_names: ["ident", "value"]
        }],
        ["else", { fn: () => { throw new Error("else: not allowed as an expression") }, ret_type: TokenType.ERROR, arg_type: [TokenType.ANY], min_args: 0, variadic: true, doc: "For use with cond." }],
        ["if", { special: true, special_fn: evalIf, doc: "Evaluates the test expression and evaluates the `if` branch if not false and the `then` branch otherwise.", arg_names: ["test", "if", "then"] }],
        ["define", { special: true, special_fn: evalDefine, doc: "Binds a value to an identifier in the current environment.", arg_names: ["ident", "value"] }],
        ["lambda", { special: true, special_fn: evalLambda, doc: "Produces a procedure with the given parameters and body.", arg_names: ["parameter-list", "bodies"] }],
        ["λ", { special: true, special_fn: evalLambda, doc: "Produces a procedure with the given parameters and body.", arg_names: ["parameter-list", "bodies"] }],
        ["eq?", {
            min_args: 2,
            raw: ["token", "token"],
            ret_type: TokenType.BOOL,
            arg_type: [TokenType.ANY, TokenType.ANY],
            pure: true,
            fn: (a, b) => {
                if (a.type !== b.type) return false;

                switch (a.type) {
                    case TokenType.LIST:
                    case TokenType.PROCEDURE:
                        return a.value === b.value;

                    case TokenType.SYM:
                        return a.value.id === b.value.id;

                    case TokenType.NUM:
                    case TokenType.STR:
                    case TokenType.CHAR:
                    case TokenType.BOOL:
                        return a.literal === b.literal;

                    case TokenType.VOID:
                        return true;

                    default:
                        return a === b;
                }
            },
            doc: "Produces true if a and b are the same object or represent the same immediate value.",
            arg_names: ["a", "b"]
        }],
        ["eqv?", {
            min_args: 2,
            raw: ["token", "token"],
            ret_type: TokenType.BOOL,
            arg_type: [TokenType.ANY, TokenType.ANY],
            pure: true,
            fn: (a, b) => {
                if (a.type !== b.type) return false;

                switch (a.type) {
                    case TokenType.LIST:
                    case TokenType.PROCEDURE:
                        return a.value === b.value;

                    case TokenType.SYM:
                        return a.value.id === b.value.id;

                    case TokenType.NUM:
                    case TokenType.STR:
                    case TokenType.CHAR:
                    case TokenType.BOOL:
                        return a.literal === b.literal;

                    case TokenType.VOID:
                        return true;

                    default:
                        return a === b;
                }
            },
            doc: "Produces true if a and b are the same atomic value or the same object.",
            arg_names: ["a", "b"]
        }],
        ["equal?", {
            min_args: 2,
            raw: ["token", "token"],
            ret_type: TokenType.BOOL,
            arg_type: [TokenType.ANY, TokenType.ANY],
            pure: true,
            fn: function equal(a, b): boolean {
                if (a.type !== b.type) return false;

                switch (a.type) {
                    case TokenType.PROCEDURE:
                        return a.value === b.value;

                    case TokenType.LIST: {
                        const xs = a.value as Token[];
                        const ys = b.value as Token[];

                        if (xs.length !== ys.length) return false;

                        for (let i = 0; i < xs.length; i++) {
                            if (!equal(xs[i], ys[i])) return false;
                        }

                        return true;
                    }

                    case TokenType.SYM:
                        return a.value.id === b.value.id;

                    case TokenType.NUM:
                    case TokenType.STR:
                    case TokenType.CHAR:
                    case TokenType.BOOL:
                    case TokenType.IDENT:
                        return a.literal === b.literal;

                    case TokenType.VOID:
                        return true;

                    default:
                        return false;
                }
            },
            doc: "Produces true if a and b are of the same structure or atomic value.",
            arg_names: ["a", "b"]
        }],
        ["swap!", {
            macro: true,
            min_args: 2,
            expander: (args: ASTNode[]): ASTNode => {
                const [a, b] = args;
                const tmp = ASTIdent(TokenUninternedSym());

                return new ASTSExprNode(
                    ASTIdent("let"),
                    new ASTSExprNode(
                        new ASTSExprNode(tmp, a),
                    ),
                    new ASTSExprNode(ASTIdent("set!"), a, b),
                    new ASTSExprNode(ASTIdent("set!"), b, tmp),
                );
            },
            doc: "Exchanges the values of two mutable bindings.",
            arg_names: ["a", "b"]
        }],
        ["error", {
            min_args: 1,
            variadic: true,
            raw: ["token"],
            ret_type: TokenType.ERROR,
            arg_type: [TokenType.ANY],
            fn: (...parts: Token[]) => {
                const parts_str = parts.map(p => toDisplay(p));
                throw parts_str.join(" ");
            },
            doc: "Throws an error with its message being the space-delimited concatenation of all arguments printed as printed by display.",
            arg_names: ["parts"]
        }],
        ["void", {
            min_args: 0,
            variadic: true,
            ret_type: TokenType.VOID,
            arg_type: [TokenType.ANY],
            fn: () => TokenVoid(),
            doc: "Produces a void literal.",
            arg_names: []
        }],
        ["symbol?", { fn: (x) => x.type === TokenType.SYM, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, raw: ["token"], pure: true, doc: "Produces true if x is a symbol.", arg_names: ["x"] }],
        ["gensym", {
            min_args: 0,
            variadic: true,
            ret_type: TokenType.ANY,
            arg_type: [TokenType.ANY],
            raw: ["token"],
            fn: (base: Token) => {
                if (base === undefined)
                    base = TokenStr("g");

                if (base.type !== TokenType.STR && base.type !== TokenType.SYM)
                    throw new Error(`gensym: expected base to be a Str or a Sym.`);

                return TokenUninternedSym(base.literal, true);
            },
            doc: "Returns a new unique symbol with an automatically generated name. base is used as an optional prefix symbol or string.",
            arg_names: ["base"]
        }],
        ["symbol-interned?", {
            min_args: 1,
            ret_type: TokenType.BOOL,
            arg_type: [TokenType.ANY],
            raw: ["token"],
            fn: (sym: Token<TokenType.SYM>) => sym.value.interned,
            doc: "Returns #t if sym is interned, #f otherwise.",
            arg_names: ["sym"]
        }],
        ["void?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["procedure?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["values", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["call-with-values", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["match", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["case", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
    ])
} as const;

const STDLIB_MATH: BuiltinSet = {
    names: ["math"],
    imports: [],
    builtins: new Map<string, BuiltinFunction>([
        ["+", { fn: (...args) => args.length === 0 ? 0 : args.reduce((acc, v) => acc + v), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 0, variadic: true, pure: true, doc: "Adds numbers from left to right.", arg_names: ["nums"] }],
        ["-", { fn: (...args) => args.length === 1 ? -args[0] : args.reduce((acc, v) => acc - v), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true, doc: "Subtracts numbers from left to right", arg_names: ["nums"] }],
        ["*", { fn: (...args) => args.length === 0 ? 1 : args.reduce((acc, v) => acc * v), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 0, variadic: true, pure: true, doc: "Multiplies numbers from left to right", arg_names: ["nums"] }],
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
            pure: true,
            doc: "Divides numbers from left to right.",
            arg_names: ["nums"]
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
            pure: true,
            doc: "Produces the result of the integer division of a and b. That is, a/b truncated to an integer.",
            arg_names: ["a", "b"]
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
            pure: true,
            doc: "Produces the remainder when a is divided by b with the same sign as a.",
            arg_names: ["a", "b"]
        }],
        ["expt", { fn: (a, b) => a ** b, ret_type: TokenType.NUM, arg_type: [TokenType.NUM, TokenType.NUM], min_args: 2, pure: true, doc: "Produces the result of a^b.", arg_names: ["a", "b"] }],
        ["sqr", { fn: (x) => x * x, ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the square of x.", arg_names: ["x"] }],
        ["sqrt", { fn: (x) => Math.sqrt(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the square root of x.", arg_names: ["x"] }],
        ["cbrt", { fn: (x) => Math.cbrt(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the cube root of x.", arg_names: ["x"] }],
        ["<", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] < v), ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true, doc: "Produces true if the arguments are in strictly increasing order.", arg_names: ["args"] }],
        ["<=", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] <= v), ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true, doc: "Produces true if the arguments are in non-decreasing order.", arg_names: ["args"] }],
        [">", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] > v), ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true, doc: "Produces true if the arguments are in strictly decreasing order.", arg_names: ["args"] }],
        [">=", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] >= v), ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true, doc: "Produces true if the arguments are in non-increasing order.", arg_names: ["args"] }],
        ["=", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] === v), ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true, doc: "Produces true if the arguments are all numerically equal.", arg_names: ["nums"] }],
        ["abs", { fn: (x) => Math.abs(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the absolute value of x.", arg_names: ["x"] }],
        ["floor", { fn: (x) => Math.floor(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produes the greatest integer less than or equal to x.", arg_names: ["x"] }],
        ["ceiling", { fn: (x) => Math.ceil(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the smallest integer greater than or equal to x.", arg_names: ["x"] }],
        ["round", { fn: (x) => Math.round(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the nearest integer to x.", arg_names: ["x"] }],
        ["truncate", { fn: (x) => Math.trunc(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces x truncated towards 0.", arg_names: ["x"] }],
        ["positive?", { fn: (x) => x > 0, ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces true if x is strictly positive.", arg_names: ["x"] }],
        ["negative?", { fn: (x) => x < 0, ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces true if x is strictly negative.", arg_names: ["x"] }],
        ["max", { fn: (...args) => { let m = null; for (const a of args) m = m ? Math.max(a, m) : a; return m }, ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true, doc: "Produces the largest of the given numbers.", arg_names: ["nums"] }],
        ["min", { fn: (...args) => { let m = null; for (const a of args) m = m ? Math.min(a, m) : a; return m }, ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, variadic: true, pure: true, doc: "Produces the smallest of the given numbers.", arg_names: ["nums"] }],
        ["zero?", { fn: (x) => x === 0, ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces true if x is zero.", arg_names: ["x"] }],
        ["even?", { fn: (x) => x % 2 === 0, ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces true if x is even.", arg_names: ["x"] }],
        ["odd?", { fn: (x) => x % 2 === 1, ret_type: TokenType.BOOL, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces true if x is odd.", arg_names: ["x"] }],
        ["add1", { fn: (x) => x + 1, ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces x plus 1.", arg_names: ["x"] }],
        ["sub1", { fn: (x) => x - 1, ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces x minus 1.", arg_names: ["x"] }],
        ["number?", { fn: (x) => x.type === TokenType.NUM, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, raw: ["token"], pure: true, doc: "Produces true if x is a number.", arg_names: ["x"] }],
        ["gcd", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["lcm", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["modulo", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["clamp", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["sign", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["hypot", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
    ])
} as const;

const STDLIB_MATH_TRIG: BuiltinSet = {
    names: ["math", "trig"],
    imports: [],
    builtins: new Map<string, BuiltinFunction>([
        ["exp", { fn: (x) => Math.exp(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the result of e^x.", arg_names: ["x"] }],
        ["log", { fn: (a, b) => Math.log(a) / Math.log(b ?? Math.E), ret_type: TokenType.NUM, arg_type: [TokenType.NUM, TokenType.NUM], min_args: 1, variadic: true, pure: true, doc: "Produces the result of ln(a) if b is not specified, and log_b(a) if b is specified.", arg_names: ["a", "[b]"] }], // TODO: Allow for max args
        ["sin", { fn: (x) => Math.sin(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the sine of x.", arg_names: ["x"] }],
        ["cos", { fn: (x) => Math.cos(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the cosine of x.", arg_names: ["x"] }],
        ["tan", { fn: (x) => Math.tan(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the tangent of x.", arg_names: ["x"] }],
        ["asin", { fn: (x) => Math.asin(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the arcsine of x.", arg_names: ["x"] }],
        ["acos", { fn: (x) => Math.acos(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the arccosine of x.", arg_names: ["x"] }],
        ["atan", { fn: (x) => Math.atan(x), ret_type: TokenType.NUM, arg_type: [TokenType.NUM], min_args: 1, pure: true, doc: "Produces the arctangent of x.", arg_names: ["x"] }],
        ["pi", { constant: true, value: TokenNum(3.141592653589793), doc: "The mathematical constant π." }],
        ["euler.0", { constant: true, value: TokenNum(2.718281828459045), doc: "Euler's constant e." }],
        ["phi.0", { constant: true, value: TokenNum(1.618033988749895), doc: "The golden ratio, φ." }],
        ["gamma.0", { constant: true, value: TokenNum(0.5772156649015329), doc: "The Euler-Mascheroni constant, γ." }],
        ["sinh", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["cosh", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["tanh", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["asinh", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["acosh", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["atanh", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["log10", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["log2", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["degrees->radians", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["radians->degrees", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["atan2", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["sec", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["csc", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["cot", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["asec", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["acsc", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["acot", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["sech", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["csch", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["coth", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["asech", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["acsch", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["acoth", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
    ])
} as const;

const STDLIB_LOGIC: BuiltinSet = {
    names: ["logic"],
    imports: [],
    builtins: new Map<string, BuiltinFunction>([
        ["not", { fn: (x) => (x.type === TokenType.BOOL && x.literal === BOOL_FALSE), ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, pure: true, raw: ["token"], doc: "Produces true if x is false; otherwise produces false.", arg_names: ["x"] }],
        ["true", { constant: true, value: TokenBool(true), doc: "The boolean value true." }],
        ["false", { constant: true, value: TokenBool(false), doc: "The boolean value false." }],
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
            },
            doc: "Evaluates expressions from left to right and produces the first false value, or the last value if none are false. Short-circuits.",
            arg_names: ["args"]
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
            },
            doc: "Evaluates expressions from left to right and produces the first non-false value, or the true if none are false. Short-circuits.",
            arg_names: ["args"]
        }],
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
            raw: ["token", "token"],
            doc: "Produces true if exactly one of a or b is not false.",
            arg_names: ["a", "b"]
        }],
        ["boolean?", { fn: (x) => x.type === TokenType.BOOL, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, raw: ["token"], pure: true, doc: "Produces true if x is a boolean.", arg_names: ["x"] }],
        ["iff", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["any?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["all?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["implies", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["nand", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["nor", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
    ])
} as const;

const STDLIB_MATH_RANDOM: BuiltinSet = {
    names: ["math", "random"],
    imports: [],
    builtins: new Map<string, BuiltinFunction>([
        ["random", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["random-range", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
    ])
} as const;

const STDLIB_DATA_LIST: BuiltinSet = {
    names: ["data", "list"],
    imports: [],
    builtins: new Map<string, BuiltinFunction>([
        ["list", { fn: (...args) => [...args], ret_type: TokenType.LIST, arg_type: [TokenType.ANY], variadic: true, min_args: 0, pure: true, doc: "Produces a list containing the given arguments", arg_names: ["elems"] }],
        ["list?", { fn: (x) => x.type === TokenType.LIST, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, raw: ["token"], pure: true, doc: "Produces true if x is a list.", arg_names: ["x"] }],
        ["pair?", { fn: (x) => x.type === TokenType.LIST && x.value.length >= 1, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], pure: true, min_args: 1, doc: "Produces true if x is a non-empty list.", arg_names: ["x"] }],
        ["cons?", { fn: (x) => x.type === TokenType.LIST && x.value.length >= 1, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], pure: true, min_args: 1, doc: "Produces true if x is a non-empty list.", arg_names: ["x"] }],
        ["null?", { fn: (x) => x.type === TokenType.LIST && x.value.length === 0, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], pure: true, min_args: 1, doc: "Produces true if x is the empty list.", arg_names: ["x"] }],
        ["empty?", { fn: (x) => x.type === TokenType.LIST && x.value.length === 0, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], pure: true, min_args: 1, doc: "Produces true if x is the empty list.", arg_names: ["x"] }],
        ["cons", { fn: (a, d) => [a, ...d], ret_type: TokenType.LIST, arg_type: [TokenType.ANY, TokenType.LIST], pure: true, min_args: 2, doc: "Produces a new list by prepending an element to a list.", arg_names: ["elem", "list"] }],
        ["empty", { constant: true, value: TokenList([]), doc: "The empty list." }],
        ["null", { constant: true, value: TokenList([]), doc: "The empty list." }],
        ["car", { fn: (p) => { if (p.length > 0) return p[0]; else throw new Error(`car: expected a pair`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the first value in a pair.", arg_names: ["pair"] }],
        ["first", { fn: (p) => { if (p.length > 0) return p[0]; else throw new Error(`first: expected a list of at least 1 element`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the first value of a non-empty list.", arg_names: ["list"] }],
        ["second", { fn: (p) => { if (p.length > 1) return p[1]; else throw new Error(`second: expected a list of at least 2 element`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the second value of a non-empty list.", arg_names: ["list"] }],
        ["third", { fn: (p) => { if (p.length > 2) return p[2]; else throw new Error(`third: expected a list of at least 3 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the third value of a non-empty list.", arg_names: ["list"] }],
        ["fourth", { fn: (p) => { if (p.length > 3) return p[3]; else throw new Error(`fourth: expected a list of at least 4 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the fourth value of a non-empty list.", arg_names: ["list"] }],
        ["fifth", { fn: (p) => { if (p.length > 4) return p[4]; else throw new Error(`fifth: expected a list of at least 5 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the fifth value of a non-empty list.", arg_names: ["list"] }],
        ["sixth", { fn: (p) => { if (p.length > 5) return p[5]; else throw new Error(`sixth: expected a list of at least 6 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the sixth value of a non-empty list.", arg_names: ["list"] }],
        ["seventh", { fn: (p) => { if (p.length > 6) return p[6]; else throw new Error(`seventh: expected a list of at least 7 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the seventh value of a non-empty list.", arg_names: ["list"] }],
        ["eighth", { fn: (p) => { if (p.length > 7) return p[7]; else throw new Error(`eighth: expected a list of at least 8 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the eighth value of a non-empty list.", arg_names: ["list"] }],
        ["ninth", { fn: (p) => { if (p.length > 8) return p[8]; else throw new Error(`ninth: expected a list of at least 9 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the ninth value of a non-empty list.", arg_names: ["list"] }],
        ["tenth", { fn: (p) => { if (p.length > 9) return p[9]; else throw new Error(`tenth: expected a list of at least 10 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the tenth value of a non-empty list.", arg_names: ["list"] }],
        ["eleventh", { fn: (p) => { if (p.length > 10) return p[10]; else throw new Error(`eleventh: expected a list of at least 11 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the eleventh value of a non-empty list.", arg_names: ["list"] }],
        ["twelfth", { fn: (p) => { if (p.length > 11) return p[11]; else throw new Error(`twelfth: expected a list of at least 12 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the twelfth value of a non-empty list.", arg_names: ["list"] }],
        ["thirteenth", { fn: (p) => { if (p.length > 12) return p[12]; else throw new Error(`thirteenth: expected a list of at least 13 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the thirteenth value of a non-empty list.", arg_names: ["list"] }],
        ["fourteenth", { fn: (p) => { if (p.length > 13) return p[13]; else throw new Error(`fourteenth: expected a list of at least 14 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the fourteenth value of a non-empty list.", arg_names: ["list"] }],
        ["fifteenth", { fn: (p) => { if (p.length > 14) return p[14]; else throw new Error(`fifteenth: expected a list of at least 15 elements`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the fifteenth value of a non-empty list.", arg_names: ["list"] }],
        ["last", { fn: (p) => { if (p.length > 0) return p.at(-1); else throw new Error(`last: expected a list of at least 1 element`) }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the last value of a non-empty list.", arg_names: ["list"] }],
        ["last-pair", { fn: (p) => { if (p.length > 0) return [p.at(-1)]; else throw new Error(`last-pair: expected a list of at least 1 element`) }, ret_type: TokenType.LIST, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the last pair of a non-empty list.", arg_names: ["list"] }],
        ["cdr", { fn: (p) => { if (p.length > 0) return p.slice(1); else throw new Error(`cdr: expected a pair`) }, ret_type: TokenType.LIST, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the second item in a pair.", arg_names: ["pair"] }],
        ["rest", { fn: (p) => { if (p.length > 0) return p.slice(1); else throw new Error(`rest: expected a list of at least 1 element`) }, ret_type: TokenType.LIST, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces everything after the first element in a list.", arg_names: ["list"] }],
        ["length", { fn: (lst) => lst.length, ret_type: TokenType.NUM, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces the number of elements in a list.", arg_names: ["list"] }],
        ["list-ref", { fn: (lst, pos) => { if (pos >= 0 && pos < lst.length) return lst[pos]; else throw new Error("list-ref: index out of range") }, ret_type: TokenType.ANY, arg_type: [TokenType.LIST, TokenType.NUM], pure: true, min_args: 2, doc: "Produces the element at index i in a list.", arg_names: ["list", "i"] }],
        // FIXME: The lst argument must start with a chain of at least pos pairs, it does not need to be a list.
        ["list-tail", { fn: (lst, pos) => { if (pos >= 0 && pos < lst.length) return lst.slice(pos); else throw new Error("list-tail: index out of range") }, ret_type: TokenType.LIST, arg_type: [TokenType.LIST, TokenType.NUM], pure: true, min_args: 2, doc: "Produces the sublist starting at index i.", arg_names: ["list", "i"] }],
        ["append", { fn: (...lsts) => [...lsts].flat(1), ret_type: TokenType.LIST, arg_type: [TokenType.LIST], pure: true, variadic: true, min_args: 0, doc: "Concatenates lists from left to right.", arg_names: ["lists"] }],
        ["reverse", { fn: (lst) => [...lst].reverse(), ret_type: TokenType.LIST, arg_type: [TokenType.LIST], pure: true, min_args: 1, doc: "Produces a list with the elements in reverse order.", arg_names: ["list"] }],
        ["take", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["drop", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["take-while", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["drop-while", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["partition", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["zip", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["unzip", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["flatten", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["remove", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["remove-duplicates", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["index-of", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["member?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["count", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
    ])
} as const;

const STDLIB_DATA_LIST_FUNCTIONAL: BuiltinSet = {
    names: ["data", "list", "functional"],
    imports: [],
    builtins: new Map<string, BuiltinFunction>([
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
            min_args: 2,
            doc: "Produces a list of length n by applying a procedure to all indices from 0 to n - 1.",
            arg_names: ["n", "proc"]
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
            raw: ["normal", "token"],
            doc: "Produces a list of length n with each element equal to v.",
            arg_names: ["n", "v"]
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
            doc: "Produces a list with the element at pos replaced by the result of applying updater to that element.",
            arg_names: ["list", "pos", "updater"]
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
            raw: ["normal", "normal", "token"],
            doc: "Produces a list with the element at pos replaced by val.",
            arg_names: ["list", "pos", "val"]
        }],
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
            min_args: 1,
            doc: "Applies a procedure element-wise to one or more lists and produces a list of results. All lists must be of the same length and the i-th argument will be the current element of the i-th list.",
            arg_names: ["proc", "lists"]
        }],
        ["andmap", {
            fn: (pred, ...lsts) => {
                const elem_count = lsts[0].length;

                if (lsts.some(l => l.length !== elem_count))
                    throw new Error(`andmap: all lists must have the same size`);

                for (let i = 0; i < elem_count; i++) {
                    const args = lsts.map(l => l[i]);
                    const result = pred(...args);
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
            min_args: 1,
            doc: "Applies a predicate element-wise and produces false on the first false result; otherwise produces the last result. All lists must be of the same length and the i-th argument will be the current element of the i-th list.",
            arg_names: ["pred", "lists"]
        }],
        ["ormap", {
            fn: (pred, ...lsts) => {
                const elem_count = lsts[0].length;

                if (lsts.some(l => l.length !== elem_count))
                    throw new Error(`ormap: all lists must have the same size`);

                for (let i = 0; i < elem_count; i++) {
                    const args = lsts.map(l => l[i]);
                    const result = pred(...args);
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
            min_args: 1,
            doc: "Applies a predicate element-wise and produces true on the first non-false result; otherwise produces false. All lists must be of the same length and the i-th argument will be the current element of the i-th list.",
            arg_names: ["pred", "lists"]
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
            min_args: 1,
            doc: "Applies a procedure element-wise for side effects and produces void. All lists must be of the same length and the i-th argument will be the current element of the i-th list.",
            arg_names: ["proc", "lists"]
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
            min_args: 1,
            doc: "Reduces lists from left to right using a combining procedure and an initial value. All lists must be of the same length and the i-th argument will be the current element of the i-th list.",
            arg_names: ["proc", "init", "lists"]
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
            min_args: 1,
            doc: "Reduces lists from right to left using a combining procedure and an initial value. All lists must be of the same length and the i-th argument will be the current element of the i-th list.",
            arg_names: ["proc", "init", "lists"]
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
            min_args: 1,
            doc: "Produces a list of intermediate left-fold results, including the initial value. All lists must be of the same length and the i-th argument will be the current element of the i-th list.",
            arg_names: ["proc", "init", "lists"]
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
            min_args: 1,
            doc: "Produces a list of intermediate right-fold results, including the initial value. All lists must be of the same length and the i-th argument will be the current element of the i-th list.",
            arg_names: ["proc", "init", "lists"]
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
            min_args: 2,
            doc: "Produces a list of elements for which the predicate produces true.",
            arg_names: ["pred", "list"]
        }],
        ["reduce", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["scanl", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["scanr", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["find", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["every?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["some?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["foldl1", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["foldr1", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["compose", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["curry", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["uncurry", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
    ])
} as const;

const STDLIB_DATA_STRING: BuiltinSet = {
    names: ["data", "string"],
    imports: [],
    builtins: new Map<string, BuiltinFunction>([
        ["string?", { fn: (x) => x.type === TokenType.STR, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, raw: ["token"], pure: true, doc: "Produces true if x is a string.", arg_names: ["x"] }],
        ["char?", { fn: (x) => x.type === TokenType.CHAR, ret_type: TokenType.BOOL, arg_type: [TokenType.ANY], min_args: 1, raw: ["token"], pure: true, doc: "Produces true if x is a char.", arg_names: ["x"] }],
        ["string->symbol", { fn: (x) => x, ret_type: TokenType.SYM, arg_type: [TokenType.STR], min_args: 1, pure: true, doc: "Converts a string to a symbol.", arg_names: ["str"] }],
        ["string->uninterned-symbol", { fn: (x) => TokenUninternedSym(x), ret_type: TokenType.ANY, arg_type: [TokenType.STR], min_args: 1, pure: true, doc: "Converts a string to a symbol.", arg_names: ["str"] }],
        ["symbol->string", { fn: (x) => x, ret_type: TokenType.STR, arg_type: [TokenType.SYM], min_args: 1, pure: true, doc: "Converts a symbol to a string.", arg_names: ["sym"] }],
        ["string-length", { fn: (x) => x.length, ret_type: TokenType.NUM, arg_type: [TokenType.STR], min_args: 1, pure: true, doc: "Produces the length of a string in characters.", arg_names: ["str"] }],
        ["string-ref", { fn: (x, i) => { if (i < x.length) return x[i]; else throw new Error("string-ref: index is out of range") }, ret_type: TokenType.CHAR, arg_type: [TokenType.STR, TokenType.NUM], min_args: 2, pure: true, doc: "Produces the character at position i in a string.", arg_names: ["str", "i"] }],
        ["string-append", { fn: (...args) => ["", ...args].reduce((acc, cur) => acc + cur), ret_type: TokenType.STR, arg_type: [TokenType.STR], min_args: 0, variadic: true, pure: true, doc: "Concatenates strings from left to right.", arg_names: ["strs"] }],
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
            pure: true,
            doc: "Produces the substring of str from index s up to, but not including e or the end of the string if e is not defined.",
            arg_names: ["str", "s", "e"]
        }],
        ["string=?", { fn: (...args) => args.every((v, i) => i === 0 || args[i - 1] === v), ret_type: TokenType.BOOL, arg_type: [TokenType.STR], min_args: 1, variadic: true, pure: true, doc: "Produces true if all strings are equal.", arg_names: ["strs"] }],
        ["string<?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string-ci=?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string-upcase", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string-downcase", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string-trim", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string-trim-left", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string-trim-right", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string-split", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string-join", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string-contains?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string-prefix?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string-suffix?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["char->integer", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["integer->char", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["string->chars", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["chars->string", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
    ])
} as const;

const STDLIB_IO: BuiltinSet = {
    names: ["io"],
    imports: [],
    builtins: new Map<string, BuiltinFunction>([
        ["print", {
            fn: (env, val) => {
                env.stdout.write(val.toString());
            },
            min_args: 1,
            arg_type: [TokenType.ANY],
            ret_type: TokenType.VOID,
            raw: ["token"],
            pure: false,
            env_param: true,
            doc: "Writes the textual representation of a value to the standard output.",
            arg_names: ["value"]
        }],
        ["println", {
            fn: (env, val) => {
                env.stdout.write(val.toString() + "\n");
            },
            min_args: 1,
            arg_type: [TokenType.ANY],
            ret_type: TokenType.VOID,
            raw: ["token"],
            pure: false,
            env_param: true,
            doc: "Writes the textual representation of a value to the standard output with a trailing newline.",
            arg_names: ["value"]
        }],
        ["display", { // FIXME: Chars and strings should print literally. Do not print unprintable characters
            fn: (env, val) => {
                if (
                    val.literal.length === 0 &&
                    (val.type === TokenType.STR || val.type === TokenType.SYM)
                ) return;

                env.stdout.write(toDisplay(val));
            },
            min_args: 1,
            arg_type: [TokenType.ANY],
            ret_type: TokenType.VOID,
            raw: ["token"],
            pure: false,
            env_param: true,
            doc: "Writes the literal value or a representation of the value if unprintable to the standard output.",
            arg_names: ["value"]
        }],
        ["displayln", {
            fn: (env, val) => {
                if (
                    val.literal.length === 0 &&
                    (val.type === TokenType.STR || val.type === TokenType.SYM)
                ) return;

                env.stdout.write(toDisplay(val) + "\n");
            },
            min_args: 1,
            arg_type: [TokenType.ANY],
            ret_type: TokenType.VOID,
            raw: ["token"],
            pure: false,
            env_param: true,
            doc: "Writes the literal value or a representation of the value if unprintable to the standard output with a trailing newline.",
            arg_names: ["value"]
        }],
        ["newline", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["flush-output", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["with-output-to-string", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["with-input-from-string", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["read", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["read-line", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["write", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
    ])
} as const;

const STDLIB_TESTING: BuiltinSet = {
    names: ["testing"],
    imports: [],
    builtins: new Map<string, BuiltinFunction>([
        ["check-expect", {
            macro: true,
            min_args: 2,
            expander: (args: ASTNode[]): ASTNode => {
                const [expr, expected] = args;

                const expanded = new ASTSExprNode(
                    ASTIdent("let"),
                    new ASTSExprNode(
                        new ASTSExprNode(
                            ASTIdent("result"),
                            expr
                        )
                    ),
                    new ASTSExprNode(
                        ASTIdent("if"),
                        new ASTSExprNode(
                            ASTIdent("equal?"),
                            ASTIdent("result"),
                            expected,
                        ),
                        ASTVoid(),
                        new ASTSExprNode(
                            ASTIdent("error"),
                            ASTStr("check-expect: test failed; expected"),
                            expected,
                            ASTStr("but got"),
                            ASTIdent("result"),
                        )
                    )
                );

                return expanded;
            },
            doc: "Checks whether the value of the expr expression is equal? to the value produced by expected. If not, an error will be thrown.",
            arg_names: ["expr", "expected"]
        }],
        ["check-satisfied", {
            macro: true,
            min_args: 2,
            expander: (args: ASTNode[]): ASTNode => {
                const [expr, pred] = args;

                let pred_name = "the predicate";
                if (pred instanceof ASTLiteralNode && pred.tok.type === TokenType.IDENT) {
                    pred_name = pred.tok.literal;
                }

                const expanded = new ASTSExprNode(
                    ASTIdent("let"),
                    new ASTSExprNode(
                        new ASTSExprNode(
                            ASTIdent("result"),
                            expr
                        )
                    ),
                    new ASTSExprNode(
                        ASTIdent("if"),
                        new ASTSExprNode(
                            pred,
                            ASTIdent("result"),
                        ),
                        ASTVoid(),
                        new ASTSExprNode(
                            ASTIdent("error"),
                            ASTStr("check-satisfied: test failed;"),
                            ASTIdent("result"),
                            ASTStr("does not satisfy"),
                            ASTStr(pred_name),
                        )
                    )
                );

                return expanded;
            },
            doc: "Checks whether the result of pred applied to expr is not false. If it is, an error will be thrown.",
            arg_names: ["expr", "pred"]
        }],
        ["check-equal?", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["check-true", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["check-false", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["check-error", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["test-case", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["test-suite", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
    ])
} as const;

const STDLIB_SYSTEM: BuiltinSet = {
    names: ["system"],
    imports: [],
    builtins: new Map<string, BuiltinFunction>([
        ["sys-exec", {
            min_args: 1,
            variadic: true,
            ret_type: TokenType.STR,
            arg_type: [TokenType.STR],
            fn: () => {
                throw new Error(`the interpreter feature ${FEAT_SYS_EXEC} must be enabled on environment creation to use sys-eval.`);
            },

            doc: "Executes a system command with space-delimited arguments and both prints and returns STDOUT. Can only be used if the `sys-eval` feature is set and the environment is not sandboxed.",
            arg_names: ["command", "args"]
        }],
        ["getenv", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["current-time", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["sleep", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["exit", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["argv", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
        ["cwd", { min_args: 0, ret_type: TokenType.ERROR, arg_type: [], fn: () => TokenError("todo") }],
    ])
} as const;

export const BRACKET_BUILTINS = new Builtins([
    STDLIB,
    STDLIB_MATH,
    STDLIB_MATH_TRIG,
    STDLIB_MATH_RANDOM,
    STDLIB_SYSTEM,
    STDLIB_TESTING,
    STDLIB_LOGIC,
    STDLIB_DATA_LIST,
    STDLIB_DATA_LIST_FUNCTIONAL,
    STDLIB_DATA_STRING,
    STDLIB_IO,
]);

function evalIf(args: ASTNode[], env: BracketEnvironment, _: TokenMetadata, ctx: InterpreterContext): Token {
    if (args.length !== 3)
        throw new Error(`if: expected 3 arguments, got ${args.length} arguments`);

    const cond = Evaluator.evalExpanded(args[0], env, ctx);

    return cond.literal !== BOOL_FALSE
        ? Evaluator.evalExpanded(args[1], env, ctx)
        : Evaluator.evalExpanded(args[2], env, ctx);
}

function evalSet(args: ASTNode[], env: BracketEnvironment, _: TokenMetadata, ctx: InterpreterContext): Token {
    if (args.length !== 2) throw new Error("set!: bad syntax");
    const [ident, expr] = args;

    if (!(ident instanceof ASTLiteralNode))
        throw new Error("set!: bad syntax; expected a literal identifier");

    if (ident.tok.type !== TokenType.IDENT)
        throw new Error("set!: bad syntax: expected an identifier");

    function mutate(sym: RuntimeSymbol, value: Token, env: BracketEnvironment) {
        if (env.bindings.has(sym.id)) {
            env.define(sym, new ASTLiteralNode(value));
        } else if (env.parent) {
            mutate(sym, value, env.parent);
        } else {
            throw new Error(`set!: cannot set variable before its definition`);
        }
    }

    mutate(ident.tok.value as RuntimeSymbol, Evaluator.evalExpanded(expr, env, ctx), env);

    return TokenVoid();
}

function evalDefine(args: ASTNode[], env: BracketEnvironment, meta: TokenMetadata, ctx: InterpreterContext): Token {
    if (args.length === 0) throw new Error("define: bad syntax; no arguments provided");
    if (args.length === 1) throw new Error("define: bad syntax; missing expression after identifier");

    const ident = args[0];
    const body_nodes = args.slice(1);

    if (ident instanceof ASTLiteralNode) {
        if (args.length > 2) throw new Error("define: bad syntax; multiple expressions after identifier");
        const final_value = Evaluator.evalExpanded(body_nodes[0], env, ctx);

        if (final_value.type === TokenType.ERROR)
            throw new Error(final_value.literal);

        if (ident.tok.type !== TokenType.IDENT)
            throw new Error(`define: expected an Ident, found ${TOKEN_PRINT_TYPE_MAP[ident.tok.type]}`);

        env.define(ident.tok.value as RuntimeSymbol, new ASTLiteralNode(final_value, meta));
    } else if (ident instanceof ASTSExprNode) {
        if (ident.elements.length === 0)
            throw new Error(`define: bad syntax; no function name or arguments provided`);

        if (ident.elements.some(e => e instanceof ASTSExprNode))
            throw new Error(`define: not an identifier; expected a literal, instead found a list`);

        if ((ident.elements as ASTLiteralNode[]).some(e => e.tok.type !== TokenType.IDENT))
            throw new Error(`define: expected an Ident, found ${TOKEN_PRINT_TYPE_MAP[(ident.elements as ASTLiteralNode[]).find(e => e.tok.type !== TokenType.IDENT)!.tok.type]}`);

        const name = (ident.first as ASTLiteralNode).tok.literal;
        const sym = (ident.first as ASTLiteralNode).tok.value as RuntimeSymbol;
        const params = (ident.rest as ASTLiteralNode[]).map(a => a.tok.value as RuntimeSymbol);

        const procedure = new ASTProcedureNode(name, params, body_nodes, env);
        const proc_token = TokenProc(procedure);
        const proc_literal = new ASTLiteralNode(proc_token, meta);

        procedure.closure.define(sym, proc_literal);

        env.define(sym, proc_literal);
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

    const params: RuntimeSymbol[] = [];

    for (const p of params_node.elements) {
        if (!(p instanceof ASTLiteralNode) || p.tok.type !== TokenType.IDENT)
            throw new Error(`lambda: bad syntax; parameters must be identifiers`);
        params.push(p.tok.value as RuntimeSymbol);
    }

    const proc = new ASTProcedureNode(
        "lambda",
        params,
        body_nodes,
        env,
    );

    return TokenProc(proc, params_node.meta);
}

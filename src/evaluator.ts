import { ASTNode, ASTProcedureNode, ASTSExprNode, ASTLiteralNode, ASTVoid } from "./ast.js";
import { Token, ValueType, TokenType, TokenVoid, TokenError, TokenList } from "./token.js";
import { TEMP_ENVIRONMENT_LABEL, JS_PRINT_TYPE_MAP, TOKEN_PRINT_TYPE_MAP, VALUE_TYPE_JS_TYPE_MAP, ARGUMENT_TYPE_COERCION, RETURN_TYPE_COERCION, BOOL_FALSE } from "./globals.js";
import { BracketEnvironment } from "./env.js";

export type MacroExpander = (args: ASTNode[], env: BracketEnvironment) => ASTNode;

export type BuiltinFunction =
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

export class Evaluator {
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

            let result = ASTVoid().tok;
            for (const expr of fn.body) {
                result = Evaluator.evalExpanded(expr, closure);
                if (result.type === TokenType.ERROR)
                    return result;
            }

            return result;
        };
    }
};

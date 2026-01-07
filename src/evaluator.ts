import { ASTNode, ASTProcedureNode, ASTSExprNode, ASTLiteralNode, ASTProgram, ASTIdent } from "./ast.js";
import { Token, ValueType, TokenType, TokenVoid, TokenError, TokenList, TokenMetadata, TokenIdent } from "./token.js";
import { TEMP_ENVIRONMENT_LABEL, JS_PRINT_TYPE_MAP, TOKEN_PRINT_TYPE_MAP, VALUE_TYPE_JS_TYPE_MAP, ARGUMENT_TYPE_COERCION, RETURN_TYPE_COERCION, STDOUT, InterpreterContext, getDefaultReaderFeatures, LANG_NAME, VERSION_NUMBER } from "./globals.js";
import { BracketEnvironment } from "./env.js";

export type MacroExpander = (args: ASTNode[], env: BracketEnvironment) => ASTNode;

export type BuiltinFunction =
    ({ constant: true } & { value: Token, doc?: string }) |
    (({ constant?: false } & (
        ({ special: true } & { special_fn: (args: ASTNode[], env: BracketEnvironment, meta: TokenMetadata) => Token }) |
        ({ special?: false } &
            ({ macro: true } & {
                expander: MacroExpander,
            } | { macro?: false } & {
                fn: (...args: any) => any,
                ret_type: ValueType,
                arg_type: ValueType[],
                raw?: ("token" | "normal")[],
                eval_strategy?: "normal" | "lazy",
                env_param?: boolean,
            }) & {
                min_args: number,
                arg_predicates?: ((v: any) => boolean)[],
                error_messsage?: string,
                pure?: boolean,
                constant_fold?: boolean,
                memoize?: boolean,
            })))) & {
                variadic?: boolean,
                arg_names?: string[],
                doc?: string,
            };

export class Evaluator {
    ctx: InterpreterContext = {
        file_directives: new Map(),
        features: new Set(),
    }

    constructor(features: string[] | Set<string> = [], file_directives: Map<string, string> = new Map()) {
        this.ctx.features = new Set([
            ...features,
            ...getDefaultReaderFeatures(LANG_NAME, VERSION_NUMBER)
        ]);

        this.ctx.file_directives = file_directives;
    }

    evaluate(ast: ASTNode, env?: BracketEnvironment): Token {
        const real_env = env ?? new BracketEnvironment(TEMP_ENVIRONMENT_LABEL);
        const expanded = Evaluator.expand(ast, real_env);
        return Evaluator.evalExpanded(expanded, real_env);
    }

    evaluateProgram(program: ASTProgram, env?: BracketEnvironment, stdout = STDOUT, print_intermediate = true): Token {
        if (!env) env = new BracketEnvironment(program.name, undefined, stdout);

        let last = TokenVoid();

        for (const form of program.forms) {
            const result = this.evaluate(form, env);
            if (result.type !== TokenType.EOF &&
                result.type !== TokenType.VOID &&
                result.type !== TokenType.META) {
                last = result;

                if (print_intermediate) {
                    stdout.write(result.toString());
                    stdout.write("\n");
                }
            }
        }

        return last;
    }

    static evalExpanded(ast: ASTNode, env: BracketEnvironment): Token {
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
                        return builtin.special_fn([], env, ast.meta);

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
                return builtin.special_fn(node.rest, env, op.meta);

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
                const result = Evaluator.callBuiltin(env, op.literal, args, op.meta);
                return result;
            } catch (err) {
                const msg = (err as any).message ?? String(err);
                return TokenError(msg, op.meta);
            }
        }

        const proc = Evaluator.procedureToJS(op, env);

        const args = node.rest.map(e =>
            Evaluator.evalExpanded(e, env));

        return proc(...args);
    }

    static expand(ast: ASTNode, env: BracketEnvironment): ASTNode {
        if (ast instanceof ASTLiteralNode) return ast;
        if (ast instanceof ASTProcedureNode) { throw new Error("procedure node appeared during macro expansion"); }
        if (ast.elements.length === 0) return ast;

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
                console.log(expanded_op.tok.literal);
                // if (!result.meta) result.meta = { row: -1, col: -1 };
                // result.meta["__macro"] = ;
                return Evaluator.expand(result, env);
            }
        }

        const expanded_args = ast.rest.map(arg => Evaluator.expand(arg, env));

        const final_result = new ASTSExprNode(expanded_op, ...expanded_args);
        return final_result;
    }

    static callBuiltin(env: BracketEnvironment, fn_name: string, args: Token[], meta: TokenMetadata): Token {
        if (!env.builtins.has(fn_name)) throw new Error(`${fn_name}: this function is not defined`);

        const builtin = env.builtins.get(fn_name)!;

        if (builtin.constant) return builtin.value.withPos(meta.row, meta.col);

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
            const current_raw_type = builtin.raw
                ? (i >= builtin.raw.length
                    ? builtin.raw.at(-1)
                    : builtin.raw[i])
                : (current_arg_type === TokenType.ANY ? "token" : "normal");

            let arg = args[i];

            if (current_arg_type === TokenType.ANY) {
                if (current_raw_type !== "token")
                    throw new Error(`Functions with arguments of type Any must take in a raw token. Got ${TOKEN_PRINT_TYPE_MAP[args[i].type]} ${args[i].toString()}`);

                typed_args.push(arg);
                continue;
            }

            if (current_arg_type === TokenType.PROCEDURE) {
                if (arg.type === TokenType.PROCEDURE || arg.type === TokenType.IDENT) {
                    typed_args.push((current_raw_type === "token") ? arg : ARGUMENT_TYPE_COERCION[current_arg_type](args[i], env));
                } else {
                    throw new Error(`Unexpected type. Expected ${TOKEN_PRINT_TYPE_MAP[current_arg_type]}, got ${TOKEN_PRINT_TYPE_MAP[args[i].type]} ${args[i].toString()}`);
                }

                continue;
            }

            if (arg.type !== current_arg_type) {
                throw new Error(`Unexpected type. Expected ${TOKEN_PRINT_TYPE_MAP[current_arg_type]}, got ${TOKEN_PRINT_TYPE_MAP[arg.type]} ${args[i].toString()}`);
            }

            typed_args.push((current_raw_type === "normal") ? ARGUMENT_TYPE_COERCION[current_arg_type](arg, env) : args[i]);
        }

        let result = builtin.env_param
            ? builtin.fn(env, ...typed_args)
            : builtin.fn(...typed_args);

        if (builtin.ret_type === TokenType.ANY) {
            if (!(result instanceof Token))
                throw new Error(`Functions of return type Any must return a raw token. Got ${JS_PRINT_TYPE_MAP[typeof result]} (${result})`);

            return result;
        }

        if (builtin.ret_type === TokenType.VOID)
            return TokenVoid(meta);

        if (builtin.ret_type === TokenType.LIST) {
            if (!Array.isArray(result))
                throw new Error(`Unexpected return type. Expected ${TOKEN_PRINT_TYPE_MAP[TokenType.LIST]}, got ${JS_PRINT_TYPE_MAP[typeof result]} (${result})`);

            return TokenList(result, meta);
        }

        if (typeof result !== VALUE_TYPE_JS_TYPE_MAP[builtin.ret_type])
            throw new Error(`Unexpected return type. Expected ${TOKEN_PRINT_TYPE_MAP[builtin.ret_type]}, got ${JS_PRINT_TYPE_MAP[typeof result]} (${result})`)

        return new Token(builtin.ret_type, RETURN_TYPE_COERCION[builtin.ret_type](result), meta);
    }

    static procedureToJS(tok: Token, env: BracketEnvironment): (...args: Token[]) => Token {
        const evaluated = Evaluator.evalExpanded(new ASTLiteralNode(tok), env);

        if (env.builtins.has(evaluated.literal)) {
            return (...args: Token[]) =>
                Evaluator.callBuiltin(env, evaluated.literal, args, evaluated.meta)
        }

        if (evaluated.type !== TokenType.PROCEDURE) {
            throw new Error(`application: not a procedure: expected a procedure that can be applied to arguments`);
        }

        if (!(evaluated.value instanceof ASTProcedureNode))
            throw new Error(`malformed Procedure token`);

        const fn = evaluated.value;

        return (...args: Token[]) => {
            if (args.length !== fn.params.length)
                throw new Error(`arity mismatch: expected ${fn.params.length} arguments, got ${args.length} arguments`);

            const closure = new BracketEnvironment("", fn.closure); // TODO: Label

            for (let i = 0; i < args.length; i++)
                closure.define(fn.params[i], new ASTLiteralNode(args[i]));

            let result = TokenVoid();
            for (const expr of fn.body) {
                result = Evaluator.evalExpanded(expr, closure);
                if (result.type === TokenType.ERROR) return result;
            }

            return result;
        }
    }
};

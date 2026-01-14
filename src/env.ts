import { ASTNode } from "./ast.js";
import { InterpreterContext, STDOUT } from "./globals.js";
import { BuiltinFunction } from "./evaluator.js";
import { Output } from "./utils.js";
import { BRACKET_BUILTINS, Builtins } from "./stdlib.js";
import { RuntimeSymbol } from "./token.js";

export class BracketEnvironment {
    private readonly __parent?: BracketEnvironment;
    private readonly __label: string;
    private readonly __stdout: Output;
    private readonly __ctx: InterpreterContext;
    private __bindings: Map<number, ASTNode> = new Map();
    private __builtins: Builtins;

    constructor(label: string, ctx: InterpreterContext, parent?: BracketEnvironment, stdout: Output = STDOUT) {
        this.__label = label;
        this.__parent = parent;
        this.__stdout = stdout;

        this.__ctx = ctx;

        if (this.parent && this.parent.stdout)
            this.__stdout = this.parent.stdout;

        if (!this.parent) {
            this.__builtins = BRACKET_BUILTINS;
        } else {
            this.__builtins = this.parent!.builtins;
        }
    }

    get label_raw() { return this.__label; }
    get label_chained(): string { return this.__parent ? `${this.__parent.label_chained}:${this.label_raw}` : this.label_raw };
    get label() { return `${this.label_chained}`; }
    get bindings() { return this.__bindings; }
    get parent() { return this.__parent; }
    get builtins() { return this.__builtins; }
    get stdout() { return this.__stdout; }
    get ctx() { return this.__ctx; }

    define(sym: RuntimeSymbol, node: ASTNode) {
        return this.__bindings.set(sym.id, node);
    }

    get(sym: RuntimeSymbol): ASTNode | undefined {
        if (this.__bindings.has(sym.id)) {
            return this.__bindings.get(sym.id);
        }
        return this.__parent?.get(sym);
    }

    has(sym: RuntimeSymbol): boolean {
        if (this.__bindings.has(sym.id)) return true;
        return this.__parent?.has(sym) ?? false;
    }

    public setBuiltin(ident: string, builtin: BuiltinFunction) {
        this.builtins.set(ident, builtin);
    }

    public removeBuiltin(ident: string) {
        return this.builtins.delete(ident);
    }

    static copy(env: BracketEnvironment) {
        const cp = new BracketEnvironment(env.label_raw, env.__ctx, env.__parent);
        cp.__bindings = new Map(env.bindings);

        return cp;
    }
};

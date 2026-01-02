import { ASTNode } from "./ast.js";
import { STDOUT } from "./globals.js";
import { BuiltinFunction } from "./evaluator.js";
import { Output } from "./utils.js";
import { STDLIB } from "./stdlib.js";

export class BracketEnvironment {
    private readonly __parent?: BracketEnvironment;
    private readonly __label: string;
    private readonly __stdout: Output;
    private __bindings: Map<string, ASTNode> = new Map();
    private __builtins: Map<string, BuiltinFunction> = STDLIB;

    constructor(label: string, parent?: BracketEnvironment, stdout: Output = STDOUT) {
        this.__label = label;
        this.__parent = parent;
        this.__stdout = stdout;

        if (this.parent && this.parent.stdout)
            this.__stdout = this.parent.stdout;
    }

    get label_raw() { return this.__label; }
    get label_chained(): string { return this.__parent ? `${this.__parent.label_chained}:${this.label_raw}` : this.label_raw };
    get label() { return `${this.label_chained}`; }
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

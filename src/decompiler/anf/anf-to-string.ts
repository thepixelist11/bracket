import { ANF, ANFApp, ANFIf, ANFLambda, ANFLet, ANFLiteral, ANFProgram, ANFVar } from "../../ir/anf.js";
import { RuntimeSymbol } from "../../parser/token.js";

function symToString(sym: RuntimeSymbol): string {
    return sym.name.length > 0 ? sym.name : `v${sym.id}`;
}

export function ANFToString(node: ANF): string {
    if (node instanceof ANFLiteral) return node.value.literal;

    if (node instanceof ANFVar) return symToString(node.sym);

    if (node instanceof ANFLambda) {
        const params = node.params.map(p => p.name).join(" ");
        const body_str = ANFToString(node.body);

        return `(λ (${params}) ${body_str})`;
    }

    if (node instanceof ANFApp) {
        const callee = ANFToString(node.callee);
        const args = node.args.map(a => ANFToString(a));

        return `(${callee} ${args.join(" ")})`;
    }

    if (node instanceof ANFLet) {
        const name_str = symToString(node.sym);
        const value_str = ANFToString(node.value);
        const body_str = ANFToString(node.body);

        return `\n  (let (${name_str} ${value_str}) ${body_str})`;
    }

    if (node instanceof ANFIf) {
        const cond_str = ANFToString(node.cond);
        const then_str = ANFToString(node.then_branch);
        const else_str = ANFToString(node.else_branch);

        return `(if ${cond_str} ${then_str} ${else_str})`;
    }

    throw new Error("Unknown ANF node type.");
}

export function ANFProgramToString(program: ANFProgram): string {
    return `(program ${program.name} ${ANFToString(program.body)})`;
}


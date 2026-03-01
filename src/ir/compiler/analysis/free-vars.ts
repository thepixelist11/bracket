import { ANFApp, ANFExpr, ANFIf, ANFLambda, ANFLet, ANFLiteral, ANFVar } from "../../anf.js";
import { BCInternTable } from "../bytecode/intern-table.js";

export function collectFreeVars(expr: ANFExpr, bound: Set<number>, free: Set<number>) {
    if (expr instanceof ANFVar) {
        const name = expr.sym.id;
        if (!bound.has(name)) {
            free.add(name);
        }

        return;
    }

    if (expr instanceof ANFLiteral) return;
    if (expr instanceof ANFLambda) return;

    if (expr instanceof ANFApp) {
        collectFreeVars(expr.callee, bound, free);
        for (const arg of expr.args)
            collectFreeVars(arg, bound, free);
        return;
    }

    if (expr instanceof ANFIf) {
        collectFreeVars(expr.cond, bound, free);
        collectFreeVars(expr.then_branch, bound, free);
        collectFreeVars(expr.else_branch, bound, free);
    }

    if (expr instanceof ANFLet) {
        collectFreeVars(expr.value, bound, free);

        const name = expr.sym.id;
        bound.add(name);
        collectFreeVars(expr.body, bound, free);
        bound.delete(name);
        return;
    }
}

export function computeFreeVars(lambda: ANFLambda, intern_table: BCInternTable): number[] {
    const bound = new Set<number>();

    for (const param of lambda.params) {
        bound.add(param.id);
    }

    const free = new Set<number>();
    collectFreeVars(lambda.body, bound, free);

    return Array.from(free).map(sym =>
        intern_table.internBCSymbol(sym));
}


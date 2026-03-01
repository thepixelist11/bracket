import { RuntimeSymbol } from "../parser/token.js";

type PrimitiveInfo = {
    name: string;
    arity: number;
    proc_index: number;
};

export const BRACKET_PRIMITIVES: PrimitiveInfo[] = [
    { name: "__add_2", arity: 2, proc_index: 0 },
    { name: "__sub_2", arity: 2, proc_index: 1 },
    { name: "__mul_2", arity: 2, proc_index: 2 },
    { name: "__div_2", arity: 2, proc_index: 3 },
    { name: "__eq_2", arity: 2, proc_index: 4 },
    { name: "__lt_2", arity: 2, proc_index: 5 },
    { name: "__gt_2", arity: 2, proc_index: 6 },
    { name: "__not", arity: 1, proc_index: 7 },
] as const;

export function lookupPrimitive(id: RuntimeSymbol, primitives = BRACKET_PRIMITIVES) {
    return primitives.find(v => v.proc_index === id.id && v.name === id.name);
}

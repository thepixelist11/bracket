import { BCInstrCode } from "./compiler";

type PrimitiveInfo = {
    name: string;
    arity: number;
    proc_index: number;
};

export const BRACKET_PRIMITIVES: PrimitiveInfo[] = [
    { name: "+", arity: 2, proc_index: 0 },
    { name: "-", arity: 2, proc_index: 1 },
    { name: "*", arity: 2, proc_index: 2 },
    { name: "/", arity: 2, proc_index: 3 },
    { name: "=", arity: 2, proc_index: 4 },
    { name: "<", arity: 2, proc_index: 5 },
    { name: ">", arity: 2, proc_index: 6 },
    { name: "not", arity: 1, proc_index: 7 },
] as const;

export function lookupPrimitive(name: string, primitives = BRACKET_PRIMITIVES) {
    return primitives.find(v => v.name === name);
}

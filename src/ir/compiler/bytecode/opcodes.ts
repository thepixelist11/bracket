import { Byte } from "../../../shared/utils/binary/types.js";
import { BCData } from "./data.js";

export const enum BCInstrCode {
    RETURN = 0x00,
    LOAD_CONST = 0x01,
    LOAD_VAR = 0x02,
    STORE_VAR = 0x03,
    JMP = 0x04,
    JMP_TRUE = 0x05,
    JMP_FALSE = 0x06,
    LABEL = 0x07,
    CALL = 0x08,
    TAILCALL = 0x09,
    MAKE_CLOSURE = 0x0a,
    LOAD_CLOSURE = 0x0b,
    STORE_CLOSURE = 0x0c,
    POP = 0x0d,
    HALT = 0x0e,
};

export const BCInstrPrintMap = new Map<Byte, string>([
    [BCInstrCode.RETURN, "RETURN"],
    [BCInstrCode.LOAD_CONST, "LOAD_CONST"],
    [BCInstrCode.LOAD_VAR, "LOAD_VAR"],
    [BCInstrCode.STORE_VAR, "STORE_VAR"],
    [BCInstrCode.JMP, "JMP"],
    [BCInstrCode.JMP_TRUE, "JMP_TRUE"],
    [BCInstrCode.JMP_FALSE, "JMP_FALSE"],
    [BCInstrCode.LABEL, "LABEL"],
    [BCInstrCode.CALL, "CALL"],
    [BCInstrCode.TAILCALL, "TAILCALL"],
    [BCInstrCode.MAKE_CLOSURE, "MAKE_CLOSURE"],
    [BCInstrCode.LOAD_CLOSURE, "LOAD_CLOSURE"],
    [BCInstrCode.STORE_CLOSURE, "STORE_CLOSURE"],
    [BCInstrCode.POP, "POP"],
    [BCInstrCode.HALT, "HALT"],
]);

export const BCInstrArityMap = new Map<BCInstrCode, number>([
    [BCInstrCode.MAKE_CLOSURE, 2],

    [BCInstrCode.LOAD_CONST, 1],
    [BCInstrCode.LOAD_VAR, 1],
    [BCInstrCode.STORE_VAR, 1],
    [BCInstrCode.JMP, 1],
    [BCInstrCode.JMP_TRUE, 1],
    [BCInstrCode.JMP_FALSE, 1],
    [BCInstrCode.CALL, 1],
    [BCInstrCode.TAILCALL, 1],
    [BCInstrCode.LOAD_CLOSURE, 1],
    [BCInstrCode.STORE_CLOSURE, 1],

    [BCInstrCode.RETURN, 0],
    [BCInstrCode.POP, 0],
    [BCInstrCode.HALT, 0],
]);

export class BCInstr {
    args: BCData[];

    constructor(
        public readonly op: BCInstrCode,
        ...args: BCData[]
    ) { this.args = args; }

    rawArgs() {
        return this.args.map(a => Array.from(a.raw()));
    }
}


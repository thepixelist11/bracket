import { BCInteger, BCString } from "./data.js";
import { BCInstr, BCInstrArityMap, BCInstrCode } from "./opcodes.js";

type EmitFn = (instr: BCInstr) => void;

export function createEmitter(): {
    instructions: BCInstr[];
    emit: EmitFn;
    label(name: string): void;
    patch_labels(): void;
} {
    const instructions: BCInstr[] = [];
    const label_positions = new Map<string, number>();
    const pending: { index: number; name: string }[] = [];
    const instr_offsets: number[] = [];

    let byte_offset = 0;

    const emit: EmitFn = (instr) => {
        if (instr.op !== BCInstrCode.LABEL) {
            const expected = BCInstrArityMap.get(instr.op) ?? 0;
            if (instr.args.length !== expected)
                throw new Error(`arity mismatch: opcode ${instr.op} expected ${expected} args; got ${instr.args.length}`);
        }

        if (instr.op === BCInstrCode.LABEL) {
            const arg = instr.args[0];
            if (!(arg instanceof BCString))
                throw new Error("expected a string label");

            label_positions.set(arg.value, instructions.length);
            return;
        }

        if (
            instr.op === BCInstrCode.JMP ||
            instr.op === BCInstrCode.JMP_TRUE ||
            instr.op === BCInstrCode.JMP_FALSE
        ) {
            const arg = instr.args[0];

            if (arg instanceof BCString) {
                pending.push({
                    index: instructions.length,
                    name: arg.value
                });

                // We overwrite the string argument with an integer placeholder
                // to ensure that the byte offset is correct, as the final value
                // will be an integer.
                instr.args[0] = new BCInteger(0);
            } else if (arg instanceof BCInteger) {
                console.log("INT");
            }
        }

        instr_offsets.push(byte_offset);
        instructions.push(instr);

        byte_offset++;
        for (const arg of instr.args)
            byte_offset += arg.raw().length;
    }

    const label = (name: string) => emit(new BCInstr(BCInstrCode.LABEL, new BCString(name)));
    const patch_labels = () => {
        for (const patch of pending) {
            const target = label_positions.get(patch.name);
            if (target === undefined)
                throw new Error(`unknown label: ${patch.name}`);

            const instr = instructions[patch.index];
            const rel = target - patch.index;

            instr.args[0] = new BCInteger(rel);
        }
    };

    return { instructions, emit, label, patch_labels };
}


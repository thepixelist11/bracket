export function splitUint8(value: number): Uint8Array {
    return new Uint8Array([
        value & 0xFF,
    ]);
}

export function splitUint16(value: number): Uint8Array {
    return new Uint8Array([
        value & 0xFF,
        (value >>> 8) & 0xFF,
    ]);
}

export function splitUint32(value: number): Uint8Array {
    return new Uint8Array([
        value & 0xFF,
        (value >>> 8) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 24) & 0xFF,
    ]);
}

export function splitInt8(value: number): Uint8Array {
    value = Math.min(127, Math.max(-128, value));
    return new Uint8Array([
        value & 0xFF,
    ]);
}

export function splitInt16(value: number): Uint8Array {
    value = Math.min(32767, Math.max(-32768, value));
    return new Uint8Array([
        value & 0xFF,
        (value >> 8) & 0xFF,
    ]);
}

export function splitInt32(value: number): Uint8Array {
    value = Math.min(2147483647, Math.max(-2147483648, value));
    return new Uint8Array([
        value & 0xFF,
        (value >>> 8) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 24) & 0xFF,
    ]);
}


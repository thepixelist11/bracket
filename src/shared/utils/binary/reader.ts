export function readUint8(value: Uint8Array, offset: number = 0): number {
    return value[offset];
}

export function readUint16(value: Uint8Array, offset: number = 0): number {
    return value[offset] +
        (value[offset + 1] << 8);
}

export function readUint32(value: Uint8Array, offset: number = 0): number {
    return value[offset] +
        (value[offset + 1] << 8) +
        (value[offset + 2] << 16) +
        (value[offset + 3] << 24);
}

export function readInt8(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 1);
    const view = new DataView(data.buffer);
    return view.getInt8(0);
}

export function readInt16(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 2);
    const view = new DataView(data.buffer);
    return view.getInt16(0, true);
}

export function readInt32(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 4);
    const view = new DataView(data.buffer);
    return view.getInt32(0, true);
}

export function readFloat16(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 2);
    const view = new DataView(data.buffer);
    return view.getFloat16(0, true);
}

export function readFloat32(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 4);
    const view = new DataView(data.buffer);
    return view.getFloat32(0, true);
}

export function readFloat64(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 8);
    const view = new DataView(data.buffer);
    return view.getFloat64(0, true);
}

export function readString(value: Uint8Array, offset: number = 0): string {
    const length = value[0];
    const encoded = new Uint8Array(value.slice(offset + 1, offset + length + 1));
    return new TextDecoder().decode(encoded);
}


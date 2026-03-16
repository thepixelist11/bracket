export type IterValue<T> = T extends Iterable<infer U> ? U : never;

export interface Position {
    row: number;
    col: number;
    idx: number;
    file: string;
}

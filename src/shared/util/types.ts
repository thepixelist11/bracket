export type IterValue<T> = T extends Iterable<infer U> ? U : never;

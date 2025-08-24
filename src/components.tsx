import { createMemo, mapArray } from "./lib";
import type { JSX } from "./jsx.d.ts";

export function For<A>(props: { items: A[], children: (x: A) => JSX.Element, }): JSX.Element {
  return createMemo(mapArray(
    () => props.items,
    props.children
  )) as unknown as JSX.Element;
}


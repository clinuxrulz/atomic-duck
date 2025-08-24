import { createMemo, mapArray } from ".";
import type { JSX } from "./jsx.d.ts";

export function For<A>(props: { items: A[], children: (x: A) => JSX.Element, }): JSX.Element {
  let r = createMemo(mapArray(
    () => props.items,
    props.children
  ));
  return r as unknown as JSX.Element;
}


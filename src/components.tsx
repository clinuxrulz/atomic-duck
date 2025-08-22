import { createMemo, mapArray } from ".";
import type { JSX } from "./jsx-runtime";

export function For<A>(props: { items: A[], children: (x: A) => JSX.Element, }): JSX.Element {
  let r = createMemo(mapArray(
    () => props.items,
    props.children
  ));
  return (<>{r()}</>);
}


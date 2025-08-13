import { createEffect, createMemo, createSignal } from "."

export function setupCounters(
  element1: HTMLButtonElement,
  element2: HTMLButtonElement,
  element3: HTMLDivElement,
) {
  let [ counter1, setCounter1, ] = createSignal(2);
  let [ counter2, setCounter2, ] = createSignal(3);
  createEffect(() => {
    counter1((x) => {
      element1.innerText = `count1 is ${x}`;
    });
  });
  createEffect(() => {
    counter2((x) => {
      element2.innerText = `count2 is ${x}`;
    });
  });
  let result = createMemo<number>((ret) => {
    counter1((x) =>
      counter2((y) =>
        ret(x * y)
      )
    );
  });
  createEffect(() => {
    result((x) => {
      element3.innerText = `count1 * count2 = ${x}`;
    })
  });
  element1.addEventListener("click", () => {
    counter1((x) => setCounter1(x + 1));
  });
  element2.addEventListener("click", () => {
    counter2((x) => setCounter2(x + 1));
  });
}

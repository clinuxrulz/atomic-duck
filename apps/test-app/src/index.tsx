import { createSignal, render, For, createSelector } from "atomic-duck";

render(
  () => {
    let [ count, setCount, ] = createSignal(0);
    let [ history, setHistory, ] = createSignal<{ id: number, value: number, }[]>([]);
    let [ selected, setSelected, ] = createSignal<number>();
    let isSelected = createSelector(selected);
    let nextId = 0;
    return (
      <div>
        Count: {count()}<br/>
        <button
          onClick={() => {
            setHistory([ ...history(), { id: nextId++, value: count(), }, ]);
            setCount(count() + 1);
          }}
        >
          +
        </button><br/>
        <button
          onClick={() => {
            setHistory([ ...history(), { id: nextId++, value: count(), }, ]);
            setCount(count() - 1);
          }}
        >
          -
        </button><br/>
        History:<br/>
        <ul>
          <For items={history()}>
            {(h) => (
              <li
                style={{
                  color: isSelected(h.id) ? "blue" : "black"
                }}
                onClick={() => {
                  setSelected(h.id);
                }}
              >
                {h.value}
              </li>
            )}
          </For>
        </ul>
      </div>
    );
  },
  document.getElementById("root"),
);

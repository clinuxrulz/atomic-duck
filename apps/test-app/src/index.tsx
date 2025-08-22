import { createSignal, render, For } from "atomic-duck";

render(
  () => {
    let [ count, setCount, ] = createSignal(0);
    let [ history, setHistory, ] = createSignal([]);
    return (
      <div>
        Count: {count()}<br/>
        <button
          onClick={() => {
            setHistory([...history(), count()]);
            setCount(count() + 1);
          }}
        >
          +
        </button><br/>
        <button
          onClick={() => {
            setHistory([...history(), count()]);
            setCount(count() - 1);
          }}
        >
          -
        </button><br/>
        History:<br/>
        <ul>
          <For items={history()}>
            {(h) => (<li>{h()}</li>)}
          </For>
        </ul>
      </div>
    );
  },
  document.getElementById("root"),
);

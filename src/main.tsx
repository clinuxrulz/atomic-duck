import './style.css';
import typescriptLogo from './typescript.svg';
import viteLogo from '/vite.svg';
import { setupCounters } from './counter.ts';
import { createRoot } from './index.ts';

let dispose = createRoot((dispose) => {
  let mainDiv = (
    <div>
      <a href="https://vite.dev" target="_blank">
        <img src={viteLogo} class="logo" alt="Vite logo" />
      </a>
      <a href="https://www.typescriptlang.org/" target="_blank">
        <img src={typescriptLogo} class="logo vanilla" alt="TypeScript logo" />
      </a>
      <h1>Vite + TypeScript</h1>
      <div class="card">
        <button id="counter1" type="button"></button>
      </div>
      <div class="card">
        <button id="counter2" type="button"></button>
      </div>
      <div class="card">
        <div id="result"></div>
      </div>
      <p class="read-the-docs">
        Click on the Vite and TypeScript logos to learn more
      </p>
    </div>
  ) as HTMLDivElement;
  document.querySelector<HTMLDivElement>('#app')!.appendChild(mainDiv);
  return dispose;
});

setupCounters(
  document.querySelector<HTMLButtonElement>('#counter1')!,
  document.querySelector<HTMLButtonElement>('#counter2')!,
  document.querySelector<HTMLDivElement>('#result')!,
);
